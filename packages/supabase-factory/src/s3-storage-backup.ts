import { createHash } from "node:crypto";
import type { StorageBackupProvider, StorageBackupReference } from "./backup.ts";
import type { FactoryHostExecutor } from "./host.ts";
import type { ProjectPlacement } from "./placement.ts";
import type { SecretRef, SecretStore } from "./secrets.ts";
import type { ResolvedFactoryManifest } from "./types.ts";

export interface S3MirrorRemote {
  bucket: string;
  prefix?: string;
  region: string;
  endpoint?: string;
  provider?: "AWS" | "Other";
  forcePathStyle?: boolean;
  accessKeyId: SecretRef;
  secretAccessKey: SecretRef;
}

interface MirrorReferencePayload {
  version: 1;
  projectId: string;
  hostId: string;
  sourceBucket: string;
  sourcePrefix: string;
  targetBucket: string;
  targetPrefix: string;
}

function safeSegment(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safe || safe === "." || safe === "..") throw new Error("invalid S3 mirror path segment");
  return safe.slice(0, 160);
}

function cleanPrefix(value = ""): string {
  const normalized = value.replace(/^\/+|\/+$/g, "");
  if (normalized.split("/").some((segment) => segment === "..")) throw new Error("S3 mirror prefix must not contain '..'");
  return normalized;
}

function remotePath(bucket: string, prefix: string): string {
  return `${bucket}${prefix ? `/${prefix}` : ""}`;
}

function configValue(value: string): string {
  if (/\r|\n/.test(value)) throw new Error("rclone configuration values must be single-line");
  return value;
}

