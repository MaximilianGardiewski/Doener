import type { ProjectRuntimeBindingProvider } from "./docker-provider.ts";
import type { FactoryHostExecutor } from "./host.ts";
import type { ProjectPlacement } from "./placement.ts";
import type { ResolvedFactoryManifest } from "./types.ts";

const FACTORY_UNIT_HEADER = "# Managed by Supabase Factory. Domainless Cloudflare Quick Tunnel.";
const QUICK_TUNNEL_URL = /https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.trycloudflare\.(?:com|app)\b/gi;

function safeProjectId(value: string): string {
  if (!/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/.test(value)) {
    throw new Error("invalid project ID for Cloudflare Quick Tunnel");
  }
  return value;
}

function validLoopback(value: string): string {
  const target = value.trim();
  if (!/^127\.0\.0\.1:\d{2,5}$/.test(target)) {
    throw new Error("Cloudflare Quick Tunnel upstream must be a loopback host:port");
  }
  const port = Number(target.split(":")[1]);
  if (port < 1024 || port > 65535) throw new Error("Cloudflare Quick Tunnel upstream port is invalid");
  return target;
}

function validateQuickTunnelUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Cloudflare Quick Tunnel URL must use HTTPS");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.trycloudflare\.(?:com|app)$/.test(url.hostname)) {
    throw new Error("cloudflared returned an unexpected Quick Tunnel hostname");
  }
  return url.origin;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CloudflareQuickTunnelBinding {
  projectId: string;
  publicUrl: string;
  hostname: string;
  upstream: string;
  unitName: string;
  tlsManagedBy: "cloudflare";
  ephemeral: true;
}

/**
 * Runs one anonymous TryCloudflare process per development/staging project.
 *
 * This is deliberately NOT a Cloudflare management-API integration:
 * - no Cloudflare account is required
 * - no DNS zone or custom domain is required
 * - no API/OAuth/tunnel token is accepted or persisted
 * - cloudflared connects directly to the project's loopback Envoy port
 *
 * Quick Tunnels are temporary and are forbidden for production. The systemd
 * unit uses an isolated HOME so an operator's ~/.cloudflared/config.yaml cannot
 * interfere with TryCloudflare. Restart is intentionally disabled because a new
 * cloudflared process receives a new public URL; Factory should surface failure
 * instead of silently changing a project's URL behind the control plane.
 */
export class CloudflareQuickTunnelController {
  readonly host: FactoryHostExecutor;
  readonly unitDirectory: string;
  readonly urlTimeoutMs: number;
  readonly pollIntervalMs: number;

  constructor(options: {
    host: FactoryHostExecutor;
    unitDirectory?: string;
    urlTimeoutMs?: number;
    pollIntervalMs?: number;
  }) {
    this.host = options.host;
    this.unitDirectory = options.unitDirectory ?? "/etc/systemd/system";
    this.urlTimeoutMs = options.urlTimeoutMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    if (!this.unitDirectory.startsWith("/")) throw new Error("Quick Tunnel systemd unit directory must be absolute");
    if (this.urlTimeoutMs < 1_000 || this.urlTimeoutMs > 120_000) throw new Error("Quick Tunnel URL timeout is out of range");
    if (this.pollIntervalMs < 0 || this.pollIntervalMs > 5_000) throw new Error("Quick Tunnel poll interval is out of range");
  }

  unitName(projectId: string): string {
    return `supabase-factory-quick-${safeProjectId(projectId)}.service`;
  }

  unitPath(projectId: string): string {
    return `${this.unitDirectory}/${this.unitName(projectId)}`;
  }

  renderUnit(projectId: string, upstream: string): string {
    const id = safeProjectId(projectId);
    const target = validLoopback(upstream);
    const runtimeDirectory = `supabase-factory-quick-${id}`;
    return [
      FACTORY_UNIT_HEADER,
      "[Unit]",
      `Description=Supabase Factory Quick Tunnel for ${id}`,
      "After=network-online.target",
      "Wants=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      "DynamicUser=yes",
      `RuntimeDirectory=${runtimeDirectory}`,
      `Environment=HOME=/run/${runtimeDirectory}`,
      `ExecStart=/usr/bin/env cloudflared tunnel --no-autoupdate --url http://${target}`,
      // A restarted Quick Tunnel gets a different URL. Fail visibly instead.
      "Restart=no",
      "NoNewPrivileges=yes",
      "PrivateTmp=yes",
      "ProtectSystem=strict",
      "ProtectHome=yes",
      "ProtectKernelTunables=yes",
      "ProtectControlGroups=yes",
      "RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
      "LockPersonality=yes",
      "MemoryDenyWriteExecute=yes",
      "CapabilityBoundingSet=",
      "AmbientCapabilities=",
      "",
    ].join("\n");
  }

