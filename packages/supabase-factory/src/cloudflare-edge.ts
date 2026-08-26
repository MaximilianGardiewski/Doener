import type { FactoryHostExecutor } from "./host.ts";
import type { ProjectPlacement } from "./placement.ts";

export interface CloudflareTunnelEdgeBinding {
  projectId: string;
  hostname: string;
  publicUrl: string;
  upstream: string;
  tunnelRouter: string;
  dnsVerified: true;
  tlsManagedBy: "cloudflare";
}

function validHostname(value: string): string {
  const hostname = value.trim().toLowerCase();
  if (hostname.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname)) {
    throw new Error("Cloudflare edge hostname must be a valid DNS hostname");
  }
  return hostname;
}

function safeProjectId(value: string): string {
  if (!/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/.test(value)) throw new Error("invalid project ID for Cloudflare edge binding");
  return value;
}

function validUuid(value: string): string {
  const uuid = value.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid)) {
    throw new Error("Cloudflare tunnel ID must be a UUID");
  }
  return uuid;
}

function validLoopback(value: string): string {
  const target = value.trim();
  if (!/^127\.0\.0\.1:\d{2,5}$/.test(target)) throw new Error("Cloudflare Factory upstream must be a loopback host:port");
  const port = Number(target.split(":")[1]);
  if (port < 1024 || port > 65535) throw new Error("Cloudflare Factory upstream port is invalid");
  return target;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Verifies that a hostname under the Factory suffix resolves publicly. In tunnel
 * mode the resolved IP is Cloudflare-owned rather than the origin server, so the
 * final proof that DNS + Tunnel + router point at the correct project remains the
 * existing public end-to-end Supabase health check.
 */
export class CloudflareTunnelDnsVerifier {
  readonly host: FactoryHostExecutor;
  readonly domainSuffix: string;

  constructor(options: { host: FactoryHostExecutor; domainSuffix: string }) {
    this.host = options.host;
    this.domainSuffix = validHostname(`x.${options.domainSuffix}`).slice(2);
  }

  async verify(hostname: string): Promise<boolean> {
    const candidate = validHostname(hostname);
    if (!candidate.endsWith(`.${this.domainSuffix}`)) return false;
    try {
      const result = await this.host.exec("getent", ["ahosts", candidate], { timeoutMs: 15_000 });
      return result.stdout.split(/\r?\n/).some((line) => /^\s*(?:\d{1,3}\.){3}\d{1,3}\s|^\s*[0-9a-f:]+\s/i.test(line));
    } catch {
      return false;
    }
  }
}

/**
 * Owns a dedicated locally-managed Cloudflare Tunnel configuration for Factory.
 * The configuration is intentionally static: one wildcard hostname routes to a
 * single loopback Caddy router. New projects therefore do not require Cloudflare
 * API calls and do not restart cloudflared/WebSocket connections.
 */
export class CloudflareTunnelController {
  readonly host: FactoryHostExecutor;
  readonly tunnelId: string;
  readonly credentialsFile: string;
  readonly configPath: string;
  readonly domainSuffix: string;
  readonly routerAddress: string;
  readonly serviceName: string;

  constructor(options: {
    host: FactoryHostExecutor;
    tunnelId: string;
    credentialsFile: string;
    domainSuffix: string;
    configPath?: string;
    routerAddress?: string;
    serviceName?: string;
  }) {
    this.host = options.host;
    this.tunnelId = validUuid(options.tunnelId);
    this.credentialsFile = options.credentialsFile;
    this.configPath = options.configPath ?? "/etc/cloudflared/supabase-factory.yml";
    this.domainSuffix = validHostname(`x.${options.domainSuffix}`).slice(2);
    this.routerAddress = validLoopback(options.routerAddress ?? "127.0.0.1:18080");
    this.serviceName = options.serviceName ?? "cloudflared.service";
    if (!this.credentialsFile.startsWith("/") || !this.configPath.startsWith("/")) {
      throw new Error("Cloudflare credentials/config paths must be absolute");
    }
  }

  renderConfig(): string {
    return [
      "# Managed by Supabase Factory. Dedicated Factory tunnel only.",
      `tunnel: ${yamlString(this.tunnelId)}`,
      `credentials-file: ${yamlString(this.credentialsFile)}`,
      "ingress:",
      `  - hostname: ${yamlString(`*.${this.domainSuffix}`)}`,
      `    service: ${yamlString(`http://${this.routerAddress}`)}`,
      "  - service: http_status:404",
      "",
    ].join("\n");
  }

  async ensureConfigured(): Promise<void> {
    if (!(await this.host.exists(this.credentialsFile))) {
      throw new Error(`Cloudflare tunnel credentials are missing: ${this.credentialsFile}`);
    }
    if (await this.host.exists(this.configPath)) {
      const existing = await this.host.readText(this.configPath);
      if (!existing.startsWith("# Managed by Supabase Factory.")) {
        throw new Error(`refusing to overwrite non-Factory cloudflared config: ${this.configPath}`);
      }
    }
    await this.host.writeText(this.configPath, this.renderConfig(), 0o600);
    await this.host.exec("cloudflared", ["tunnel", "--config", this.configPath, "ingress", "validate"], { timeoutMs: 30_000 });
    await this.host.exec("cloudflared", ["tunnel", "--config", this.configPath, "ingress", "rule", `https://probe.${this.domainSuffix}`], { timeoutMs: 30_000 });
  }

  async verifyActive(): Promise<void> {
    await this.host.exec("systemctl", ["is-active", "--quiet", this.serviceName], { timeoutMs: 15_000 });
    const info = await this.host.exec("cloudflared", ["tunnel", "info", this.tunnelId], { timeoutMs: 30_000 });
    if (!info.stdout.trim() && !info.stderr.trim()) throw new Error("cloudflared tunnel info returned no connector information");
  }
}

/**
 * Caddy is used here only as a loopback HTTP host router. Public TLS terminates
 * at Cloudflare, so this provider never asks Caddy for ACME certificates and
 * never binds a public listener.
 */
export class CloudflareCaddyRouterProvider {
  readonly host: FactoryHostExecutor;
  readonly mainConfigPath: string;
  readonly routerFile: string;
  readonly routeDirectory: string;
  readonly routerAddress: string;

  constructor(options: {
    host: FactoryHostExecutor;
    mainConfigPath?: string;
    routerFile?: string;
    routeDirectory?: string;
    routerAddress?: string;
  }) {
    this.host = options.host;
    this.mainConfigPath = options.mainConfigPath ?? "/etc/caddy/Caddyfile";
    this.routerFile = options.routerFile ?? "/etc/caddy/supabase-factory-tunnel.caddy";
    this.routeDirectory = options.routeDirectory ?? "/etc/caddy/supabase-factory-tunnel.d";
    this.routerAddress = validLoopback(options.routerAddress ?? "127.0.0.1:18080");
    for (const path of [this.mainConfigPath, this.routerFile, this.routeDirectory]) {
      if (!path.startsWith("/")) throw new Error("Cloudflare Caddy router paths must be absolute");
    }
  }

  async #ensureMainImport(): Promise<void> {
    if (!(await this.host.exists(this.mainConfigPath))) throw new Error(`Caddy main config is missing: ${this.mainConfigPath}`);
    const source = await this.host.readText(this.mainConfigPath);
    const directive = `import ${this.routerFile}`;
    if (!source.split(/\r?\n/).some((line) => line.trim() === directive)) {
      await this.host.writeText(
        this.mainConfigPath,
        `${source.replace(/\s*$/, "")}\n\n# Supabase Factory Cloudflare Tunnel router\n${directive}\n`,
        0o640,
      );
    }
  }

  async #ensureRouterBlock(): Promise<void> {
    await this.host.mkdir(this.routeDirectory, 0o750);
    const content = [
      "# Managed by Supabase Factory. Loopback-only Cloudflare Tunnel router.",
      `http://${this.routerAddress} {`,
      `  import ${this.routeDirectory}/*.caddy`,
      "  respond 404",
      "}",
      "",
    ].join("\n");
    await this.host.writeText(this.routerFile, content, 0o640);
  }

  async ensureRoute(input: { projectId: string; hostname: string; upstream: string }): Promise<void> {
    const projectId = safeProjectId(input.projectId);
    const hostname = validHostname(input.hostname);
    const upstream = validLoopback(input.upstream);
    await this.#ensureMainImport();
    await this.#ensureRouterBlock();
    const fragment = `${this.routeDirectory}/${projectId}.caddy`;
    const matcher = `@sbf_${projectId.replaceAll("-", "_")}`;
    const content = [
      `# Managed by Supabase Factory for ${projectId}`,
      `${matcher} host ${hostname}`,
      `handle ${matcher} {`,
      `  reverse_proxy ${upstream}`,
      "}",
      "",
    ].join("\n");
    await this.host.writeText(fragment, content, 0o640);
    await this.host.exec("caddy", ["validate", "--config", this.mainConfigPath, "--adapter", "caddyfile"], { timeoutMs: 30_000 });
    await this.host.exec("caddy", ["reload", "--config", this.mainConfigPath, "--adapter", "caddyfile"], { timeoutMs: 30_000 });
  }
}

