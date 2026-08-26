import { cloudlessCommand } from "./cloudless-env.ts";
import type { FactoryHostExecutor, HostExecutorRegistry } from "./host.ts";
import { SUPABASE_CLI_BASELINE } from "./migrations.ts";
import type { ProjectPlacement, ProjectScheduler } from "./placement.ts";
import type { SecretStore } from "./secrets.ts";
import type { ResolvedFactoryManifest } from "./types.ts";

export interface StoredBackupArtifact {
  ref: string;
  sha256: string;
  encrypted: true;
}

export interface BackupArtifactStoreInput {
  projectId: string;
  backupId: string;
  stagingDirectory: string;
  /** Runtime files containing credentials. The store MUST encrypt these at rest. */
  secretFilePaths: readonly string[];
  /** Sensitive values that must never be written to plaintext staging files. */
  sensitiveValues: Readonly<Record<string, string>>;
  metadata: Readonly<Record<string, unknown>>;
}

export interface BackupArtifactStore {
  store(input: BackupArtifactStoreInput): Promise<StoredBackupArtifact>;
  verify(artifact: StoredBackupArtifact): Promise<boolean>;
}

export interface StorageBackupReference {
  ref: string;
  objectCount?: number;
  checksum?: string;
}

export interface StorageBackupProvider {
  backup(input: {
    projectId: string;
    backupId: string;
    manifest: ResolvedFactoryManifest;
    placement: ProjectPlacement;
  }): Promise<StorageBackupReference>;
  verify(reference: StorageBackupReference): Promise<boolean>;
}

export interface PitrCheckpoint {
  provider: string;
  checkpoint: string;
  recoverable: true;
}

export interface PitrProvider {
  checkpoint(input: {
    projectId: string;
    backupId: string;
    manifest: ResolvedFactoryManifest;
    placement: ProjectPlacement;
  }): Promise<PitrCheckpoint>;
}

export interface ProjectBackupRecord {
  version: 1;
  projectId: string;
  backupId: string;
  createdAt: string;
  supabaseRelease: string;
  upstreamCommit: string;
  postgresMajor: 15 | 17;
  cliVersion: string;
  database: {
    roles: true;
    schema: true;
    data: true;
    pgsodiumRootKey: true;
  };
  runtimeConfigIncluded: true;
  storage?: StorageBackupReference | { bundledFileBackend: true };
  pitr?: PitrCheckpoint;
  artifact: StoredBackupArtifact;
  verified: true;
  cloudManagementCredentialsRequired: false;
}

