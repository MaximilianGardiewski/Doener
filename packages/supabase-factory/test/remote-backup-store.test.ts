import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  AwsCliS3ObjectStorageTransport,
  LocalEncryptedBackupArtifactStore,
  LocalHostExecutor,
  S3EncryptedBackupArtifactStore,
  type ObjectStorageTransport,
  type SecretRef,
  type SecretStore,
} from "../src/index.ts";

class MemorySecretStore implements SecretStore {
  readonly name = "memory";
  readonly values = new Map<string, string>();
  async put(key: string, value: string): Promise<SecretRef> { this.values.set(key, value); return { store: this.name, key }; }
  async get(ref: SecretRef): Promise<string> {
    const value = this.values.get(ref.key);
    if (value === undefined) throw new Error(`missing secret ${ref.key}`);
    return value;
  }
  async has(key: string): Promise<boolean> { return this.values.has(key); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

class FilesystemObjectTransport implements ObjectStorageTransport {
  readonly root: string;
  constructor(root: string) { this.root = root; }
  path(bucket: string, key: string): string { return join(this.root, bucket, key); }
  async putFile(input: { bucket: string; key: string; sourcePath: string }): Promise<void> {
    const destination = this.path(input.bucket, input.key);
    await mkdir(dirname(destination), { recursive: true });
    await cp(input.sourcePath, destination);
  }
  async getFile(input: { bucket: string; key: string; destinationPath: string }): Promise<void> {
    await mkdir(dirname(input.destinationPath), { recursive: true });
    await cp(this.path(input.bucket, input.key), input.destinationPath);
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "sbf-remote-local-"));
  const remote = await mkdtemp(join(tmpdir(), "sbf-remote-object-"));
  const staging = await mkdtemp(join(tmpdir(), "sbf-remote-staging-"));
  const secrets = await mkdtemp(join(tmpdir(), "sbf-remote-secrets-"));
  const destination = await mkdtemp(join(tmpdir(), "sbf-remote-restore-"));
  const envPath = join(secrets, ".env");
  await writeFile(join(staging, "roles.sql"), "CREATE ROLE app_user;\n");
  await writeFile(join(staging, "schema.sql"), "CREATE TABLE public.demo(id bigint);\n");
  await writeFile(join(staging, "data.sql"), "COPY public.demo FROM stdin;\nsecret-row\n\\.\n");
  await writeFile(envPath, "SMTP_PASS=remote-mail-secret\n");
  const transport = new FilesystemObjectTransport(remote);
  const localStore = new LocalEncryptedBackupArtifactStore({
    root,
    masterKey: Buffer.alloc(32, 21),
    hostId: "local",
    ramRoot: tmpdir(),
  });
  const store = new S3EncryptedBackupArtifactStore({
    localStore,
    transport,
    bucket: "factory-backups",
    prefix: "prod",
    ramRoot: tmpdir(),
  });
  return { root, remote, staging, secrets, destination, envPath, transport, store };
}

test("off-host encrypted backup roundtrips and stores only ciphertext remotely", async () => {
  const f = await fixture();
  try {
    const artifact = await f.store.store({
      projectId: "remote-app",
      backupId: "20260826033000",
      stagingDirectory: f.staging,
      secretFilePaths: [f.envPath],
      sensitiveValues: { pgsodiumRootKey: "remote-pgsodium-secret" },
      metadata: { version: 1, projectId: "remote-app" },
    });
    assert.match(artifact.ref, /^s3:\/\/factory-backups\/prod\/remote-app\//);
    assert.equal(await f.store.verify(artifact), true);

    const remotePath = f.transport.path("factory-backups", "prod/remote-app/20260826033000.sbf");
    const raw = await readFile(remotePath);
    for (const forbidden of ["secret-row", "remote-mail-secret", "remote-pgsodium-secret", "CREATE TABLE public.demo"]) {
      assert.equal(raw.includes(Buffer.from(forbidden)), false, `remote ciphertext leaked plaintext: ${forbidden}`);
    }

    const materialized = await f.store.materialize({
      artifact,
      host: new LocalHostExecutor("local"),
      destination: f.destination,
    });
    assert.match(await readFile(materialized.schemaFile, "utf8"), /CREATE TABLE/);
    assert.match(await readFile(materialized.dataFile, "utf8"), /secret-row/);
    assert.match(await readFile(materialized.envFile, "utf8"), /remote-mail-secret/);
    assert.equal(materialized.pgsodiumRootKey, "remote-pgsodium-secret");
  } finally {
    await rm(f.root, { recursive: true, force: true });
    await rm(f.remote, { recursive: true, force: true });
    await rm(f.staging, { recursive: true, force: true });
    await rm(f.secrets, { recursive: true, force: true });
    await rm(f.destination, { recursive: true, force: true });
  }
});

test("off-host verification detects remote ciphertext tampering", async () => {
  const f = await fixture();
  try {
    const artifact = await f.store.store({
      projectId: "tampered-remote",
      backupId: "20260826033100",
      stagingDirectory: f.staging,
      secretFilePaths: [f.envPath],
      sensitiveValues: { pgsodiumRootKey: "key" },
      metadata: {},
    });
    const path = f.transport.path("factory-backups", "prod/tampered-remote/20260826033100.sbf");
    const bytes = await readFile(path);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    await writeFile(path, bytes);
    assert.equal(await f.store.verify(artifact), false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
    await rm(f.remote, { recursive: true, force: true });
    await rm(f.staging, { recursive: true, force: true });
    await rm(f.secrets, { recursive: true, force: true });
    await rm(f.destination, { recursive: true, force: true });
  }
});

test("AWS CLI transport keeps S3 credentials out of command arguments", async () => {
  const secrets = new MemorySecretStore();
  const access = await secrets.put("backup/access", "AKIA-VERY-SECRET");
  const secret = await secrets.put("backup/secret", "super-secret-s3-key");
  const calls: Array<{ args: readonly string[]; env: Readonly<Record<string, string>> }> = [];
  const transport = new AwsCliS3ObjectStorageTransport({
    region: "eu-central-1",
    endpointUrl: "https://objects.example.invalid",
    secretStore: secrets,
    accessKeyId: access,
    secretAccessKey: secret,
    runner: async (_file, args, options) => {
      calls.push({ args, env: options.env });
      return { stdout: "{}", stderr: "" };
    },
  });

  await transport.putFile({ bucket: "backups", key: "x/a.sbf", sourcePath: "/tmp/a.sbf", sha256: "a".repeat(64) });
  assert.equal(calls.length, 1);
  const serializedArgs = JSON.stringify(calls[0].args);
  assert.equal(serializedArgs.includes("AKIA-VERY-SECRET"), false);
  assert.equal(serializedArgs.includes("super-secret-s3-key"), false);
  assert.equal(calls[0].env.AWS_ACCESS_KEY_ID, "AKIA-VERY-SECRET");
  assert.equal(calls[0].env.AWS_SECRET_ACCESS_KEY, "super-secret-s3-key");
  assert.ok(calls[0].args.includes("--endpoint-url"));
});
