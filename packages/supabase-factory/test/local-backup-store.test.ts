import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  LocalEncryptedBackupArtifactStore,
  LocalHostExecutor,
} from "../src/index.ts";

test("local encrypted backup store roundtrips without plaintext leakage", async () => {
  const root = await mkdtemp(join(tmpdir(), "sbf-backup-root-"));
  const staging = await mkdtemp(join(tmpdir(), "sbf-backup-staging-"));
  const secretsDir = await mkdtemp(join(tmpdir(), "sbf-backup-secrets-"));
  const destination = await mkdtemp(join(tmpdir(), "sbf-restore-destination-"));
  const envPath = join(secretsDir, ".env");
  const sqlSecret = "super-secret-row-value";
  const envSecret = "SMTP_PASS=mail-secret-value";
  const pgsodiumSecret = "pgsodium-root-secret-value";

  try {
    await writeFile(join(staging, "roles.sql"), "CREATE ROLE app_user;\n", { mode: 0o600 });
    await writeFile(join(staging, "schema.sql"), "CREATE TABLE public.demo(id bigint);\n", { mode: 0o600 });
    await writeFile(join(staging, "data.sql"), `COPY public.demo FROM stdin;\n${sqlSecret}\n\\.\n`, { mode: 0o600 });
    await mkdir(join(staging, "runtime-config"), { mode: 0o700 });
    await writeFile(join(staging, "runtime-config", ".factory-state.json"), "{\"version\":1}\n", { mode: 0o600 });
    await mkdir(join(staging, "storage-files"), { mode: 0o700 });
    await writeFile(join(staging, "storage-files", "object.txt"), "stored object\n", { mode: 0o600 });
    await writeFile(envPath, `${envSecret}\n`, { mode: 0o600 });

    const store = new LocalEncryptedBackupArtifactStore({
      root,
      masterKey: Buffer.alloc(32, 11),
      hostId: "local",
    });
    const artifact = await store.store({
      projectId: "roundtrip-app",
      backupId: "20260826123456",
      stagingDirectory: staging,
      secretFilePaths: [envPath],
      sensitiveValues: { pgsodiumRootKey: pgsodiumSecret },
      metadata: { version: 1, projectId: "roundtrip-app" },
    });

    assert.equal(artifact.encrypted, true);
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
    assert.equal(await store.verify(artifact), true);

    const artifactPath = new URL(artifact.ref);
    const raw = await readFile(artifactPath);
    for (const forbidden of [sqlSecret, "mail-secret-value", pgsodiumSecret, "CREATE TABLE public.demo"]) {
      assert.equal(raw.includes(Buffer.from(forbidden)), false, `encrypted artifact leaked plaintext: ${forbidden}`);
    }

    const materialized = await store.materialize({
      artifact,
      host: new LocalHostExecutor("local"),
      destination,
    });
    assert.equal((await readFile(materialized.rolesFile, "utf8")).includes("CREATE ROLE"), true);
    assert.equal((await readFile(materialized.schemaFile, "utf8")).includes("CREATE TABLE"), true);
    assert.equal((await readFile(materialized.dataFile, "utf8")).includes(sqlSecret), true);
    assert.equal((await readFile(materialized.envFile, "utf8")).includes("mail-secret-value"), true);
    assert.equal(materialized.pgsodiumRootKey, pgsodiumSecret);
    assert.ok(materialized.bundledStorageDirectory);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
    await rm(secretsDir, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  }
});

test("local encrypted backup store detects ciphertext tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "sbf-backup-root-"));
  const staging = await mkdtemp(join(tmpdir(), "sbf-backup-staging-"));
  const secretsDir = await mkdtemp(join(tmpdir(), "sbf-backup-secrets-"));
  const envPath = join(secretsDir, ".env");

  try {
    await writeFile(join(staging, "roles.sql"), "-- roles\n");
    await writeFile(join(staging, "schema.sql"), "-- schema\n");
    await writeFile(join(staging, "data.sql"), "-- data\n");
    await writeFile(envPath, "SECRET=value\n");
    const store = new LocalEncryptedBackupArtifactStore({ root, masterKey: Buffer.alloc(32, 12) });
    const artifact = await store.store({
      projectId: "tamper-app",
      backupId: "20260826120000",
      stagingDirectory: staging,
      secretFilePaths: [envPath],
      sensitiveValues: { pgsodiumRootKey: "root-key" },
      metadata: {},
    });
    assert.equal(await store.verify(artifact), true);

    const path = new URL(artifact.ref);
    const bytes = await readFile(path);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    await writeFile(path, bytes);
    assert.equal(await store.verify(artifact), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
    await rm(secretsDir, { recursive: true, force: true });
  }
});
