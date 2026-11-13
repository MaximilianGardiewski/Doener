import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  HostExecutorRegistry,
  MemoryPlacementStore,
  Postgres15To17UpgradeController,
  ProjectScheduler,
  SUPABASE_BASELINE,
  resolveManifest,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
  type ProjectBackupRecord,
  type ReleaseRuntimeReconciler,
  type ResolvedFactoryManifest,
  type VerifiedBackupCreator,
} from "../src/index.ts";

class FakeHost implements FactoryHostExecutor {
  readonly id = "node-a";
  readonly calls: Array<{ file: string; args: readonly string[] }> = [];
  readonly existing = new Set<string>();
  availableKb = 9_000_000;
  incompatible = "";
  upgraded = false;

  constructor() {
    for (const relative of ["utils/upgrade-pg17.sh", "docker-compose.pg17.yml", ".env", "volumes/db/data"]) {
      this.existing.add(`/srv/sbf/pg-app/${relative}`);
    }
  }

  async exec(file: string, args: readonly string[] = [], _options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.calls.push({ file, args });
    if (file === "docker" && args.includes("ps") && args.includes("db")) return { stdout: "db-container\n", stderr: "" };
    if (file === "docker" && args[0] === "inspect" && args.includes("{{.Config.Image}}")) return { stdout: "supabase/postgres:15.8.1.060\n", stderr: "" };
    if (file === "du") return { stdout: "1000000\t/srv/sbf/pg-app/volumes/db/data\n", stderr: "" };
    if (file === "df") return { stdout: `Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 20000000 1000000 ${this.availableKb} 5% /srv\n`, stderr: "" };
    if (file === "docker" && args.includes("psql") && args.includes("SHOW server_version_num;")) return { stdout: this.upgraded ? "170006\n" : "150008\n", stderr: "" };
    if (file === "docker" && args.includes("psql")) return { stdout: this.incompatible ? `${this.incompatible}\n` : "", stderr: "" };
    if (file === "sudo" || (file === "bash" && args.includes("utils/upgrade-pg17.sh"))) {
      this.upgraded = true;
      this.existing.add("/srv/sbf/pg-app/volumes/db/data.bak.pg15");
      this.existing.add("/srv/sbf/pg-app/volumes/db/pgsodium_root.key.bak.pg15");
      return { stdout: "upgraded\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  }
  async exists(path: string): Promise<boolean> { return this.existing.has(path); }
  async mkdir(): Promise<void> {}
  async readText(): Promise<string> { return ""; }
  async writeText(): Promise<void> {}
  async chmod(): Promise<void> {}
  async remove(): Promise<void> {}
}

class FakeBackupCreator implements VerifiedBackupCreator {
  readonly order: string[];
  constructor(order: string[]) { this.order = order; }
  async create(manifest: ResolvedFactoryManifest): Promise<ProjectBackupRecord> {
    this.order.push("backup");
    return {
      version: 1,
      projectId: manifest.project.id,
      backupId: "20260826043000",
      createdAt: "2026-08-26T04:30:00.000Z",
      supabaseRelease: manifest.supabase.release,
      upstreamCommit: manifest.supabase.upstreamCommit,
      postgresMajor: manifest.supabase.postgresMajor,
      cliVersion: "2.115.0",
      database: { roles: true, schema: true, data: true, pgsodiumRootKey: true },
      runtimeConfigIncluded: true,
      artifact: { ref: "s3://factory-backups/pg-app/backup.sbf", sha256: "a".repeat(64), encrypted: true },
      verified: true,
      cloudManagementCredentialsRequired: false,
    };
  }
}

class FakeReconciler implements ReleaseRuntimeReconciler {
  readonly order: string[];
  constructor(order: string[]) { this.order = order; }
  async reconcile(): Promise<void> { this.order.push("reconcile"); }
  async verify(): Promise<boolean> { this.order.push("verify"); return true; }
}

async function fixture() {
  const host = new FakeHost();
  const placements = new MemoryPlacementStore();
  await placements.put({ projectId: "pg-app", hostId: "node-a", projectRoot: "/srv/sbf/pg-app", apiGatewayPort: 18000 });
  const scheduler = new ProjectScheduler([{
    id: "node-a", enabled: true, projectRoot: "/srv/sbf", gatewayPortStart: 18000, gatewayPortEnd: 18010, maxProjects: 11,
  }], placements);
  const order: string[] = [];
  const controller = new Postgres15To17UpgradeController({
    scheduler,
    hosts: new HostExecutorRegistry([host]),
    backupCreator: new FakeBackupCreator(order),
    reconciler: new FakeReconciler(order),
  });
  const current = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "pg-app", environment: "production" },
    profile: "minimal",
    supabase: { release: SUPABASE_BASELINE.release, upstreamCommit: SUPABASE_BASELINE.upstreamCommit, postgresMajor: 15 },
  });
  const target = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "pg-app", environment: "production" },
    profile: "minimal",
    supabase: { release: SUPABASE_BASELINE.release, upstreamCommit: SUPABASE_BASELINE.upstreamCommit, postgresMajor: 17 },
  });
  return { host, controller, current, target, order };
}

test("PG15 -> PG17 preview enforces Supabase disk formula and extension compatibility", async () => {
  const { controller, current, target } = await fixture();
  const preview = await controller.preview(current, target);
  assert.equal(preview.fromMajor, 15);
  assert.equal(preview.toMajor, 17);
  assert.equal(preview.dataSizeKb, 1_000_000);
  assert.equal(preview.requiredKb, 2_000_000 + 5 * 1024 * 1024);
  assert.equal(preview.availableKb, 9_000_000);
  assert.deepEqual(preview.incompatibleExtensions, []);
  assert.match(preview.currentImage, /postgres:15/);
});

test("PG15 -> PG17 preview fails closed on insufficient disk even though upstream --yes would continue", async () => {
  const { host, controller, current, target } = await fixture();
  host.availableKb = 7_000_000;
  await assert.rejects(() => controller.preview(current, target), /insufficient disk space/);
});

test("PG15 -> PG17 preview refuses extensions removed from Supabase PG17 images", async () => {
  const { host, controller, current, target } = await fixture();
  host.incompatible = "plv8";
  await assert.rejects(() => controller.preview(current, target), /incompatible extensions installed: plv8/);
});

test("PG15 -> PG17 apply requires verified backup, runs official script and preserves rollback data", async () => {
  const { host, controller, current, target, order } = await fixture();
  const result = await controller.apply(current, target, "APPLY_POSTGRES_17_UPGRADE");
  assert.equal(result.applied, true);
  assert.equal(result.verified, true);
  assert.equal(result.backupId, "20260826043000");
  assert.match(result.preservedPg15Data, /data\.bak\.pg15$/);
  assert.match(result.preservedPgsodiumKey, /pgsodium_root\.key\.bak\.pg15$/);
  const upgrade = host.calls.find((call) => call.file === "sudo");
  assert.deepEqual(upgrade?.args, ["-n", "bash", "utils/upgrade-pg17.sh", "--yes"]);
  assert.deepEqual(order, ["backup", "reconcile", "verify"]);
  assert.ok(host.calls.some((call) => call.file === "docker" && call.args.includes("SHOW server_version_num;")));
});

test("PG major controller refuses mixing a Supabase release change into the same operation", async () => {
  const { controller, current } = await fixture();
  const target = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "pg-app", environment: "production" },
    profile: "minimal",
    supabase: { release: "self-hosted/v0.8.1", upstreamCommit: "b".repeat(40), postgresMajor: 17 },
  });
  await assert.rejects(() => controller.preview(current, target), /change the Supabase release separately/);
});