function encodeReference(payload: MirrorReferencePayload): string {
  return `sbf-s3mirror:${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

function decodeReference(ref: string): MirrorReferencePayload {
  if (!ref.startsWith("sbf-s3mirror:")) throw new Error("unsupported S3 mirror backup reference");
  const payload = JSON.parse(Buffer.from(ref.slice("sbf-s3mirror:".length), "base64url").toString("utf8")) as MirrorReferencePayload;
  if (payload.version !== 1 || !payload.projectId || !payload.hostId || !payload.targetBucket) {
    throw new Error("invalid S3 mirror backup reference");
  }
  return payload;
}

function inventoryChecksum(stdout: string): { checksum: string; objectCount: number } {
  const rows = JSON.parse(stdout) as Array<{ Path?: string; Size?: number; Hashes?: Record<string, string> }>;
  if (!Array.isArray(rows)) throw new Error("rclone lsjson did not return an array");
  const normalized = rows.map((row) => ({
    path: row.Path ?? "",
    size: row.Size ?? 0,
    hashes: Object.fromEntries(Object.entries(row.Hashes ?? {}).sort(([a], [b]) => a.localeCompare(b))),
  })).sort((a, b) => a.path.localeCompare(b.path));
  return {
    checksum: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
    objectCount: normalized.length,
  };
}

/**
 * Project-scoped Storage backup provider. It copies an S3-backed Storage bucket
 * (or prefix) into a unique off-host S3 prefix using rclone, then performs a
 * content check. Secret values exist only in a 0600 config under /dev/shm and
 * are deleted after each operation.
 */
export class RcloneS3StorageBackupProvider implements StorageBackupProvider {
  readonly projectId: string;
  readonly host: FactoryHostExecutor;
  readonly secretStore: SecretStore;
  readonly source: S3MirrorRemote;
  readonly target: S3MirrorRemote;
  readonly targetBasePrefix: string;
  readonly ramRoot: string;

  constructor(options: {
    projectId: string;
    host: FactoryHostExecutor;
    secretStore: SecretStore;
    source: S3MirrorRemote;
    target: S3MirrorRemote;
    targetBasePrefix?: string;
    ramRoot?: string;
  }) {
    this.projectId = options.projectId;
    this.host = options.host;
    this.secretStore = options.secretStore;
    this.source = options.source;
    this.target = options.target;
    this.targetBasePrefix = cleanPrefix(options.targetBasePrefix ?? "supabase-storage-backups");
    this.ramRoot = options.ramRoot ?? "/dev/shm";
  }

  async #config(): Promise<{ directory: string; path: string }> {
    const directory = (await this.host.exec("mktemp", ["-d", `${this.ramRoot}/sbf-rclone-${safeSegment(this.projectId)}-XXXXXX`])).stdout.trim();
    if (!directory.startsWith(`${this.ramRoot}/`)) throw new Error("rclone secret config was not created in the configured RAM root");
    await this.host.chmod(directory, 0o700);
    const path = `${directory}/rclone.conf`;

    const sourceAccess = await this.secretStore.get(this.source.accessKeyId);
    const sourceSecret = await this.secretStore.get(this.source.secretAccessKey);
    const targetAccess = await this.secretStore.get(this.target.accessKeyId);
    const targetSecret = await this.secretStore.get(this.target.secretAccessKey);

    const render = (name: string, remote: S3MirrorRemote, access: string, secret: string) => [
      `[${name}]`,
      "type = s3",
      `provider = ${remote.provider ?? "Other"}`,
      "env_auth = false",
      `access_key_id = ${configValue(access)}`,
      `secret_access_key = ${configValue(secret)}`,
      `region = ${configValue(remote.region)}`,
      ...(remote.endpoint ? [`endpoint = ${configValue(remote.endpoint)}`] : []),
      `force_path_style = ${remote.forcePathStyle ?? remote.provider !== "AWS" ? "true" : "false"}`,
      "",
    ].join("\n");

    await this.host.writeText(path, `${render("source", this.source, sourceAccess, sourceSecret)}${render("target", this.target, targetAccess, targetSecret)}`, 0o600);
    return { directory, path };
  }

  async #inventory(config: string, targetPath: string): Promise<{ checksum: string; objectCount: number }> {
    const result = await this.host.exec("rclone", ["--config", config, "lsjson", "--recursive", "--files-only", "--hash", `target:${targetPath}`], {
      timeoutMs: 900_000,
    });
    return inventoryChecksum(result.stdout);
  }

  async backup(input: {
    projectId: string;
    backupId: string;
    manifest: ResolvedFactoryManifest;
    placement: ProjectPlacement;
  }): Promise<StorageBackupReference> {
    if (input.projectId !== this.projectId) throw new Error("S3 mirror provider is bound to a different project");
    if (input.placement.hostId !== this.host.id) throw new Error("S3 mirror provider is attached to the wrong Factory host");
    if (input.manifest.storage.backend !== "s3") throw new Error("S3 mirror provider requires an S3 Storage backend");

    const sourcePrefix = cleanPrefix(this.source.prefix);
    const targetPrefix = [this.targetBasePrefix, safeSegment(input.projectId), safeSegment(input.backupId)].filter(Boolean).join("/");
    const sourcePath = remotePath(this.source.bucket, sourcePrefix);
    const targetPath = remotePath(this.target.bucket, targetPrefix);
    const config = await this.#config();
    try {
      await this.host.exec("rclone", [
        "--config", config.path,
        "copy",
        `source:${sourcePath}`,
        `target:${targetPath}`,
        "--checksum",
        "--metadata",
        "--immutable",
      ], { timeoutMs: 3_600_000 });

      await this.host.exec("rclone", [
        "--config", config.path,
        "check",
        `source:${sourcePath}`,
        `target:${targetPath}`,
        "--one-way",
        "--download",
      ], { timeoutMs: 3_600_000 });

      const inventory = await this.#inventory(config.path, targetPath);
      const payload: MirrorReferencePayload = {
        version: 1,
        projectId: input.projectId,
        hostId: input.placement.hostId,
        sourceBucket: this.source.bucket,
        sourcePrefix,
        targetBucket: this.target.bucket,
        targetPrefix,
      };
      return { ref: encodeReference(payload), objectCount: inventory.objectCount, checksum: inventory.checksum };
    } finally {
      await this.host.remove(config.directory, true);
    }
  }

  async verify(reference: StorageBackupReference): Promise<boolean> {
    try {
      const payload = decodeReference(reference.ref);
      if (payload.projectId !== this.projectId || payload.hostId !== this.host.id) return false;
      if (payload.targetBucket !== this.target.bucket) return false;
      if (!reference.checksum) return false;
      const config = await this.#config();
      try {
        const targetPath = remotePath(payload.targetBucket, payload.targetPrefix);
        const inventory = await this.#inventory(config.path, targetPath);
        return inventory.checksum === reference.checksum && (reference.objectCount === undefined || inventory.objectCount === reference.objectCount);
      } finally {
        await this.host.remove(config.directory, true);
      }
    } catch {
      return false;
    }
  }
}
