import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  HostExecutorRegistry,
  MemoryPlacementStore,
  ProjectScheduler,
  StagedSupabaseReleaseUpgradeController,
  resolveManifest,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
  type ProjectBackupRecord,
  type ReleaseRuntimeReconciler,
  type VerifiedBackupCreator,
} from "../src/index.ts";

const TARGET_COMMIT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

class FakeHost implements FactoryHostExecutor {
  readonly id = "node-a";
  readonly calls: Array<{ file: string; args: readonly string[]; cwd?: string }> = [];
  writtenVersion?: string;
  targetCommit = TARGET_COMMIT;

  async exec(file: string, args: readonly string[] = [], options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.calls.push({ file, args, cwd: options.cwd });
    if (file === "git" && args[0] === "ls-remote") {
      return { stdout: `${this.targetCommit}\trefs/tags/self-hosted/v0.9.0\n`, stderr: "" };
    }
    if (file === "sh" && args.includes("--dry-run")) return { stdout: "preview clean; 2 files change\n", stderr: "" };
    if (file === "sh" && args[0] === "update.sh") return { stdout: "update clean\n", stderr: "" };
    if (file === "sh" && args[0] === "run.sh") return { stdout: `${args[1]} ok\n`, stderr: "" };
    return { stdout: "", stderr: "" };
  }

  async exists(path: string): Promise<boolean> {
    return path.endsWith("/update.sh") || path.endsWith("/.supabase-version");
  }
  async mkdir(): Promise<void> {}
  async readText(): Promise<string> { return ""; }
  async writeText(path: string, content: string): Promise<void> {
    if (path.endsWith("/.supabase-version")) this.writtenVersion = content;
  }
  async chmod(): Promise<void> {}
  async remove(): Promise<void> {}
}

function backupRecord(): ProjectBackupRecord {
  return {
    version: 1,
    projectId: "upgrade-app",
    backupId: "20260826130000",
    createdAt: "2026-08-26T13:00:00.000Z",
    supabaseRelease: "self-hosted/v0.8.0",
    upstreamCommit: "241bb11c0627f2981746d37033f57dbfa81d29b0",
    postgresMajor: 17,
    cliVersion: "2.115.0",
    database: { roles: true, schema: true, data: true, pgsodiumRootKey: true },
    runtimeConfigIncluded: true,
    artifact: { ref: "backup://upgrade-app/20260826130000", sha256: "a".repeat(64), encrypted: true },
    verified: true,
    cloudManagementCredentialsRequired: false,
  };
}

async function fixture() {
  const host = new FakeHost();
  const placements = new MemoryPlacementStore();
  await placements.put({ projectId: "upgrade-app", hostId: "node-a", projectRoot: "/srv/sbf/upgrade-app", apiGatewayPort: 18000 });
  const scheduler = new ProjectScheduler([{
    id: "node-a",
    enabled: true,
    projectRoot: "/srv/sbf",
    gatewayPortStart: 18000,
    gatewayPortEnd: 18010,
    maxProjects: 11,
  }], placements);

  const events: string[] = [];
  const backupCreator: VerifiedBackupCreator = {
    async create() {
      events.push("backup");
      return backupRecord();
    },
  };
  const reconciler: ReleaseRuntimeReconciler = {
    async reconcile() { events.push("reconcile"); },
    async verify() { events.push("verify"); return true; },
  };
  const controller = new StagedSupabaseReleaseUpgradeController({
    scheduler,
    hosts: new HostExecutorRegistry([host]),
    backupCreator,
    reconciler,
  });
  const current = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "upgrade-app", environment: "production" },
    profile: "minimal",
  });
  const target = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "upgrade-app", environment: "production" },
    profile: "minimal",
    supabase: { release: "self-hosted/v0.9.0", upstreamCommit: TARGET_COMMIT, postgresMajor: 17 },
  });
  return { host, controller, current, target, events };
}

test("upgrade preview verifies exact upstream commit and uses official dry-run path", async () => {
  const { host, controller, current, target } = await fixture();
  const preview = await controller.preview(current, target);
  assert.equal(preview.requiresVerifiedBackup, true);
  assert.equal(preview.requiresExplicitApply, true);
  assert.equal(preview.postgresMajorChange, false);
  assert.equal(preview.toCommit, TARGET_COMMIT);
  assert.match(preview.dryRunOutput, /preview clean/);
  assert.ok(host.calls.some((call) => call.file === "git" && call.args.includes("ls-remote")));
  assert.ok(host.calls.some((call) => call.file === "sh" && call.args[0] === "update.sh" && call.args.includes("--dry-run") && call.args.includes("--to")));
});

test("upgrade apply performs fresh preview, verified backup, merge, reconcile, pull, recreate and verification in order", async () => {
  const { host, controller, current, target, events } = await fixture();
  const result = await controller.apply(current, target, "APPLY_SUPABASE_UPGRADE");

  assert.equal(result.applied, true);
  assert.equal(result.verified, true);
  assert.equal(result.backupId, "20260826130000");
  assert.equal(result.backupArtifactRef, "backup://upgrade-app/20260826130000");
  assert.deepEqual(events, ["backup", "reconcile", "verify"]);

  const dryRun = host.calls.findIndex((call) => call.file === "sh" && call.args.includes("--dry-run"));
  const update = host.calls.findIndex((call) => call.file === "sh" && call.args[0] === "update.sh" && call.args.includes("--yes"));
  const pull = host.calls.findIndex((call) => call.file === "sh" && call.args[0] === "run.sh" && call.args[1] === "pull");
  const recreate = host.calls.findIndex((call) => call.file === "sh" && call.args[0] === "run.sh" && call.args[1] === "recreate");
  assert.ok(dryRun >= 0 && update > dryRun && pull > update && recreate > pull);
  assert.match(host.writtenVersion ?? "", /^ref=self-hosted\/v0\.9\.0$/m);
  assert.match(host.writtenVersion ?? "", new RegExp(`^commit=${TARGET_COMMIT}$`, "m"));
});

test("target release tag must resolve to the exact reviewed commit", async () => {
  const { host, controller, current, target } = await fixture();
  host.targetCommit = "cccccccccccccccccccccccccccccccccccccccc";
  await assert.rejects(() => controller.preview(current, target), /target integrity mismatch/);
  assert.equal(host.calls.some((call) => call.file === "sh" && call.args[0] === "update.sh"), false);
});

test("normal release upgrade refuses PostgreSQL major-version changes", async () => {
  const { host, controller, current, target } = await fixture();
  const pg15Current = structuredClone(current);
  pg15Current.supabase.postgresMajor = 15;
  await assert.rejects(() => controller.preview(pg15Current, target), /dedicated pg_upgrade workflow/);
  assert.equal(host.calls.length, 0);
});
