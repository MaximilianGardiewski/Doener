import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  createSingleHostQuickTunnelFactory,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
} from "../src/index.ts";

class ReadyHost implements FactoryHostExecutor {
  readonly id = "local";
  readonly commands: Array<{ file: string; args: readonly string[] }> = [];

  async exec(file: string, args: readonly string[] = [], _options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.commands.push({ file, args });
    if (file === "git") return { stdout: "git version 2.55.0\n", stderr: "" };
    if (file === "docker" && args[0] === "--version") return { stdout: "Docker version 28.3.3, build deadbeef\n", stderr: "" };
    if (file === "docker" && args[0] === "compose") return { stdout: "2.35.1\n", stderr: "" };
    if (file === "supabase") return { stdout: "2.115.0\n", stderr: "" };
    if (file === "cloudflared") return { stdout: "cloudflared version 2026.8.1\n", stderr: "" };
    if (file === "systemctl") return { stdout: "systemd 258\n", stderr: "" };
    if (file === "journalctl") return { stdout: "systemd 258\n", stderr: "" };
    if (file === "sh") return { stdout: "", stderr: "" };
    throw new Error(`${file} unavailable`);
  }
  async exists(): Promise<boolean> { return false; }
  async mkdir(): Promise<void> {}
  async readText(): Promise<string> { throw new Error("missing"); }
  async writeText(): Promise<void> {}
  async chmod(): Promise<void> {}
  async remove(): Promise<void> {}
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "sbf-single-"));
  const dataDir = join(root, "data");
  const projectRoot = join(root, "projects");
  const token = "mcp-" + "x".repeat(64);
  const factory = await createSingleHostQuickTunnelFactory({
    dataDir,
    projectRoot,
    masterKey: Buffer.alloc(32, 7),
    mcpBearerToken: token,
    host: new ReadyHost(),
  });
  return { root, dataDir, projectRoot, token, factory };
}

test("single-host composition wires persistent core + migrations + authenticated MCP without custom TypeScript", async () => {
  const { factory } = await fixture();
  assert.equal(factory.mcpPort, 18787);
  assert.equal(factory.mcpPath, "/mcp");
  assert.ok(factory.agentApi.handlers["factory.project.plan"]);
  assert.ok(factory.agentApi.handlers["factory.project.create"]);
  assert.ok(factory.agentApi.handlers["factory.project.list"]);
  assert.ok(factory.agentApi.handlers["factory.health.check"]);
  assert.ok(factory.agentApi.handlers["factory.migrations.plan"]);
  assert.ok(factory.agentApi.handlers["factory.migrations.apply"]);
  assert.equal(factory.agentApi.handlers["factory.backup.create"], undefined);
  assert.equal(factory.agentApi.handlers["factory.restore.apply"], undefined);
});

test("single-host composition persists MCP bearer only inside encrypted SecretStore", async () => {
  const { dataDir, token } = await fixture();
  const ciphertext = await readFile(join(dataDir, "secrets.enc.json"), "utf8");
  assert.equal(ciphertext.includes(token), false);
  assert.match(ciphertext, /"algorithm":"aes-256-gcm"/);
});

test("single-host core preflight requires Quick Tunnel + migration stack but not Caddy/AWS/rclone/DNS", async () => {
  const { factory } = await fixture();
  const report = await factory.checkReady();
  assert.equal(report.ready, true);
  for (const capability of ["caddy", "aws-cli", "rclone", "dns-resolver", "ram-staging"] as const) {
    assert.equal(report.checks.find((check) => check.capability === capability)?.required, false);
  }
  for (const capability of ["cloudflared", "systemd", "systemd-journal", "supabase-cli"] as const) {
    assert.equal(report.checks.find((check) => check.capability === capability)?.required, true);
  }
});

test("agent plan works through composed API without touching Docker for a new project", async () => {
  const { factory } = await fixture();
  const host = factory.host as ReadyHost;
  const result = await factory.agentApi.invoke({
    principal: { id: "chatgpt-admin", roles: ["administrator"] },
    tool: "factory.project.plan",
    arguments: {
      manifest: {
        apiVersion: FACTORY_API_VERSION,
        project: { id: "mcello-dev", environment: "development" },
        profile: "minimal",
      },
    },
  }) as { projectId: string; operations: readonly unknown[] };
  assert.equal(result.projectId, "mcello-dev");
  assert.ok(result.operations.length > 0);
  assert.equal(host.commands.some(({ file }) => file === "docker"), false);
});

test("single-host composition rejects weak bearer material and MCP/gateway port overlap", async () => {
  const root = await mkdtemp(join(tmpdir(), "sbf-single-invalid-"));
  const base = {
    dataDir: join(root, "data"),
    projectRoot: join(root, "projects"),
    masterKey: Buffer.alloc(32, 1),
    host: new ReadyHost(),
  };
  await assert.rejects(
    () => createSingleHostQuickTunnelFactory({ ...base, mcpBearerToken: "too-short" }),
    /at least 32/,
  );
  await assert.rejects(
    () => createSingleHostQuickTunnelFactory({ ...base, mcpBearerToken: "x".repeat(64), gatewayPortStart: 18000, gatewayPortEnd: 19000, mcpPort: 18787 }),
    /must not overlap/,
  );
});
