import assert from "node:assert/strict";
import test from "node:test";
import {
  CaddyReverseProxyBindingProvider,
  ProjectEdgeBindingController,
  WildcardDnsVerifier,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
} from "../src/index.ts";

class FakeHost implements FactoryHostExecutor {
  readonly id = "edge-node";
  readonly files = new Map<string, string>([["/etc/caddy/Caddyfile", "{\n  email admin@example.invalid\n}\n"]]);
  readonly calls: Array<{ file: string; args: readonly string[] }> = [];
  resolvedIp = "203.0.113.10";
  async exec(file: string, args: readonly string[] = [], _options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.calls.push({ file, args });
    if (file === "getent") return { stdout: `${this.resolvedIp} STREAM api.demo.example.de\n${this.resolvedIp} DGRAM api.demo.example.de\n`, stderr: "" };
    if (file === "caddy") return { stdout: "ok\n", stderr: "" };
    return { stdout: "", stderr: "" };
  }
  async exists(path: string): Promise<boolean> { return this.files.has(path); }
  async mkdir(): Promise<void> {}
  async readText(path: string): Promise<string> { const value = this.files.get(path); if (value === undefined) throw new Error("missing file"); return value; }
  async writeText(path: string, content: string): Promise<void> { this.files.set(path, content); }
  async chmod(): Promise<void> {}
  async remove(): Promise<void> {}
}

test("wildcard DNS verifier allows project hostnames only when they resolve to expected Factory IP", async () => {
  const host = new FakeHost();
  const dns = new WildcardDnsVerifier({ host, domainSuffix: "example.de", expectedIp: "203.0.113.10" });
  assert.equal(await dns.verify("api.demo.example.de"), true);
  assert.equal(await dns.verify("api.other-domain.de"), false);
  host.resolvedIp = "203.0.113.99";
  assert.equal(await dns.verify("api.demo.example.de"), false);
});

test("Caddy binding imports managed fragments once and proxies only to loopback Envoy port", async () => {
  const host = new FakeHost();
  const proxy = new CaddyReverseProxyBindingProvider({ host });
  await proxy.ensure({ projectId: "demo-app", hostname: "api.demo.example.de", upstream: "127.0.0.1:18042" });
  await proxy.ensure({ projectId: "demo-app", hostname: "api.demo.example.de", upstream: "127.0.0.1:18042" });

  const main = host.files.get("/etc/caddy/Caddyfile") ?? "";
  assert.equal(main.split("import /etc/caddy/supabase-factory.d/*.caddy").length - 1, 1);
  const fragment = host.files.get("/etc/caddy/supabase-factory.d/demo-app.caddy") ?? "";
  assert.match(fragment, /api\.demo\.example\.de/);
  assert.match(fragment, /reverse_proxy 127\.0\.0\.1:18042/);
  assert.ok(host.calls.some((call) => call.file === "caddy" && call.args[0] === "validate"));
  assert.ok(host.calls.some((call) => call.file === "caddy" && call.args[0] === "reload"));
  await assert.rejects(() => proxy.ensure({ projectId: "demo-app", hostname: "api.demo.example.de", upstream: "10.0.0.5:8000" }), /loopback/);
});

test("edge controller combines tokenless wildcard DNS with Caddy HTTPS binding", async () => {
  const host = new FakeHost();
  const controller = new ProjectEdgeBindingController({
    dns: new WildcardDnsVerifier({ host, domainSuffix: "example.de", expectedIp: "203.0.113.10" }),
    proxy: new CaddyReverseProxyBindingProvider({ host }),
  });
  const binding = await controller.bind({
    projectId: "demo-app",
    hostname: "api.demo.example.de",
    placement: { projectId: "demo-app", hostId: "edge-node", projectRoot: "/srv/sbf/demo-app", apiGatewayPort: 18042 },
  });
  assert.deepEqual(binding, {
    projectId: "demo-app",
    hostname: "api.demo.example.de",
    publicUrl: "https://api.demo.example.de",
    upstream: "127.0.0.1:18042",
    dnsVerified: true,
    tlsManagedBy: "caddy",
  });
});

test("edge controller refuses to write proxy config when wildcard DNS is wrong", async () => {
  const host = new FakeHost();
  host.resolvedIp = "198.51.100.7";
  const controller = new ProjectEdgeBindingController({
    dns: new WildcardDnsVerifier({ host, domainSuffix: "example.de", expectedIp: "203.0.113.10" }),
    proxy: new CaddyReverseProxyBindingProvider({ host }),
  });
  await assert.rejects(() => controller.bind({
    projectId: "demo-app",
    hostname: "api.demo.example.de",
    placement: { projectId: "demo-app", hostId: "edge-node", projectRoot: "/srv/sbf/demo-app", apiGatewayPort: 18042 },
  }), /wildcard DNS/);
  assert.equal(host.files.has("/etc/caddy/supabase-factory.d/demo-app.caddy"), false);
});