  async #isActive(unitName: string): Promise<boolean> {
    try {
      await this.host.exec("systemctl", ["is-active", "--quiet", unitName], { timeoutMs: 15_000 });
      return true;
    } catch {
      return false;
    }
  }

  async #invocationId(unitName: string): Promise<string> {
    const result = await this.host.exec(
      "systemctl",
      ["show", unitName, "--property", "InvocationID", "--value"],
      { timeoutMs: 15_000 },
    );
    const id = result.stdout.trim();
    if (!/^[0-9a-f]{32}$/i.test(id)) throw new Error(`Quick Tunnel service ${unitName} has no active invocation ID`);
    return id;
  }

  async #readCurrentUrl(unitName: string): Promise<string | undefined> {
    const invocationId = await this.#invocationId(unitName);
    const result = await this.host.exec(
      "journalctl",
      [`_SYSTEMD_INVOCATION_ID=${invocationId}`, "--no-pager", "--output=cat", "-n", "200"],
      { timeoutMs: 15_000 },
    );
    const text = `${result.stdout}\n${result.stderr}`;
    const matches = [...text.matchAll(QUICK_TUNNEL_URL)].map((match) => match[0]);
    const latest = matches.at(-1);
    return latest ? validateQuickTunnelUrl(latest) : undefined;
  }

  async #waitForUrl(unitName: string): Promise<string> {
    const deadline = Date.now() + this.urlTimeoutMs;
    let lastError: unknown;
    while (Date.now() <= deadline) {
      if (!(await this.#isActive(unitName))) {
        throw new Error(`Cloudflare Quick Tunnel service exited before publishing a URL: ${unitName}`);
      }
      try {
        const url = await this.#readCurrentUrl(unitName);
        if (url) return url;
      } catch (error) {
        lastError = error;
      }
      await sleep(this.pollIntervalMs);
    }
    throw new Error(
      `Cloudflare Quick Tunnel did not publish a URL within ${this.urlTimeoutMs}ms${lastError ? "" : ""}`,
    );
  }

  async ensure(input: { projectId: string; upstream: string }): Promise<CloudflareQuickTunnelBinding> {
    const projectId = safeProjectId(input.projectId);
    const upstream = validLoopback(input.upstream);
    const unitName = this.unitName(projectId);
    const unitPath = this.unitPath(projectId);
    const desired = this.renderUnit(projectId, upstream);

    let changed = true;
    if (await this.host.exists(unitPath)) {
      const existing = await this.host.readText(unitPath);
      if (!existing.startsWith(FACTORY_UNIT_HEADER)) {
        throw new Error(`refusing to overwrite non-Factory systemd unit: ${unitPath}`);
      }
      changed = existing !== desired;
      if (changed && await this.#isActive(unitName)) {
        await this.host.exec("systemctl", ["stop", unitName], { timeoutMs: 30_000 });
      }
    }

    if (changed) {
      await this.host.writeText(unitPath, desired, 0o644);
      await this.host.exec("systemctl", ["daemon-reload"], { timeoutMs: 30_000 });
    }

    if (!(await this.#isActive(unitName))) {
      await this.host.exec("systemctl", ["start", unitName], { timeoutMs: 30_000 });
    }

    const publicUrl = await this.#waitForUrl(unitName);
    const hostname = new URL(publicUrl).hostname;
    return {
      projectId,
      publicUrl,
      hostname,
      upstream,
      unitName,
      tlsManagedBy: "cloudflare",
      ephemeral: true,
    };
  }

  async stop(projectId: string): Promise<void> {
    const id = safeProjectId(projectId);
    const unitName = this.unitName(id);
    const unitPath = this.unitPath(id);
    if (!(await this.host.exists(unitPath))) return;
    const existing = await this.host.readText(unitPath);
    if (!existing.startsWith(FACTORY_UNIT_HEADER)) {
      throw new Error(`refusing to remove non-Factory systemd unit: ${unitPath}`);
    }
    if (await this.#isActive(unitName)) {
      await this.host.exec("systemctl", ["stop", unitName], { timeoutMs: 30_000 });
    }
    await this.host.remove(unitPath);
    await this.host.exec("systemctl", ["daemon-reload"], { timeoutMs: 30_000 });
  }
}

/**
 * Adapter used directly by DockerComposeInfrastructureProvider. It resolves the
 * random HTTPS endpoint before Supabase runtime preparation, allowing SITE_URL,
 * redirect URLs and the persisted runtime state to use the actual Cloudflare URL.
 */
export class CloudflareQuickTunnelRuntimeBindingProvider implements ProjectRuntimeBindingProvider {
  readonly tunnel: CloudflareQuickTunnelController;

  constructor(tunnel: CloudflareQuickTunnelController) {
    this.tunnel = tunnel;
  }

  async resolve(manifest: ResolvedFactoryManifest, placement: ProjectPlacement) {
    if (placement.projectId !== manifest.project.id) throw new Error("Quick Tunnel placement belongs to a different project");
    if (manifest.project.environment === "production" || manifest.profile === "production-critical") {
      throw new Error("Cloudflare Quick Tunnel is forbidden for production; use a stable production edge provider");
    }
    const binding = await this.tunnel.ensure({
      projectId: manifest.project.id,
      upstream: `127.0.0.1:${placement.apiGatewayPort}`,
    });
    return {
      endpoints: {
        publicUrl: binding.publicUrl,
        siteUrl: binding.publicUrl,
      },
    };
  }
}
