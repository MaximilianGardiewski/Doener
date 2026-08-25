import assert from "node:assert/strict";
import test from "node:test";
import {
  DockerProjectBackupController,
  FACTORY_API_VERSION,
  HostExecutorRegistry,
  MemoryPlacementStore,
  ProjectScheduler,
  SUPABASE_CLI_BASELINE,
  resolveManifest,
  type BackupArtifactStore,
  type BackupArtifactStoreInput,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
  type PitrProvider,
  type SecretRef,
  type SecretStore,
  type StorageBackupProvider,
  type StoredBackupArtifact,
} from "../src/index.ts";

class MemorySecretStore implements SecretStore {
  readonly name = "memory";
  readonly values = new Map<string, string>();
  async put(key: string, value: string): Promise<SecretRef> { this.values.set(key, value); return { store: this.name, key }; }
  async get(ref: SecretRef): Promise<string> {
    const value = this.values.get(ref.key);
    if (value === undefined) throw new Error(`missing secret: ${ref.key}`);
    return value;
  }
  async has(key: string): Promise<boolean> { return this.values.has(key); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

class FakeHost implements FactoryHostExecutor {
  readonly id = "node-a";
  readonly calls: Array<{ file: string; args: readonly string[]; cwd?: string }> = [];
  readonly existing = new Set([
    "/srv/sbf/backup-app/.env",
    "/srv/sbf/backup-app/.factory-state.json",
    "/srv/sbf/backup-app/.supabase-version",
    "/srv/sbf/backup-app/docker-compose.factory.yml",
    "/srv/sbf/backup-app/volumes/api/envoy/cds.yaml",
    "/srv/sbf/backup-app/volumes/api/envoy/lds.template.yaml",
    "/srv/sbf/file-app/.env",
    "/srv/sbf/file-app/.factory-state.json",
    "/srv/sbf/file-app/.supabase-version",
    "/srv/sbf/file-app/docker-compose.factory.yml",
    "/srv/sbf/file-app/volumes/storage",
  ]);
  removed: string[] = [];

  async exec(file: string, args: readonly string[] = [], options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.calls.push({ file, args, cwd: options.cwd });
    if (file === "supabase" && args[0] === "--version") return { stdout: `${SUPABASE_CLI_BASELINE}\n`, stderr: "" };
    if (file === "docker" && args.includes("ps") && args.includes("db")) return { stdout: "db-container\n", stderr: "" };
    if (file === "docker" && args[0] === "inspect") return { stdout: "172.31.0.4 \n", stderr: "" };
    if (file === "docker" && args.includes("cat") && args.includes("/etc/postgresql-custom/pgsodium_root.key")) {
      return { stdout: "pgsodium-secret-material\n", stderr: "" };
    }
    if (file === "mktemp") return { stdout: `/tmp/${args.at(-1)?.replace("XXXXXX", "ABC123") ?? "sbf-backup"}\n`, stderr: "" };
    if (file === "env") {
      const joined = args.join(" ");
      assert.match(joined, /-u SUPABASE_ACCESS_TOKEN/);
      assert.match(joined, /supabase db dump/);
      assert.ok(args.includes("--db-url"));
      return { stdout: "dumped\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  }

  async exists(path: string): Promise<boolean> { return this.existing.has(path); }
  async mkdir(path: string): Promise<void> { this.existing.add(path); }
  async readText(path: string): Promise<string> { return `content:${path}`; }
  async writeText(path: string): Promise<void> { this.existing.add(path); }
  async chmod(): Promise<void> {}
  async remove(path: string): Promise<void> { this.removed.push(path); }
}

class FakeArtifactStore implements BackupArtifactStore {
  input?: BackupArtifactStoreInput;
  verified = true;
  async store(input: BackupArtifactStoreInput): Promise<StoredBackupArtifact> {
    this.input = input;
    return { ref: `backup://${input.projectId}/${input.backupId}`, sha256: "a".repeat(64), encrypted: true };
  }
  async verify(): Promise<boolean> { return this.verified; }
}

async function fixture(projectId: string) {
  const host = new FakeHost();
  const secrets = new MemorySecretStore();
  await secrets.put(`projects/${projectId}/supabase/POSTGRES_PASSWORD`, "postgres-password");
  const placements = new MemoryPlacementStore();
  await placements.put({ projectId, hostId: "node-a", projectRoot: `/srv/sbf/${projectId}`, apiGatewayPort: 18000 });
  const scheduler = new ProjectScheduler([{
    id: "node-a",
    enabled: true,
    projectRoot: "/srv/sbf",
    gatewayPortStart: 18000,
    gatewayPortEnd: 18020,
    maxProjects: 21,
  }], placements);
  const artifactStore = new FakeArtifactStore();
  return { host, secrets, scheduler, artifactStore };
}

test("production-critical backup requires and verifies S3 plus PITR providers", async () => {
  const { host, secrets, scheduler, artifactStore } = await fixture("backup-app");
  let storageVerified = false;
  const storageBackup: StorageBackupProvider = {
    async backup() { return { ref: "s3-snapshot://backup-app/001", objectCount: 42, checksum: "objects-checksum" }; },
    async verify() { storageVerified = true; return true; },
  };
  const pitr: PitrProvider = {
    async checkpoint() { return { provider: "wal-g", checkpoint: "2026-08-26T00:00:00Z", recoverable: true }; },
  };
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "backup-app", environment: "production" },
    profile: "production-critical",
  });
  const controller = new DockerProjectBackupController({
    scheduler,
    hosts: new HostExecutorRegistry([host]),
    secretStore: secrets,
    artifactStore,
    storageBackup,
    pitr,
    now: () => new Date("2026-08-26T12:34:56.000Z"),
  });

  const result = await controller.create(manifest);
  assert.equal(result.verified, true);
  assert.equal(result.database.roles, true);
  assert.equal(result.database.schema, true);
  assert.equal(result.database.data, true);
  assert.equal(result.database.pgsodiumRootKey, true);
  const storageRef = result.storage && "ref" in result.storage ? result.storage.ref : undefined;
  assert.equal(storageRef, "s3-snapshot://backup-app/001");
  assert.equal(result.pitr?.provider, "wal-g");
  assert.equal(storageVerified, true);
  assert.equal(result.cloudManagementCredentialsRequired, false);
  assert.equal(artifactStore.input?.secretFilePaths[0], "/srv/sbf/backup-app/.env");
  assert.equal(artifactStore.input?.sensitiveValues.pgsodiumRootKey, "pgsodium-secret-material");
  assert.equal(JSON.stringify(result).includes("pgsodium-secret-material"), false);
  assert.equal(JSON.stringify(result).includes("postgres-password"), false);
  assert.ok(host.calls.some((call) => call.file === "env" && call.args.includes("--role-only")));
  assert.ok(host.calls.some((call) => call.file === "env" && call.args.includes("--data-only") && call.args.includes("--use-copy")));
  assert.ok(host.removed.some((path) => path.startsWith("/tmp/")));
});

test("required PITR fails closed instead of silently degrading backup policy", async () => {
  const { host, secrets, scheduler, artifactStore } = await fixture("backup-app");
  const storageBackup: StorageBackupProvider = {
    async backup() { return { ref: "s3://snapshot" }; },
    async verify() { return true; },
  };
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "backup-app", environment: "production" },
    profile: "production-critical",
  });
  const controller = new DockerProjectBackupController({
    scheduler,
    hosts: new HostExecutorRegistry([host]),
    secretStore: secrets,
    artifactStore,
    storageBackup,
  });

