import assert from "node:assert/strict";
import test from "node:test";
import {
  FactoryHostPreflight,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
} from "../src/index.ts";

class FakeHost implements FactoryHostExecutor {
  readonly id = "factory-node";
  readonly failures = new Set<string>();
  composeVersion = "2.35.1";
  supabaseVersion = "2.115.0";

  async exec(file: string, args: readonly string[] = [], _options: HostCommandOptions = {}): Promise<HostCommandResult> {
    const key = `${file} ${args.join(" ")}`;
    if (this.failures.has(file) || this.failures.has(key)) throw new Error(`${file} unavailable`);
    if (file === "git") return { stdout: "git version 2.55.0\n", stderr: "" };
    if (file === "docker" && args[0] === "--version") return { stdout: "Docker version 28.3.3, build deadbeef\n", stderr: "" };
    if (file === "docker" && args[0] === "compose") return { stdout: `${this.composeVersion}\n`, stderr: "" };
    if (file === "supabase") return { stdout: `${this.supabaseVersion}\n`, stderr: "" };
    if (file === "caddy") return { stdout: "v2.10.2 h1:abc\n", stderr: "" };
    if (file === "aws") return { stdout: "aws-cli/2.28.14 Python/3.13.7 Linux/6.8\n", stderr: "" };
    if (file === "rclone") return { stdout: "rclone v1.71.0\n", stderr: "" };
    if (file === "wal-g") return { stdout: "wal-g version v3.0.7\n", stderr: "" };
    if (file === "getent") return { stdout: "getent (GNU libc) 2.39\n", stderr: "" };
    if (file === "sh") return { stdout: "", stderr: "" };
    return { stdout: "", stderr: "" };
  }
  async exists(): Promise<boolean> { return true; }
  async mkdir(): Promise<void> {}
  async readText(): Promise<string> { return ""; }
  async writeText(): Promise<void> {}
  async chmod(): Promise<void> {}
  async remove(): Promise<void> {}
}

test("production host preflight reports ready when pinned/core capabilities are present", async () => {
  const host = new FakeHost();
  const report = await new FactoryHostPreflight(host).run({ walG: true });
  assert.equal(report.ready, true);
  assert.deepEqual(report.missingRequired, []);
  assert.equal(report.checks.find((check) => check.capability === "supabase-cli")?.version, "2.115.0");
  assert.equal(report.checks.find((check) => check.capability === "ram-staging")?.ok, true);
});

test("host preflight fails closed on Supabase CLI version drift and old Compose", async () => {
  const host = new FakeHost();
  host.supabaseVersion = "2.116.0";
  host.composeVersion = "2.23.3";
  const report = await new FactoryHostPreflight(host).run();
  assert.equal(report.ready, false);
  assert.ok(report.missingRequired.includes("supabase-cli"));
  assert.ok(report.missingRequired.includes("docker-compose"));
  assert.match(report.checks.find((check) => check.capability === "supabase-cli")?.detail ?? "", /pinned 2\.115\.0/);
});

test("optional WAL-G absence does not block non-PITR host but blocks PITR host", async () => {
  const host = new FakeHost();
  host.failures.add("wal-g");
  const ordinary = await new FactoryHostPreflight(host).run({ walG: false });
  assert.equal(ordinary.ready, true);
  assert.equal(ordinary.checks.find((check) => check.capability === "wal-g")?.required, false);

  const pitr = await new FactoryHostPreflight(host).run({ walG: true });
  assert.equal(pitr.ready, false);
  assert.ok(pitr.missingRequired.includes("wal-g"));
});

test("missing writable /dev/shm blocks secure staging when required", async () => {
  const host = new FakeHost();
  host.failures.add("sh");
  const required = await new FactoryHostPreflight(host).run({ ramStaging: true });
  assert.equal(required.ready, false);
  assert.ok(required.missingRequired.includes("ram-staging"));

  const optional = await new FactoryHostPreflight(host).run({ ramStaging: false });
  assert.equal(optional.missingRequired.includes("ram-staging"), false);
});
