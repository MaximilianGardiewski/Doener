import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudflareQuickTunnelController,
  CloudflareQuickTunnelRuntimeBindingProvider,
  FACTORY_API_VERSION,
  resolveManifest,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
} from "../src/index.ts";

class FakeHost implements FactoryHostExecutor {
  readonly id = "node-a";
  readonly files = new Map<string, string>();
  readonly commands: Array<{ file: string; args: readonly string[] }> = [];
  readonly active = new Set<string>();
  invocationId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  journal = "INF Requesting new quick Tunnel on trycloudflare.com...\nINF https://calm-fox-runs.trycloudflare.com\n";

  async exec(file: string, args: readonly string[] = [], _options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.commands.push({ file, args });
    if (file === "systemctl" && args[0] === "is-active") {
      const unit = args.at(-1) ?? "";
      if (!this.active.has(unit)) throw new Error("inactive");
      return { stdout: "active\n", stderr: "" };
    }
    if (file === "systemctl" && args[0] === "start") {
      this.active.add(args[1] ?? "");
      return { stdout: "", stderr: "" };
    }
    if (file === "systemctl" && args[0] === "stop") {
      this.active.delete(args[1] ?? "");
      return { stdout: "", stderr: "" };
    }
    if (file === "systemctl" && args[0] === "show") return { stdout: `${this.invocationId}\n`, stderr: "" };
    if (file === "systemctl" && args[0] === "daemon-reload") return { stdout: "", stderr: "" };
    if (file === "journalctl") return { stdout: this.journal, stderr: "" };
    return { stdout: "", stderr: "" };
  }

  async exists(path: string): Promise<boolean> { return this.files.has(path); }
  async mkdir(): Promise<void> {}
  async readText(path: string): Promise<string> {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`missing ${path}`);
    return value;
  }
  async writeText(path: string, content: string): Promise<void> { this.files.set(path, content); }
  async chmod(): Promise<void> {}
  async remove(path: string): Promise<void> { this.files.delete(path); }
}

function controller(host: FakeHost) {
  return new CloudflareQuickTunnelController({ host, pollIntervalMs: 0, urlTimeoutMs: 1_000 });
}

function manifest(environment: "development" | "staging" | "production" = "development", profile: "minimal" | "production-critical" = "minimal") {
  return resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "test-e2e", environment },
    profile,
  });
}

const placement = {
  projectId: "test-e2e",
  hostId: "node-a",
  projectRoot: "/srv/supabase-factory/test-e2e",
  apiGatewayPort: 18001,
} as const;

test("Quick Tunnel unit is anonymous, direct-to-Envoy and isolated from operator cloudflared config", () => {
  const host = new FakeHost();
  const unit = controller(host).renderUnit("test-e2e", "127.0.0.1:18001");

  assert.match(unit, /cloudflared tunnel --no-autoupdate --url http:\/\/127\.0\.0\.1:18001/);
  assert.match(unit, /Environment=HOME=\/run\/supabase-factory-quick-test-e2e/);
  assert.match(unit, /DynamicUser=yes/);
  assert.match(unit, /Restart=no/);
  assert.equal(unit.includes("api.cloudflare.com"), false);
  assert.equal(unit.includes("CLOUDFLARE_API_TOKEN"), false);
  assert.equal(unit.includes("Bearer"), false);
  assert.equal(unit.includes("credentials"), false);
  assert.equal(unit.includes("caddy"), false);
});

test("runtime binding starts Quick Tunnel, captures random HTTPS URL and feeds it into Supabase endpoints", async () => {
  const host = new FakeHost();
  const provider = new CloudflareQuickTunnelRuntimeBindingProvider(controller(host));
  const binding = await provider.resolve(manifest(), placement);

  assert.deepEqual(binding, {
    endpoints: {
      publicUrl: "https://calm-fox-runs.trycloudflare.com",
      siteUrl: "https://calm-fox-runs.trycloudflare.com",
    },
  });
  assert.ok(host.commands.some(({ file, args }) => file === "systemctl" && args[0] === "start"));
  assert.ok(host.commands.some(({ file, args }) => file === "journalctl" && args[0] === `_SYSTEMD_INVOCATION_ID=${host.invocationId}`));
  assert.equal(host.commands.some(({ file }) => file === "caddy"), false);
  assert.equal(host.commands.some(({ file }) => file === "getent"), false);
  assert.equal(JSON.stringify(host.commands).includes("api.cloudflare.com"), false);
});

test("re-resolving an unchanged active Quick Tunnel is idempotent and does not churn its URL", async () => {
  const host = new FakeHost();
  const provider = new CloudflareQuickTunnelRuntimeBindingProvider(controller(host));
  await provider.resolve(manifest(), placement);
  await provider.resolve(manifest(), placement);

  const starts = host.commands.filter(({ file, args }) => file === "systemctl" && args[0] === "start");
  const stops = host.commands.filter(({ file, args }) => file === "systemctl" && args[0] === "stop");
  assert.equal(starts.length, 1);
  assert.equal(stops.length, 0);
});

test("Quick Tunnel supports current and forward-compatible TryCloudflare hostname suffixes", async () => {
  const host = new FakeHost();
  host.journal = "old https://old-one.trycloudflare.com\nnew https://bright-cat.trycloudflare.app\n";
  const binding = await controller(host).ensure({ projectId: "test-e2e", upstream: "127.0.0.1:18001" });
  assert.equal(binding.publicUrl, "https://bright-cat.trycloudflare.app");
  assert.equal(binding.ephemeral, true);
  assert.equal(binding.tlsManagedBy, "cloudflare");
});

test("Quick Tunnel fails closed for production and production-critical projects", async () => {
  const host = new FakeHost();
  const provider = new CloudflareQuickTunnelRuntimeBindingProvider(controller(host));

  await assert.rejects(() => provider.resolve(manifest("production"), placement), /forbidden for production/);
  await assert.rejects(() => provider.resolve(manifest("staging", "production-critical"), placement), /forbidden for production/);
  assert.equal(host.commands.length, 0);
});

test("Quick Tunnel refuses unrelated systemd units and cleanup removes only Factory-owned unit", async () => {
  const host = new FakeHost();
  const tunnel = controller(host);
  const path = tunnel.unitPath("test-e2e");
  host.files.set(path, "[Service]\nExecStart=/bin/false\n");
  await assert.rejects(
    () => tunnel.ensure({ projectId: "test-e2e", upstream: "127.0.0.1:18001" }),
    /refusing to overwrite non-Factory/,
  );

  host.files.delete(path);
  await tunnel.ensure({ projectId: "test-e2e", upstream: "127.0.0.1:18001" });
  assert.equal(host.files.has(path), true);
  await tunnel.stop("test-e2e");
  assert.equal(host.files.has(path), false);
  assert.ok(host.commands.some(({ file, args }) => file === "systemctl" && args[0] === "stop"));
});
