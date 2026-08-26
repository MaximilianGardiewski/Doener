import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { BackupArtifactStore, BackupArtifactStoreInput, StoredBackupArtifact } from "./backup.ts";
import type { BackupArtifactReader, MaterializedProjectBackup } from "./restore.ts";
import type { SecretRef, SecretStore } from "./secrets.ts";
import { LocalEncryptedBackupArtifactStore } from "./local-backup-store.ts";

const execFileAsync = promisify(execFile);

export interface ObjectStorageTransport {
  putFile(input: {
    bucket: string;
    key: string;
    sourcePath: string;
    sha256: string;
  }): Promise<void>;
  getFile(input: {
    bucket: string;
    key: string;
    destinationPath: string;
  }): Promise<void>;
}

export type AwsCliRunner = (
  file: string,
  args: readonly string[],
  options: { env: Readonly<Record<string, string>>; timeoutMs: number },
) => Promise<{ stdout: string; stderr: string }>;

async function defaultAwsRunner(
  file: string,
  args: readonly string[],
  options: { env: Readonly<Record<string, string>>; timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(file, [...args], {
    env: { ...process.env, ...options.env },
    timeout: options.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    encoding: "utf8",
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

function safeSegment(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safe || safe === "." || safe === "..") throw new Error("invalid object-storage path segment");
  return safe.slice(0, 160);
}

function trimPrefix(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function parseS3Ref(ref: string): { bucket: string; key: string } {
  const parsed = new URL(ref);
  if (parsed.protocol !== "s3:") throw new Error("backup artifact is not an s3:// reference");
  const bucket = parsed.hostname;
  const key = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!bucket || !key || key.includes("..")) throw new Error("invalid S3 backup artifact reference");
  return { bucket, key };
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), new Writable({
    write(chunk, _encoding, callback) {
      hash.update(chunk as Buffer);
      callback();
    },
  }));
  return hash.digest("hex");
}

function redact(value: string, secrets: readonly string[]): string {
  let safe = value;
  for (const secret of secrets) {
    if (secret) safe = safe.split(secret).join("[REDACTED]");
  }
  return safe;
}

/**
 * Concrete S3-compatible transport using AWS CLI's S3 API commands. Credentials
 * are provided only through the child-process environment, never command args.
 * Custom endpoints work for S3-compatible providers such as MinIO/R2.
 */
export class AwsCliS3ObjectStorageTransport implements ObjectStorageTransport {
  readonly bucketRegion: string;
  readonly endpointUrl?: string;
  readonly secretStore: SecretStore;
  readonly accessKeyId: SecretRef;
  readonly secretAccessKey: SecretRef;
  readonly sessionToken?: SecretRef;
  readonly runner: AwsCliRunner;

  constructor(options: {
    region: string;
    secretStore: SecretStore;
    accessKeyId: SecretRef;
    secretAccessKey: SecretRef;
    sessionToken?: SecretRef;
    endpointUrl?: string;
    runner?: AwsCliRunner;
  }) {
    this.bucketRegion = options.region;
    this.endpointUrl = options.endpointUrl;
    this.secretStore = options.secretStore;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.sessionToken = options.sessionToken;
    this.runner = options.runner ?? defaultAwsRunner;
  }

  async #credentials(): Promise<{ env: Record<string, string>; secrets: string[] }> {
    const accessKey = await this.secretStore.get(this.accessKeyId);
    const secretKey = await this.secretStore.get(this.secretAccessKey);
    const env: Record<string, string> = {
      AWS_ACCESS_KEY_ID: accessKey,
      AWS_SECRET_ACCESS_KEY: secretKey,
      AWS_REGION: this.bucketRegion,
      AWS_DEFAULT_REGION: this.bucketRegion,
      AWS_EC2_METADATA_DISABLED: "true",
    };
    const secrets = [accessKey, secretKey];
    if (this.sessionToken) {
      const token = await this.secretStore.get(this.sessionToken);
      env.AWS_SESSION_TOKEN = token;
      secrets.push(token);
    }
    return { env, secrets };
  }

  #baseArgs(): string[] {
    return this.endpointUrl ? ["--endpoint-url", this.endpointUrl] : [];
  }

  async #run(args: readonly string[]): Promise<void> {
    const { env, secrets } = await this.#credentials();
    try {
      await this.runner("aws", args, { env, timeoutMs: 900_000 });
    } catch (error) {
      const candidate = error as { message?: string; stdout?: string; stderr?: string };
      const details = [candidate.message, candidate.stdout, candidate.stderr].filter(Boolean).join("\n");
      throw new Error(redact(details || "S3 object-storage command failed", secrets));
    }
  }

  async putFile(input: { bucket: string; key: string; sourcePath: string; sha256: string }): Promise<void> {
    await this.#run([
      ...this.#baseArgs(),
      "s3api",
      "put-object",
      "--bucket",
      input.bucket,
      "--key",
      input.key,
      "--body",
      input.sourcePath,
      "--metadata",
      `sbf-sha256=${input.sha256}`,
      "--region",
      this.bucketRegion,
    ]);
  }

  async getFile(input: { bucket: string; key: string; destinationPath: string }): Promise<void> {
    await this.#run([
      ...this.#baseArgs(),
      "s3api",
      "get-object",
      "--bucket",
      input.bucket,
      "--key",
      input.key,
      "--region",
      this.bucketRegion,
      input.destinationPath,
    ]);
  }
}

