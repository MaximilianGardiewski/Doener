import assert from "node:assert/strict";
import test from "node:test";
import {
  DockerMigrationController,
  HostExecutorRegistry,
  MemoryPlacementStore,
  ProjectScheduler,
  SUPABASE_CLI_BASELINE,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
  type SecretRef,
  type SecretStore,
} from "../src/index.ts";

class MemorySecretStore implements SecretStore {
  readonly name = "memory";
  readonly values = new Map<string, string>();

  async put(key: string, value: string): Promise<SecretRef> {
    this.values.set(key, value);
    return { store: this.name, key };
  }

  async get(ref: SecretRef): Promise<string> {
    const value = this.values.get(ref.key);
    if (value === undefined) throw new Error(`missing secret: ${ref.key}`);
    return value;
  }

  async has(key: string): Promise<boolean> { return this.values.has(key); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

class FakeHost implements FactoryHostExecutor {
  readonly id = "node-a";
  readonly calls: Array<{ file: string; args: readonly string[]; cwd?: string }> = [];
  dirty = false;
  expectedCommit = "0123456789abcdef0123456789abcdef01234567";

  async exec(file: string, args: readonly string[] = [], options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.calls.push({ file, args, cwd: options.cwd });

    if (file === "supabase" && args[0] === "--version") return { stdout: `supabase version ${SUPABASE_CLI_BASELINE}\n`, stderr: "" };
    if (file === "docker" && args.includes("ps") && args.includes("db")) return { stdout: "db-container-id\n", stderr: "" };
    if (file === "docker" && args[0] === "inspect") return { stdout: "172.30.0.12 \n", stderr: "" };
    if (file === "git" && args.includes("rev-parse")) return { stdout: `${this.expectedCommit}\n`, stderr: "" };
    if (file === "git" && args.includes("status")) return { stdout: this.dirty ? " M supabase/migrations/202608260001.sql\n" : "", stderr: "" };

    if (file === "env") {
      const joined = args.join(" ");
      assert.match(joined, /-u SUPABASE_ACCESS_TOKEN/);
      assert.match(joined, /-u SUPABASE_PROJECT_ID/);
      assert.match(joined, /-u SUPABASE_PROJECT_REF/);
      assert.equal(joined.includes("supabase login"), false);
      assert.equal(joined.includes("supabase link"), false);
      assert.equal(joined.includes("correct horse battery staple"), false);

      if (joined.includes("db push") && joined.includes("--dry-run")) {
        return { stdout: "Would push migration 202608260001\n", stderr: "" };
      }
      if (joined.includes("db push")) return { stdout: "Finished supabase db push.\n", stderr: "" };
      if (joined.includes("migration list")) return { stdout: "202608260001 | 202608260001\n", stderr: "" };
    }

    return { stdout: "", stderr: "" };
  }

  async exists(path: string): Promise<boolean> {
    return path.endsWith("/supabase/migrations");
  }
  async mkdir(): Promise<void> {}
  async readText(): Promise<string> { return ""; }
  async writeText(): Promise<void> {}
  async chmod(): Promise<void> {}
  async remove(): Promise<void> {}
}

async function fixture() {
  const host = new FakeHost();
  const store = new MemorySecretStore();
  await store.put("projects/migration-app/supabase/POSTGRES_PASSWORD", "correct horse battery staple");
  const placements = new MemoryPlacementStore();
  await placements.put({
    projectId: "migration-app",
    hostId: "node-a",
    projectRoot: "/srv/sbf/migration-app",
    apiGatewayPort: 18000,
  });
  const scheduler = new ProjectScheduler([{
    id: "node-a",
    enabled: true,
    projectRoot: "/srv/sbf",
    gatewayPortStart: 18000,
    gatewayPortEnd: 18010,
    maxProjects: 11,
  }], placements);

  return {
    host,
    controller: new DockerMigrationController({
      scheduler,
      hosts: new HostExecutorRegistry([host]),
      secretStore: store,
    }),
  };
}

test("migration plan runs pinned CLI dry-run without Cloud project binding and redacts credentials", async () => {
  const { controller, host } = await fixture();
  const result = await controller.plan("migration-app", {
    workdir: "/srv/checkouts/app",
    expectedGitCommit: host.expectedCommit,
  });

  assert.equal(result.cliVersion, SUPABASE_CLI_BASELINE);
  assert.equal(result.pending, true);
  assert.equal(result.requiresExplicitApply, true);
  assert.equal(result.cloudManagementCredentialsRequired, false);
  assert.equal(result.sourceGitCommit, host.expectedCommit);
  assert.equal(JSON.stringify(result).includes("correct horse battery staple"), false);
  assert.ok(host.calls.some((call) => call.file === "env" && call.args.includes("--dry-run")));
});

test("migration apply always performs a fresh dry-run before mutating push", async () => {
  const { controller, host } = await fixture();
  const result = await controller.apply("migration-app", {
    workdir: "/srv/checkouts/app",
    expectedGitCommit: host.expectedCommit,
  }, "APPLY_MIGRATIONS");

  assert.equal(result.applied, true);
  const envCalls = host.calls.filter((call) => call.file === "env");
  const dryRunIndex = envCalls.findIndex((call) => call.args.includes("--dry-run"));
  const applyIndex = envCalls.findIndex((call) => call.args.includes("push") && !call.args.includes("--dry-run"));
  assert.ok(dryRunIndex >= 0);
  assert.ok(applyIndex > dryRunIndex);
  assert.match(result.migrationHistory, /202608260001/);
});

test("migration controller refuses dirty tracked source when commit reproducibility is required", async () => {
  const { controller, host } = await fixture();
  host.dirty = true;
  await assert.rejects(() => controller.plan("migration-app", {
    workdir: "/srv/checkouts/app",
    expectedGitCommit: host.expectedCommit,
  }), /tracked modifications/);
});

test("migration controller rejects CLI version drift before any migration command", async () => {
  const { controller, host } = await fixture();
  const original = host.exec.bind(host);
  host.exec = async (file, args = [], options = {}) => {
    if (file === "supabase" && args[0] === "--version") return { stdout: "2.114.0\n", stderr: "" };
    return original(file, args, options);
  };

  await assert.rejects(() => controller.plan("migration-app", {
    workdir: "/srv/checkouts/app",
    expectedGitCommit: host.expectedCommit,
  }), /version mismatch/);
  assert.equal(host.calls.some((call) => call.file === "env"), false);
});
