import { execFile } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  BackupArtifactStore,
  BackupArtifactStoreInput,
  StoredBackupArtifact,
} from "./backup.ts";
import type { BackupArtifactReader, MaterializedProjectBackup } from "./restore.ts";

const execFileAsync = promisify(execFile);
const MAGIC = Buffer.from("SBF1AESG", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = MAGIC.length + IV_BYTES;

interface PrivateManifest {
  version: 1;
  secretFiles: Array<{ archiveName: string; sourceName: string }>;
}

function safeSegment(value: string): string {
  const result = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!result || result === "." || result === "..") throw new Error("invalid backup path segment");
  return result.slice(0, 120);
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

async function encryptFile(source: string, destination: string, key: Uint8Array): Promise<void> {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await mkdir(resolve(destination, ".."), { recursive: true, mode: 0o700 });

  await new Promise<void>((resolvePromise, reject) => {
    const input = createReadStream(source);
    const output = createWriteStream(destination, { mode: 0o600 });
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    input.on("error", fail);
    cipher.on("error", fail);
    output.on("error", fail);
    output.on("finish", () => {
      if (settled) return;
      settled = true;
      resolvePromise();
    });

    output.write(MAGIC);
    output.write(iv);
    input.pipe(cipher).pipe(output, { end: false });
    cipher.on("end", () => output.end(cipher.getAuthTag()));
  });
}

async function readEnvelope(path: string): Promise<{ iv: Buffer; tag: Buffer; size: number }> {
  const info = await stat(path);
  if (info.size <= HEADER_BYTES + TAG_BYTES) throw new Error("encrypted backup artifact is truncated");
  const handle = await open(path, "r");
  try {
    const header = Buffer.alloc(HEADER_BYTES);
    await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("unsupported backup artifact format");
    const tag = Buffer.alloc(TAG_BYTES);
    await handle.read(tag, 0, tag.length, info.size - TAG_BYTES);
    return { iv: header.subarray(MAGIC.length), tag, size: info.size };
  } finally {
    await handle.close();
  }
}

async function decryptToFile(source: string, destination: string, key: Uint8Array): Promise<void> {
  const { iv, tag, size } = await readEnvelope(source);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(source, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
    decipher,
    createWriteStream(destination, { mode: 0o600 }),
  );
}

async function verifyEnvelope(source: string, key: Uint8Array): Promise<void> {
  const { iv, tag, size } = await readEnvelope(source);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(source, { start: HEADER_BYTES, end: size - TAG_BYTES - 1 }),
    decipher,
    new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
  );
}

/**
 * Single-host/dev V1 backup store. Plaintext packaging is constrained to
 * `/dev/shm` (RAM-backed on Linux). Durable encrypted artifacts are written to
 * `root`. Remote/object-storage implementations can replace this adapter behind
 * the same interfaces.
 */
export class LocalEncryptedBackupArtifactStore implements BackupArtifactStore, BackupArtifactReader {
  readonly root: string;
  readonly hostId: string;
  readonly #masterKey: Uint8Array;
  readonly #ramRoot: string;

  constructor(options: {
    root: string;
    masterKey: Uint8Array;
    hostId?: string;
    ramRoot?: string;
  }) {
    if (options.masterKey.byteLength !== 32) throw new Error("backup master key must be exactly 32 bytes");
    if (!options.root.startsWith("/")) throw new Error("backup root must be an absolute path");
    this.root = options.root;
    this.hostId = options.hostId ?? "local";
    this.#masterKey = options.masterKey;
    this.#ramRoot = options.ramRoot ?? "/dev/shm";
  }

  async #assertRamRoot(): Promise<void> {
    try {
      await access(this.#ramRoot);
    } catch {
      throw new Error(`${this.#ramRoot} is required for plaintext backup staging`);
    }
  }