  await assert.rejects(() => controller.create(manifest), /no WAL\/PITR provider/);
});

test("file-backed Storage is bundled into encrypted project artifact", async () => {
  const { host, secrets, scheduler, artifactStore } = await fixture("file-app");
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "file-app", environment: "development" },
    profile: "webapp",
    storage: { backend: "file" },
    backup: { pitr: false, storageReplication: false },
  });
  const controller = new DockerProjectBackupController({
    scheduler,
    hosts: new HostExecutorRegistry([host]),
    secretStore: secrets,
    artifactStore,
  });

  const result = await controller.create(manifest);
  assert.deepEqual(result.storage, { bundledFileBackend: true });
  assert.ok(host.calls.some((call) => call.file === "cp" && call.args.includes("/srv/sbf/file-app/volumes/storage")));
});

test("artifact verification failure rejects backup record", async () => {
  const { host, secrets, scheduler, artifactStore } = await fixture("file-app");
  artifactStore.verified = false;
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "file-app", environment: "development" },
    profile: "minimal",
    backup: { pitr: false },
  });
  const controller = new DockerProjectBackupController({
    scheduler,
    hosts: new HostExecutorRegistry([host]),
    secretStore: secrets,
    artifactStore,
  });

  await assert.rejects(() => controller.create(manifest), /artifact verification failed/);
});
