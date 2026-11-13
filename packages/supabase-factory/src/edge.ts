import type { FactoryHostExecutor } from "./host.ts";
import type { ProjectPlacement } from "./placement.ts";

export interface ProjectEdgeBinding {
  projectId: string;
  hostname: string;
  publicUrl: string;
  upstream: string;
  dnsVerified: true;
  tlsManagedBy: "caddy";
}

export interface DnsBindingProvider {
  verify(hostname: string): Promise<boolean>;
}

export interface ReverseProxyBindingProvider {
  ensure(input: { projectId: string; hostname: string; upstream: string }): Promise<void>;
}

function validHostname(value: string): string {
  const hostname = value.trim().toLowerCase();
  if (hostname.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname)) {
    throw new Error("edge hostname must be a valid DNS hostname");
  }
  return hostname;
}

function safeProjectId(value: string): string {
  if (!/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/.test(value)) throw new Error("invalid project ID for edge binding");
  return value;
}

/**
 * Token-free per-project DNS strategy: configure one wildcard A/AAAA record once
 * at the DNS provider, then Factory only verifies that each generated hostname
 * resolves to the expected host IP. No DNS API token is needed for new projects.
 */
export class WildcardDnsVerifier implements DnsBindingProvider {
  readonly host: FactoryHostExecutor;
  readonly domainSuffix: string;
  readonly expectedIp: string;

  constructor(options: { host: FactoryHostExecutor; domainSuffix: string; expectedIp: string }) {
    this.host = options.host;
    this.domainSuffix = validHostname(`x.${options.domainSuffix}`).slice(2);
    this.expectedIp = options.expectedIp.trim();
    if (!this.expectedIp) throw new Error("expected wildcard DNS target IP is required");
  }

  async verify(hostname: string): Promise<boolean> {
    const host = validHostname(hostname);
    if (!host.endsWith(`.${this.domainSuffix}`)) return false;
    try {
      const result = await this.host.exec("getent", ["ahosts", host], { timeoutMs: 15_000 });
      const addresses = result.stdout.split(/\r?\n/).map((line) => line.trim().split(/\s+/)[0]).filter(Boolean);
      return addresses.includes(this.expectedIp);
    } catch {
      return false;
    }
  }
}

/**
 * Caddy adapter for the official production pattern: HTTPS terminates before
 * Envoy and reverse-proxies to the project's loopback gateway port. Caddy's
 * reverse_proxy handles WebSocket upgrades and standard X-Forwarded headers.
 */
export class CaddyReverseProxyBindingProvider implements ReverseProxyBindingProvider {
  readonly host: FactoryHostExecutor;
  readonly mainConfigPath: string;
  readonly fragmentDirectory: string;

  constructor(options: {
    host: FactoryHostExecutor;
    mainConfigPath?: string;
    fragmentDirectory?: string;
  }) {
    this.host = options.host;
    this.mainConfigPath = options.mainConfigPath ?? "/etc/caddy/Caddyfile";
    this.fragmentDirectory = options.fragmentDirectory ?? "/etc/caddy/supabase-factory.d";
    if (!this.mainConfigPath.startsWith("/") || !this.fragmentDirectory.startsWith("/")) {
      throw new Error("Caddy configuration paths must be absolute");
    }
  }

  async #ensureImport(): Promise<void> {
    if (!(await this.host.exists(this.mainConfigPath))) throw new Error(`Caddy main config is missing: ${this.mainConfigPath}`);
    const source = await this.host.readText(this.mainConfigPath);
    const directive = `import ${this.fragmentDirectory}/*.caddy`;
    if (!source.split(/\r?\n/).some((line) => line.trim() === directive)) {
      const next = `${source.replace(/\s*$/, "")}\n\n# Supabase Factory managed project routes\n${directive}\n`;
      await this.host.writeText(this.mainConfigPath, next, 0o640);
    }
  }

  async ensure(input: { projectId: string; hostname: string; upstream: string }): Promise<void> {
    const projectId = safeProjectId(input.projectId);
    const hostname = validHostname(input.hostname);
    if (!/^127\.0\.0\.1:\d{2,5}$/.test(input.upstream)) throw new Error("Factory Caddy upstream must be a loopback host:port");
    await this.host.mkdir(this.fragmentDirectory, 0o750);
    await this.#ensureImport();
    const fragment = `${this.fragmentDirectory}/${projectId}.caddy`;
    const content = [
      `# Managed by Supabase Factory for ${projectId}`,
      `${hostname} {`,
      `  reverse_proxy ${input.upstream}`,
      `}`,
      "",
    ].join("\n");
    await this.host.writeText(fragment, content, 0o640);
    await this.host.exec("caddy", ["validate", "--config", this.mainConfigPath, "--adapter", "caddyfile"], { timeoutMs: 30_000 });
    await this.host.exec("caddy", ["reload", "--config", this.mainConfigPath, "--adapter", "caddyfile"], { timeoutMs: 30_000 });
  }
}

export class ProjectEdgeBindingController {
  readonly dns: DnsBindingProvider;
  readonly proxy: ReverseProxyBindingProvider;

  constructor(options: { dns: DnsBindingProvider; proxy: ReverseProxyBindingProvider }) {
    this.dns = options.dns;
    this.proxy = options.proxy;
  }

  async bind(input: { projectId: string; hostname: string; placement: ProjectPlacement }): Promise<ProjectEdgeBinding> {
    const projectId = safeProjectId(input.projectId);
    if (input.placement.projectId !== projectId) throw new Error("edge binding placement belongs to a different project");
    const hostname = validHostname(input.hostname);
    if (!(await this.dns.verify(hostname))) {
      throw new Error(`wildcard DNS for ${hostname} does not resolve to the expected Factory host`);
    }
    const upstream = `127.0.0.1:${input.placement.apiGatewayPort}`;
    await this.proxy.ensure({ projectId, hostname, upstream });
    return {
      projectId,
      hostname,
      publicUrl: `https://${hostname}`,
      upstream,
      dnsVerified: true,
      tlsManagedBy: "caddy",
    };
  }
}
