import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudflareCaddyRouterProvider,
  CloudflareTunnelController,
  CloudflareTunnelDnsVerifier,
  CloudflareTunnelEdgeProvider,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
} from "../src/index.ts";

class FakeHost implements FactoryHostExecutor {
  readonly id = "node-a";
  readonly files = new Map<string, string>();
  readonly commands: Array<{ file: string; args: readonly string[] }> = [];
  dnsOk = true;

  constructor() {
    this.files.set("/etc/cloudflared/factory.json", "{\"AccountTag\":\"x\"}\n");
    this.files.set("/etc/caddy/Caddyfile", "{\n  admin 127.0.0.1:2019\n}\n");
  }

  async exec(file: string, args: readonly string[] = [], _options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.commands.push({ file, args });
    if (file === "getent") {
      if (!this.dnsOk) throw new Error("not found");
      return { stdout: "104.16.1.1 STREAM probe.supabase.example.com\n", stderr: "" };
    }
    if (file === "cloudflared" && args.includes("info")) {
      return { stdout: "CONNECTOR ID  created  arch  version\nabc  now  linux  2026.8.1\n", stderr: "" };
    }
    if (file === "systemctl" && args[0] === "is-active") return { stdout: "", stderr: "" };
    if (file === "caddy") return { stdout: "valid configuration\n", stderr: "" };
    return { stdout: "ok\n", stderr: "" };
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

const TUNNEL_ID = "123e4567-e89b-42d3-a456-426614174000";

function createEdge(host: FakeHost) {
  const tunnel = new CloudflareTunnelController({
    host,
    tunnelId: TUNNEL_ID,
    credentialsFile: "/etc/cloudflared/factory.json",
    configPath: "/etc/cloudflared/supabase-factory.yml",
    domainSuffix: "supabase.example.com",
    routerAddress: "127.0.0.1:18080",
  });
  const router = new CloudflareCaddyRouterProvider({
    host,
    mainConfigPath: "/etc/caddy/Caddyfile",
    routerFile: "/etc/caddy/supabase-factory-tunnel.caddy",
    routeDirectory: "/etc/caddy/supabase-factory-tunnel.d",
    routerAddress: "127.0.0.1:18080",
  });
  return {
    tunnel,
    edge: new CloudflareTunnelEdgeProvider({
      dns: new CloudflareTunnelDnsVerifier({ host, domainSuffix: "supabase.example.com" }),
      tunnel,
      router,
    }),
  };
}

test("Cloudflare tunnel config is static wildcard ingress to a loopback router with 404 catch-all", () => {
  const host = new FakeHost();
  const { tunnel } = createEdge(host);
  const config = tunnel.renderConfig();

  assert.match(config, new RegExp(`tunnel: "${TUNNEL_ID}"`));
  assert.match(config, /hostname: "\*\.supabase\.example\.com"/);
  assert.match(config, /service: "http:\/\/127\.0\.0\.1:18080"/);
  assert.match(config, /service: http_status:404/);
  assert.equal(config.includes("api.cloudflare.com"), false);
  assert.equal(config.includes("token"), false);
});

test("project binding updates only local Caddy route and never restarts cloudflared", async () => {
  const host = new FakeHost();
  const { edge } = createEdge(host);

  const binding = await edge.bind({
    projectId: "customer-one",
    hostname: "customer-one.supabase.example.com",
    placement: {
      projectId: "customer-one",
      hostId: "node-a",
      projectRoot: "/srv/sbf/customer-one",
      apiGatewayPort: 18001,
    },
  });

  assert.equal(binding.tlsManagedBy, "cloudflare");
  assert.equal(binding.publicUrl, "https://customer-one.supabase.example.com");
  assert.equal(binding.upstream, "127.0.0.1:18001");
  assert.match(host.files.get("/etc/caddy/supabase-factory-tunnel.d/customer-one.caddy") ?? "", /reverse_proxy 127\.0\.0\.1:18001/);
  assert.match(host.files.get("/etc/caddy/supabase-factory-tunnel.caddy") ?? "", /http:\/\/127\.0\.0\.1:18080/);
  assert.equal(host.commands.some(({ file, args }) => file === "systemctl" && args.includes("restart")), false);
  assert.equal(host.commands.some(({ file, args }) => file === "cloudflared" && args.includes("run")), false);
  assert.ok(host.commands.some(({ file, args }) => file === "caddy" && args[0] === "reload"));
});

test("Factory refuses to overwrite an unrelated cloudflared config", async () => {
  const host = new FakeHost();
  host.files.set("/etc/cloudflared/supabase-factory.yml", "tunnel: someone-elses-config\n");
  const { tunnel } = createEdge(host);
  await assert.rejects(() => tunnel.ensureConfigured(), /refusing to overwrite non-Factory/);
});

test("Cloudflare tunnel edge fails closed when wildcard DNS does not resolve", async () => {
  const host = new FakeHost();
  host.dnsOk = false;
  const { edge } = createEdge(host);

  await assert.rejects(() => edge.bind({
    projectId: "customer-one",
    hostname: "customer-one.supabase.example.com",
    placement: {
      projectId: "customer-one",
      hostId: "node-a",
      projectRoot: "/srv/sbf/customer-one",
      apiGatewayPort: 18001,
    },
  }), /does not resolve publicly/);

  assert.equal(host.files.has("/etc/caddy/supabase-factory-tunnel.d/customer-one.caddy"), false);
});

test("Cloudflare route management contains no per-project Cloudflare API credential surface", async () => {
  const host = new FakeHost();
  const { edge } = createEdge(host);
  await edge.bind({
    projectId: "customer-two",
    hostname: "customer-two.supabase.example.com",
    placement: {
      projectId: "customer-two",
      hostId: "node-a",
      projectRoot: "/srv/sbf/customer-two",
      apiGatewayPort: 18002,
    },
  });

  const serializedCommands = JSON.stringify(host.commands);
  assert.equal(serializedCommands.includes("api.cloudflare.com"), false);
  assert.equal(serializedCommands.includes("Authorization"), false);
  assert.equal(serializedCommands.includes("Bearer"), false);
  assert.equal(serializedCommands.includes("CLOUDFLARE_API_TOKEN"), false);
});