  async store(input: BackupArtifactStoreInput): Promise<StoredBackupArtifact> {
    await this.#assertRamRoot();
    const project = safeSegment(input.projectId);
    const backup = safeSegment(input.backupId);
    const work = await mkdtemp(join(this.#ramRoot, `sbf-artifact-${project}-${backup}-`));
    const bundle = join(work, "bundle");
    const data = join(bundle, "data");
    const privateDir = join(bundle, "private");
    const secretDir = join(bundle, "secret-files");
    const tarPath = join(work, "bundle.tar");
    const destinationDirectory = join(this.root, project);
    const destination = join(destinationDirectory, `${backup}.sbf`);

    try {
      await mkdir(data, { recursive: true, mode: 0o700 });
      await mkdir(privateDir, { recursive: true, mode: 0o700 });
      await mkdir(secretDir, { recursive: true, mode: 0o700 });
      await cp(input.stagingDirectory, data, { recursive: true, force: true });

      const privateManifest: PrivateManifest = { version: 1, secretFiles: [] };
      for (let index = 0; index < input.secretFilePaths.length; index += 1) {
        const source = input.secretFilePaths[index];
        const archiveName = `${index}-${safeSegment(basename(source))}`;
        await cp(source, join(secretDir, archiveName), { force: true });
        privateManifest.secretFiles.push({ archiveName, sourceName: basename(source) });
      }

      await writeFile(join(bundle, "metadata.json"), `${JSON.stringify(input.metadata, null, 2)}\n`, { mode: 0o600 });
      await writeFile(join(privateDir, "manifest.json"), `${JSON.stringify(privateManifest, null, 2)}\n`, { mode: 0o600 });
      await writeFile(join(privateDir, "sensitive-values.json"), `${JSON.stringify(input.sensitiveValues)}\n`, { mode: 0o600 });

      await execFileAsync("tar", ["-cf", tarPath, "-C", work, "bundle"], { maxBuffer: 8 * 1024 * 1024 });
      await mkdir(destinationDirectory, { recursive: true, mode: 0o700 });
      await encryptFile(tarPath, destination, this.#masterKey);
      const sha256 = await sha256File(destination);
      return { ref: pathToFileURL(destination).toString(), sha256, encrypted: true };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  async verify(artifact: StoredBackupArtifact): Promise<boolean> {
    if (!artifact.encrypted || !artifact.ref.startsWith("file://")) return false;
    try {
      const path = fileURLToPath(artifact.ref);
      const hash = await sha256File(path);
      if (hash !== artifact.sha256) return false;
      await verifyEnvelope(path, this.#masterKey);
      return true;
    } catch {
      return false;
    }
  }

  async materialize(input: Parameters<BackupArtifactReader["materialize"]>[0]): Promise<MaterializedProjectBackup> {
    if (input.host.id !== this.hostId) {
      throw new Error(`local backup store can only materialize to host ${this.hostId}`);
    }
    if (!(await this.verify(input.artifact))) throw new Error("backup artifact failed integrity/authentication verification");
    if (!input.destination.startsWith("/")) throw new Error("materialization destination must be absolute");

    await this.#assertRamRoot();
    const work = await mkdtemp(join(this.#ramRoot, "sbf-materialize-"));
    const tarPath = join(work, "bundle.tar");
    try {
      await mkdir(input.destination, { recursive: true, mode: 0o700 });
      await decryptToFile(fileURLToPath(input.artifact.ref), tarPath, this.#masterKey);
      await execFileAsync("tar", ["-xf", tarPath, "-C", input.destination], { maxBuffer: 8 * 1024 * 1024 });

      const bundle = join(input.destination, "bundle");
      const data = join(bundle, "data");
      const privateManifest = JSON.parse(await readFile(join(bundle, "private", "manifest.json"), "utf8")) as PrivateManifest;
      if (privateManifest.version !== 1 || privateManifest.secretFiles.length === 0) {
        throw new Error("backup artifact does not contain a runtime secret file");
      }
      const sensitive = JSON.parse(await readFile(join(bundle, "private", "sensitive-values.json"), "utf8")) as Record<string, unknown>;
      if (typeof sensitive.pgsodiumRootKey !== "string" || !sensitive.pgsodiumRootKey) {
        throw new Error("backup artifact does not contain pgsodium root key material");
      }

      const envFile = join(bundle, "secret-files", privateManifest.secretFiles[0].archiveName);
      const bundledStorageDirectory = join(data, "storage-files");
      let hasBundledStorage = true;
      try { await access(bundledStorageDirectory); } catch { hasBundledStorage = false; }

      return {
        directory: data,
        rolesFile: join(data, "roles.sql"),
        schemaFile: join(data, "schema.sql"),
        dataFile: join(data, "data.sql"),
        envFile,
        pgsodiumRootKey: sensitive.pgsodiumRootKey,
        ...(hasBundledStorage ? { bundledStorageDirectory } : {}),
      };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}