/**
 * Durable/off-host adapter. The local store owns bundle construction + AES-GCM;
 * only encrypted .sbf bytes ever cross the object-storage boundary. A write is
 * accepted only after a full remote download verifies both SHA-256 and GCM auth.
 */
export class S3EncryptedBackupArtifactStore implements BackupArtifactStore, BackupArtifactReader {
  readonly localStore: LocalEncryptedBackupArtifactStore;
  readonly transport: ObjectStorageTransport;
  readonly bucket: string;
  readonly prefix: string;
  readonly ramRoot: string;

  constructor(options: {
    localStore: LocalEncryptedBackupArtifactStore;
    transport: ObjectStorageTransport;
    bucket: string;
    prefix?: string;
    ramRoot?: string;
  }) {
    if (!options.bucket.trim()) throw new Error("off-host backup bucket is required");
    this.localStore = options.localStore;
    this.transport = options.transport;
    this.bucket = options.bucket;
    this.prefix = trimPrefix(options.prefix ?? "supabase-factory");
    this.ramRoot = options.ramRoot ?? "/dev/shm";
  }

  #key(input: { projectId: string; backupId: string }): string {
    const leaf = `${safeSegment(input.backupId)}.sbf`;
    return [this.prefix, safeSegment(input.projectId), leaf].filter(Boolean).join("/");
  }

  async store(input: BackupArtifactStoreInput): Promise<StoredBackupArtifact> {
    const localArtifact = await this.localStore.store(input);
    if (!localArtifact.ref.startsWith("file://")) throw new Error("encrypted staging store did not return a local file artifact");
    const path = fileURLToPath(localArtifact.ref);
    const key = this.#key(input);
    try {
      await this.transport.putFile({ bucket: this.bucket, key, sourcePath: path, sha256: localArtifact.sha256 });
      const remote: StoredBackupArtifact = {
        ref: `s3://${this.bucket}/${encodeURI(key)}`,
        sha256: localArtifact.sha256,
        encrypted: true,
      };
      if (!(await this.verify(remote))) throw new Error("off-host backup failed remote integrity/authentication verification");
      return remote;
    } finally {
      await rm(path, { force: true });
    }
  }

  async #downloadVerified(artifact: StoredBackupArtifact): Promise<{ directory: string; path: string }> {
    if (!artifact.encrypted) throw new Error("off-host backup artifact must be encrypted");
    const { bucket, key } = parseS3Ref(artifact.ref);
    if (bucket !== this.bucket) throw new Error("backup artifact points to an unexpected off-host bucket");
    if (this.prefix && !key.startsWith(`${this.prefix}/`)) throw new Error("backup artifact is outside the configured Factory prefix");

    const directory = await mkdtemp(join(this.ramRoot, "sbf-offhost-"));
    const path = join(directory, "artifact.sbf");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      await this.transport.getFile({ bucket, key, destinationPath: path });
      if ((await sha256File(path)) !== artifact.sha256) throw new Error("off-host backup SHA-256 mismatch");
      const localArtifact: StoredBackupArtifact = { ref: pathToFileURL(path).toString(), sha256: artifact.sha256, encrypted: true };
      if (!(await this.localStore.verify(localArtifact))) throw new Error("off-host backup AES-GCM authentication failed");
      return { directory, path };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async verify(artifact: StoredBackupArtifact): Promise<boolean> {
    try {
      const downloaded = await this.#downloadVerified(artifact);
      await rm(downloaded.directory, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  async materialize(input: Parameters<BackupArtifactReader["materialize"]>[0]): Promise<MaterializedProjectBackup> {
    const downloaded = await this.#downloadVerified(input.artifact);
    try {
      return await this.localStore.materialize({
        artifact: { ref: pathToFileURL(downloaded.path).toString(), sha256: input.artifact.sha256, encrypted: true },
        host: input.host,
        destination: input.destination,
      });
    } finally {
      await rm(downloaded.directory, { recursive: true, force: true });
    }
  }
}