export class CloudflareTunnelEdgeProvider {
  readonly dns: CloudflareTunnelDnsVerifier;
  readonly tunnel: CloudflareTunnelController;
  readonly router: CloudflareCaddyRouterProvider;

  constructor(options: {
    dns: CloudflareTunnelDnsVerifier;
    tunnel: CloudflareTunnelController;
    router: CloudflareCaddyRouterProvider;
  }) {
    this.dns = options.dns;
    this.tunnel = options.tunnel;
    this.router = options.router;
  }

  async bind(input: { projectId: string; hostname: string; placement: ProjectPlacement }): Promise<CloudflareTunnelEdgeBinding> {
    const projectId = safeProjectId(input.projectId);
    if (input.placement.projectId !== projectId) throw new Error("Cloudflare edge placement belongs to a different project");
    const hostname = validHostname(input.hostname);
    const upstream = `127.0.0.1:${input.placement.apiGatewayPort}`;
    validLoopback(upstream);

    await this.tunnel.ensureConfigured();
    await this.tunnel.verifyActive();
    if (!(await this.dns.verify(hostname))) {
      throw new Error(`Cloudflare wildcard DNS for ${hostname} does not resolve publicly`);
    }
    await this.router.ensureRoute({ projectId, hostname, upstream });

    return {
      projectId,
      hostname,
      publicUrl: `https://${hostname}`,
      upstream,
      tunnelRouter: this.tunnel.routerAddress,
      dnsVerified: true,
      tlsManagedBy: "cloudflare",
    };
  }
}
