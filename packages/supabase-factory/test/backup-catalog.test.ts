import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  JsonFileBackupCatalog,
  MemoryBackupCatalog,
  type ProjectBackupRecord,
} from "../src/index.ts";

function record(projectId: string, backupId: string, createdAt: string): ProjectBackupRecord {
  return {
    version: 1,
    projectId,
    backupId,
    createdAt,
    supabaseRelease: "self-hosted/v0.8.0",
    upstreamCommit: "a".repeat(40),
    postgresMajor: 17,
    cliVersion: "2.115.0",
    database: { roles: true, schema: true, data: true, pgsodiumRootKey: true },
    runtimeConfigIncluded: true,
    artifact: { ref: `s3://factory-backups/${projectId}/${backupId}.sbf`, sha256: "b".repeat(64), encrypted: true },
    verified: true,
    cloudManagementCredentialsRequired: false,
  };
}

test("memory backup catalog keys records by project and backup and sorts newest first", async () => {
  const catalog = new MemoryBackupCatalog();
  await catalog.put(record("alpha-app", "001", "2026-08-25T10:00:00.000Z"));
  await catalog.put(record("alpha-app", "002", "2026-08-26T10:00:00.000Z"));
  await catalog.put(record("beta-app", "001", "2026-08-26T11:00:00.000Z"));

  assert.equal((await catalog.get("alpha-app", "001"))?.backupId, "001");
  assert.deepEqual((await catalog.list("alpha-app")).map((item) => item.backupId), ["002", "001"]);
  assert.deepEqual((await catalog.list()).map((item) => `${item.projectId}:${item.backupId}`), ["alpha-app:002", "alpha-app:001", "beta-app:001"]);
});

test("backup catalog refuses unverified or unencrypted records", async () => {
  const catalog = new MemoryBackupCatalog();
  const unverified = { ...record("alpha-app", "001", "2026-08-26T10:00:00.000Z"), verified: false as true };
  await assert.rejects(() => catalog.put(unverified), /verified encrypted backups/);
  const plain = { ...record("alpha-app", "002", "2026-08-26T11:00:00.000Z"), artifact: { ref: "file:///plain", sha256: "c".repeat(64), encrypted: false as true } };
  await assert.rejects(() => catalog.put(plain), /verified encrypted backups/);
});

test("JSON backup catalog persists atomically with mode 0600", async () => {
  const root = await mkdtemp(join(tmpdir(), "sbf-backup-catalog-"));
  const path = join(root, "state", "backups.json");
  try {
    const catalog = new JsonFileBackupCatalog(path);
    await catalog.put(record("alpha-app", "001", "2026-08-26T10:00:00.000Z"));
    await catalog.put(record("alpha-app", "002", "2026-08-26T11:00:00.000Z"));
    const reopened = new JsonFileBackupCatalog(path);
    assert.equal((await reopened.get("alpha-app", "002"))?.artifact.encrypted, true);
    assert.deepEqual((await reopened.list("alpha-app")).map((item) => item.backupId), ["002", "001"]);
    const raw = await readFile(path, "utf8");
    assert.match(raw, /factory-backups/);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
