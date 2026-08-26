import type { PitrCheckpoint, PitrProvider } from "./backup.ts";
import type { FactoryHostExecutor } from "./host.ts";
import type { ProjectPlacement } from "./placement.ts";
import type { SecretRef, SecretStore } from "./secrets.ts";
import type { ResolvedFactoryManifest } from "./types.ts";

export interface WalGS3Config {
  prefix: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId: SecretRef;
  secretAccessKey: SecretRef;
  sessionToken?: SecretRef;
}

function safeRestorePoint(projectId: string, backupId: string): string {
  const raw = `sbf_${projectId}_${backupId}`.replace(/[^a-zA-Z0-9_]+/g, "_");
  return raw.slice(0, 60);
}

function redact(value: string, secrets: readonly string[]): string {
  let safe = value;
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join("[REDACTED]");
  }
  return safe;
}

function newestBackupName(stdout: string): string | undefined {
  const parsed = JSON.parse(stdout) as Array<{ backup_name?: string; name?: string; time?: string }>;
  if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
  const rows = [...parsed].sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
  const last = rows.at(-1);
  return last?.backup_name ?? last?.name;
}

/**
 * Concrete WAL-G PITR capability provider. It assumes WAL-G is installed on the
 * trusted Factory host and that the configured repository is dedicated/scoped
 * to this project. A checkpoint is considered recoverable only after a named
 * Postgres restore point, WAL switch, verified base backup and gap-free wal-show.
 */
export class WalGPitrProvider implements PitrProvider {
  readonly projectId: string;
  readonly host: FactoryHostExecutor;
  readonly secretStore: SecretStore;
  readonly storage: WalGS3Config;

  constructor(options: {
    projectId: string;
    host: FactoryHostExecutor;
    secretStore: SecretStore;
    storage: WalGS3Config;
  }) {
    this.projectId = options.projectId;
    this.host = options.host;
    this.secretStore = options.secretStore;
    this.storage = options.storage;
  }

  async #databaseTarget(placement: ProjectPlacement): Promise<{ hostIp: string; password: string }> {
    const containerId = (await this.host.exec("docker", ["compose", "ps", "-q", "db"], {
      cwd: placement.projectRoot,
      timeoutMs: 30_000,
    })).stdout.trim();
    if (!containerId) throw new Error(`project ${this.projectId} database container is not running`);
    const ipOutput = (await this.host.exec("docker", [
      "inspect",
      "-f",
      "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}",
      containerId,
    ], { timeoutMs: 30_000 })).stdout.trim();
    const hostIp = ipOutput.split(/\s+/).find(Boolean);
    if (!hostIp) throw new Error(`project ${this.projectId} database has no Docker network address`);
    const password = await this.secretStore.get({
      store: this.secretStore.name,
      key: `projects/${this.projectId}/supabase/POSTGRES_PASSWORD`,
    });
    return { hostIp, password };
  }

  async #env(dbHost: string, password: string): Promise<{ env: Record<string, string>; secrets: string[] }> {
    const accessKey = await this.secretStore.get(this.storage.accessKeyId);
    const secretKey = await this.secretStore.get(this.storage.secretAccessKey);
    const env: Record<string, string> = {
      PGHOST: dbHost,
      PGPORT: "5432",
      PGUSER: "postgres",
      PGPASSWORD: password,
      PGDATABASE: "postgres",
      WALG_S3_PREFIX: this.storage.prefix,
      AWS_REGION: this.storage.region,
      AWS_DEFAULT_REGION: this.storage.region,
      AWS_ACCESS_KEY_ID: accessKey,
      AWS_SECRET_ACCESS_KEY: secretKey,
      AWS_EC2_METADATA_DISABLED: "true",
      AWS_S3_FORCE_PATH_STYLE: String(this.storage.forcePathStyle ?? Boolean(this.storage.endpoint)),
      WALG_VERIFY_PAGE_CHECKSUMS: "true",
    };
    const secrets = [password, accessKey, secretKey];
    if (this.storage.endpoint) env.AWS_ENDPOINT = this.storage.endpoint;
    if (this.storage.sessionToken) {
      const token = await this.secretStore.get(this.storage.sessionToken);
      env.AWS_SESSION_TOKEN = token;
      secrets.push(token);
    }
    return { env, secrets };
  }

  async #run(file: string, args: readonly string[], env: Readonly<Record<string, string>>, secrets: readonly string[], timeoutMs: number): Promise<string> {
    try {
      const result = await this.host.exec(file, args, { env, timeoutMs });
      return `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim();
    } catch (error) {
      const candidate = error as { message?: string; stdout?: string; stderr?: string };
      const details = [candidate.message, candidate.stdout, candidate.stderr].filter(Boolean).join("\n");
      throw new Error(redact(details || `${file} command failed`, secrets));
    }
  }

  async checkpoint(input: {
    projectId: string;
    backupId: string;
    manifest: ResolvedFactoryManifest;
    placement: ProjectPlacement;
  }): Promise<PitrCheckpoint> {
    if (input.projectId !== this.projectId) throw new Error("WAL-G provider is bound to a different project");
    if (input.placement.hostId !== this.host.id) throw new Error("WAL-G provider is attached to the wrong Factory host");
    if (input.manifest.supabase.postgresMajor !== 15 && input.manifest.supabase.postgresMajor !== 17) {
      throw new Error("WAL-G provider does not support this PostgreSQL major version");
    }

    const db = await this.#databaseTarget(input.placement);
    const runtime = await this.#env(db.hostIp, db.password);
    await this.#run("wal-g", ["--version"], runtime.env, runtime.secrets, 30_000);

    const restorePoint = safeRestorePoint(input.projectId, input.backupId);
    const sql = `SELECT pg_create_restore_point('${restorePoint}'); SELECT pg_switch_wal(); SELECT pg_current_wal_lsn();`;
    const lsnOutput = await this.#run("psql", ["-At", "-v", "ON_ERROR_STOP=1", "-c", sql], runtime.env, runtime.secrets, 60_000);
    const lsn = lsnOutput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1);
    if (!lsn || !/^[0-9A-F]+\/[0-9A-F]+$/i.test(lsn)) throw new Error("could not confirm PostgreSQL LSN for PITR checkpoint");

    await this.#run("wal-g", ["backup-push", "--pghost", db.hostIp, "--verify"], runtime.env, runtime.secrets, 3_600_000);
    const listOutput = await this.#run("wal-g", ["backup-list", "--pretty", "--detail", "--json"], runtime.env, runtime.secrets, 120_000);
    const backupName = newestBackupName(listOutput);
    if (!backupName) throw new Error("WAL-G repository did not report a base backup after backup-push");

    const walShow = await this.#run("wal-g", ["wal-show"], runtime.env, runtime.secrets, 120_000);
    if (!/\bOK\b/i.test(walShow) || /missing|gap|broken|error/i.test(walShow)) {
      throw new Error("WAL-G WAL archive is not gap-free; PITR checkpoint is not recoverable");
    }

    return {
      provider: "wal-g",
      checkpoint: `${restorePoint}@${lsn}#${backupName}`,
      recoverable: true,
    };
  }
}
