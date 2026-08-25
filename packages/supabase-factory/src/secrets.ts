import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface SecretRef {
  store: string;
  key: string;
}

export interface SecretStore {
  readonly name: string;
  put(key: string, value: string): Promise<SecretRef>;
  get(ref: SecretRef): Promise<string>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

interface EncryptedFilePayload {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
}

function validateKey(key: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,255}$/.test(key) || key.includes("..")) {
    throw new Error("invalid secret key");
  }
}

/**
 * Development/single-host secret store. The master key is supplied by the
 * process (for example from systemd credentials, TPM-backed injection or a
 * protected file outside the project tree) and is never written by this class.
 * Production can replace this adapter with Vault/SOPS/KMS without changing the
 * control plane.
 */
export class EncryptedJsonSecretStore implements SecretStore {
  readonly name = "encrypted-json-v1";
  readonly path: string;
  readonly #masterKey: Uint8Array;

  constructor(path: string, masterKey: Uint8Array) {
    if (masterKey.byteLength !== 32) throw new Error("secret-store master key must be exactly 32 bytes");
    this.path = path;
    this.#masterKey = masterKey;
  }

  async #readPlain(): Promise<Record<string, string>> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }

    const payload = JSON.parse(raw) as EncryptedFilePayload;
    if (payload.version !== 1 || payload.algorithm !== "aes-256-gcm") {
      throw new Error("unsupported encrypted secret-store format");
    }

    const decipher = createDecipheriv("aes-256-gcm", this.#masterKey, Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    const parsed = JSON.parse(plaintext) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") throw new Error("invalid secret-store value type");
      result[key] = value;
    }
    return result;
  }

  async #writePlain(values: Record<string, string>): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
    const payload: EncryptedFilePayload = {
      version: 1,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };

    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(payload)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }

  async put(key: string, value: string): Promise<SecretRef> {
    validateKey(key);
    if (value.length === 0) throw new Error("refusing to store an empty secret");
    const values = await this.#readPlain();
    values[key] = value;
    await this.#writePlain(values);
    return { store: this.name, key };
  }

  async get(ref: SecretRef): Promise<string> {
    if (ref.store !== this.name) throw new Error(`secret belongs to a different store: ${ref.store}`);
    validateKey(ref.key);
    const value = (await this.#readPlain())[ref.key];
    if (value === undefined) throw new Error(`secret not found: ${ref.key}`);
    return value;
  }

  async has(key: string): Promise<boolean> {
    validateKey(key);
    return Object.hasOwn(await this.#readPlain(), key);
  }

  async delete(key: string): Promise<void> {
    validateKey(key);
    const values = await this.#readPlain();
    if (!Object.hasOwn(values, key)) return;
    delete values[key];
    await this.#writePlain(values);
  }
}
