import assert from "node:assert/strict";
import test from "node:test";
import {
  DisposableRestoreDrillController,
  HostExecutorRegistry,
  type BackupArtifactReader,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
  type ProjectBackupRecord,
  type RestoreDrillTarget,
  type RestoreDrillTargetProvider,
  type StorageRestoreProvider,
} from "../src/index.ts";

class FakeHost implements FactoryHostExecutor {
  readonly id = "node-a";
  readonly calls: Array<{ file: string; args: readonly string[]; cwd?: string }> = [];
  removed: string[] = [];

  async exec(file: string, args: readonly string[] = [], options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.calls.push({ file, args, cwd: options.cwd });
    if (file === "mktemp") return { stdout: "/tmp/sbf-restore-backup-app-20260826123456-ABC123\n", stderr: "" };
    if (file === "docker" && args.includes("ps") && args.includes("db")) return { stdout: "restore-db-container\n", stderr: "" };
    return { stdout: "", stderr: "" };
  }

  async exists(): Promise<boolean> { return true; }
  async mkdir(): Promise<void> {}
  async readText(): Promise<string> { return ""; }
  async writeText(): Promise<void> {}
  async chmod(): Promise<void> {}
  async remove(path: string): Promise<void> { this.removed.push(path); }
}

function record(storage: ProjectBackupRecord["storage"] = { ref: "s3-snapshot://backup-app/001" }): ProjectBackupRecord {
  return {
    version: 1,
    projectId: "backup-app",
    backupId: "20260826123456",
    createdAt: "2026-08-26T12:34:56.000Z",
    supabaseRelease: "self-hosted/v0.8.0",
    upstreamCommit: "241bb11c0627f2981746d37033f57dbfa81d29b0",
    postgresMajor: 17,
    cliVersion: "2.115.0",
    database: { roles: true, schema: true, data: true, pgsodiumRootKey: true },
    runtimeConfigIncluded: true,
    storage,
    artifact: { ref: "backup://backup-app/20260826123456", sha256: "a".repeat(64), encrypted: true },
    verified: true,
    cloudManagementCredentialsRequired: false,
  };
}

class FakeReader implements BackupArtifactReader {
  async materialize({ destination }: Parameters<BackupArtifactReader["materialize"]>[0]) {
    return {
      directory: `${destination}/bundle`,
      rolesFile: `${destination}/bundle/roles.sql`,
      schemaFile: `${destination}/bundle/schema.sql`,
      dataFile: `${destination}/bundle/data.sql`,
      envFile: `${destination}/bundle/runtime.env`,
      pgsodiumRootKey: "pgsodium-secret",
      bundledStorageDirectory: `${destination}/bundle/storage-files`,
    };
  }
}

class FakeTargets implements RestoreDrillTargetProvider {
  prepared = false;
  started = false;
  destroyed = 0;
  bundledStorageRestored = false;
  healthy = true;

  async allocate(): Promise<RestoreDrillTarget> {
    return { id: "restore-target-1", hostId: "node-a", projectRoot: "/srv/sbf-restore/restore-target-1", disposable: true };
  }
  async prepare(_target: RestoreDrillTarget, input: Parameters<RestoreDrillTargetProvider["prepare"]>[1]): Promise<void> {
    assert.equal(input.pgsodiumRootKey, "pgsodium-secret");
    assert.match(input.envFile, /runtime\.env$/);
    this.prepared = true;
  }
  async start(): Promise<void> { this.started = true; }
  async restoreBundledStorage(): Promise<void> { this.bundledStorageRestored = true; }
  async health() { return { healthy: this.healthy, checks: { database: this.healthy, auth: this.healthy, storage: this.healthy } }; }
  async destroy(): Promise<void> { this.destroyed += 1; }
}

test("restore drill restores database in Supabase-documented transaction order and destroys target", async () => {
  const host = new FakeHost();
  const targets = new FakeTargets();
  let storageRestored = false;
  let storageVerified = false;
  const storageRestore: StorageRestoreProvider = {
    async restore(reference, target) {
      assert.equal(reference.ref, "s3-snapshot://backup-app/001");
      assert.equal(target.id, "restore-target-1");
      storageRestored = true;
    },
    async verify() { storageVerified = true; return true; },
  };
  const controller = new DisposableRestoreDrillController({
    hosts: new HostExecutorRegistry([host]),
    artifactReader: new FakeReader(),
    targets,
    storageRestore,
  });

  const result = await controller.run(record());
  assert.equal(result.verified, true);
  assert.equal(result.targetDestroyed, true);
  assert.equal(result.restoredDatabase, true);
  assert.equal(result.restoredStorage, true);
  assert.equal(storageRestored, true);
  assert.equal(storageVerified, true);
  assert.equal(targets.prepared, true);
  assert.equal(targets.started, true);
  assert.equal(targets.destroyed, 1);

  const cpCalls = host.calls.filter((call) => call.file === "docker" && call.args[0] === "cp");
  assert.equal(cpCalls.length, 3);
  const restore = host.calls.find((call) => call.file === "docker" && call.args[0] === "exec");
  assert.ok(restore);
  const joined = restore.args.join(" ");
  assert.match(joined, /--single-transaction/);
  assert.match(joined, /ON_ERROR_STOP=1/);
  const roles = joined.indexOf("factory-restore-roles.sql");
  const schema = joined.indexOf("factory-restore-schema.sql");
  const replica = joined.indexOf("SET session_replication_role = replica");
  const data = joined.indexOf("factory-restore-data.sql");
  assert.ok(roles >= 0 && schema > roles && replica > schema && data > replica);
  assert.ok(host.removed.some((path) => path.startsWith("/tmp/sbf-restore-")));
});

test("bundled file Storage uses target-local restore path", async () => {
  const host = new FakeHost();
  const targets = new FakeTargets();
  const controller = new DisposableRestoreDrillController({
    hosts: new HostExecutorRegistry([host]),
    artifactReader: new FakeReader(),
    targets,
  });

  const result = await controller.run(record({ bundledFileBackend: true }));
  assert.equal(result.restoredStorage, true);
  assert.equal(targets.bundledStorageRestored, true);
  assert.equal(targets.destroyed, 1);
});

test("failed health checks still destroy disposable restore target", async () => {
  const host = new FakeHost();
  const targets = new FakeTargets();
  targets.healthy = false;
  const storageRestore: StorageRestoreProvider = {
    async restore() {},
    async verify() { return true; },
  };
  const controller = new DisposableRestoreDrillController({
    hosts: new HostExecutorRegistry([host]),
    artifactReader: new FakeReader(),
    targets,
    storageRestore,
  });

  await assert.rejects(() => controller.run(record()), /failed health\/integrity checks/);
  assert.equal(targets.destroyed, 1);
  assert.ok(host.removed.some((path) => path.startsWith("/tmp/sbf-restore-")));
});

test("restore drill refuses unverified or unencrypted artifacts", async () => {
  const host = new FakeHost();
  const targets = new FakeTargets();
  const controller = new DisposableRestoreDrillController({
    hosts: new HostExecutorRegistry([host]),
    artifactReader: new FakeReader(),
    targets,
  });
  const bad = record();
  bad.verified = false as true;
  await assert.rejects(() => controller.run(bad), /verified encrypted backup/);
  assert.equal(targets.destroyed, 0);
});