function backupId(now: Date): string {
  return now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function parseCliVersion(output: string): string {
  const match = output.match(/\b(\d+\.\d+\.\d+)\b/);
  if (!match) throw new Error(`could not parse Supabase CLI version from: ${output.trim()}`);
  return match[1];
}

function redact(value: string, secrets: readonly string[]): string {
  let safe = value;
  for (const secret of secrets) {
    if (!secret) continue;
    safe = safe.split(secret).join("[REDACTED]");
    try { safe = safe.split(encodeURIComponent(secret)).join("[REDACTED]"); } catch {}
  }
  return safe;
}

export class DockerProjectBackupController {
  readonly scheduler: ProjectScheduler;
  readonly hosts: HostExecutorRegistry;
  readonly secretStore: SecretStore;
  readonly artifactStore: BackupArtifactStore;
  readonly storageBackup?: StorageBackupProvider;
  readonly pitr?: PitrProvider;
  readonly cliVersion: string;
  readonly now: () => Date;

  constructor(options: {
    scheduler: ProjectScheduler;
    hosts: HostExecutorRegistry;
    secretStore: SecretStore;
    artifactStore: BackupArtifactStore;
    storageBackup?: StorageBackupProvider;
    pitr?: PitrProvider;
    cliVersion?: string;
    now?: () => Date;
  }) {
    this.scheduler = options.scheduler;
    this.hosts = options.hosts;
    this.secretStore = options.secretStore;
    this.artifactStore = options.artifactStore;
    this.storageBackup = options.storageBackup;
    this.pitr = options.pitr;
    this.cliVersion = options.cliVersion ?? SUPABASE_CLI_BASELINE;
    this.now = options.now ?? (() => new Date());
  }

  async #placement(projectId: string): Promise<{ placement: ProjectPlacement; host: FactoryHostExecutor }> {
    const placement = await this.scheduler.get(projectId);
    if (!placement) throw new Error(`project ${projectId} has no Factory placement`);
    return { placement, host: this.hosts.get(placement.hostId) };
  }

  async #verifyCli(host: FactoryHostExecutor): Promise<void> {
    const result = await host.exec("supabase", ["--version"], { timeoutMs: 30_000 });
    const actual = parseCliVersion(`${result.stdout}\n${result.stderr}`);
    if (actual !== this.cliVersion) throw new Error(`Supabase CLI version mismatch: expected ${this.cliVersion}, got ${actual}`);
  }

  async #databaseTarget(projectId: string, placement: ProjectPlacement, host: FactoryHostExecutor): Promise<{ url: string; password: string }> {
    const containerId = (await host.exec("docker", ["compose", "ps", "-q", "db"], {
      cwd: placement.projectRoot,
      timeoutMs: 30_000,
    })).stdout.trim();
    if (!containerId) throw new Error(`project ${projectId} database container is not running`);

    const ipOutput = (await host.exec("docker", [
      "inspect",
      "-f",
      "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}",
      containerId,
    ], { timeoutMs: 30_000 })).stdout.trim();
    const hostIp = ipOutput.split(/\s+/).find(Boolean);
    if (!hostIp) throw new Error(`project ${projectId} database has no Docker network address`);

    const password = await this.secretStore.get({
      store: this.secretStore.name,
      key: `projects/${projectId}/supabase/POSTGRES_PASSWORD`,
    });
    const url = new URL(`postgresql://postgres@${hostIp}:5432/postgres`);
    url.password = password;
    return { url: url.toString(), password };
  }

  async #runDump(
    host: FactoryHostExecutor,
    cwd: string,
    dbUrl: string,
    password: string,
    outputPath: string,
    extra: readonly string[],
  ): Promise<void> {
    try {
      await host.exec("env", cloudlessCommand("supabase", ["db", "dump", "--db-url", dbUrl, "-f", outputPath, ...extra]), {
        cwd,
        timeoutMs: 600_000,
      });
    } catch (error) {
      const candidate = error as { message?: string; stdout?: string; stderr?: string };
      const details = [candidate.message, candidate.stdout, candidate.stderr].filter(Boolean).join("\n");
      throw new Error(redact(details || "Supabase database dump failed", [password, dbUrl]));
    }
  }

  async create(manifest: ResolvedFactoryManifest): Promise<ProjectBackupRecord> {
    const projectId = manifest.project.id;
    const { placement, host } = await this.#placement(projectId);
    await this.#verifyCli(host);
    const target = await this.#databaseTarget(projectId, placement, host);
    const createdAt = this.now();
    const id = backupId(createdAt);
    const staging = (await host.exec("mktemp", ["-d", `/tmp/sbf-${projectId}-${id}-XXXXXX`])).stdout.trim();
    if (!staging.startsWith("/tmp/")) throw new Error("backup staging directory was not created under /tmp");

    try {
      await host.chmod(staging, 0o700);
      await this.#runDump(host, placement.projectRoot, target.url, target.password, `${staging}/roles.sql`, ["--role-only"]);
      await this.#runDump(host, placement.projectRoot, target.url, target.password, `${staging}/schema.sql`, []);
      await this.#runDump(host, placement.projectRoot, target.url, target.password, `${staging}/data.sql`, ["--use-copy", "--data-only"]);

      const pgsodiumRootKey = (await host.exec("docker", [
        "compose",
        "exec",
        "-T",
        "db",
        "cat",
        "/etc/postgresql-custom/pgsodium_root.key",
      ], { cwd: placement.projectRoot, timeoutMs: 30_000 })).stdout.trim();
      if (!pgsodiumRootKey) throw new Error("pgsodium root key could not be read; refusing incomplete backup");

      const configDirectory = `${staging}/runtime-config`;
      await host.mkdir(configDirectory, 0o700);
      for (const relative of [
        ".factory-state.json",
        ".supabase-version",
        "docker-compose.factory.yml",
        "volumes/api/envoy/cds.yaml",
        "volumes/api/envoy/lds.template.yaml",
      ]) {
        const source = `${placement.projectRoot}/${relative}`;
        if (await host.exists(source)) {
          const name = relative.replaceAll("/", "__");
          await host.writeText(`${configDirectory}/${name}`, await host.readText(source), 0o600);
        }
      }

      let storage: ProjectBackupRecord["storage"];
      if (manifest.services.includes("storage")) {
        if (manifest.storage.backend === "file") {
          const source = `${placement.projectRoot}/volumes/storage`;
          if (!(await host.exists(source))) throw new Error("file Storage backend is enabled but volumes/storage is missing");
          await host.exec("cp", ["-a", source, `${staging}/storage-files`], { timeoutMs: 600_000 });
          storage = { bundledFileBackend: true };
        } else {
          if (!this.storageBackup) throw new Error("S3 Storage backup provider is required for this project");
          storage = await this.storageBackup.backup({ projectId, backupId: id, manifest, placement });
          if (!(await this.storageBackup.verify(storage))) throw new Error("S3 Storage backup verification failed");
        }
      }

      let pitr: PitrCheckpoint | undefined;
      if (manifest.backup.pitr) {
        if (!this.pitr) throw new Error("PITR is required by project policy but no WAL/PITR provider is configured");
        pitr = await this.pitr.checkpoint({ projectId, backupId: id, manifest, placement });
        if (!pitr.recoverable) throw new Error("PITR provider did not confirm a recoverable checkpoint");
      }

      const envPath = `${placement.projectRoot}/.env`;
      if (!(await host.exists(envPath))) throw new Error("runtime .env is missing; refusing incomplete disaster-recovery backup");

      const artifact = await this.artifactStore.store({
        projectId,
        backupId: id,
        stagingDirectory: staging,
        secretFilePaths: [envPath],
        sensitiveValues: { pgsodiumRootKey },
        metadata: {
          version: 1,
          projectId,
          createdAt: createdAt.toISOString(),
          supabaseRelease: manifest.supabase.release,
          upstreamCommit: manifest.supabase.upstreamCommit,
          postgresMajor: manifest.supabase.postgresMajor,
          cliVersion: this.cliVersion,
          storage,
          pitr,
        },
      });
      if (!artifact.encrypted) throw new Error("backup artifact store returned an unencrypted artifact");
      if (!(await this.artifactStore.verify(artifact))) throw new Error("backup artifact verification failed");

      return {
        version: 1,
        projectId,
        backupId: id,
        createdAt: createdAt.toISOString(),
        supabaseRelease: manifest.supabase.release,
        upstreamCommit: manifest.supabase.upstreamCommit,
        postgresMajor: manifest.supabase.postgresMajor,
        cliVersion: this.cliVersion,
        database: { roles: true, schema: true, data: true, pgsodiumRootKey: true },
        runtimeConfigIncluded: true,
        ...(storage ? { storage } : {}),
        ...(pitr ? { pitr } : {}),
        artifact,
        verified: true,
        cloudManagementCredentialsRequired: false,
      };
    } finally {
      await host.remove(staging, true);
    }
  }
}
