import type { FactoryHostExecutor } from "./host.ts";
import { SUPABASE_CLI_BASELINE } from "./migrations.ts";
import { parseComposeVersion, versionAtLeast } from "./docker-runtime.ts";

export type HostCapability =
  | "git"
  | "docker"
  | "docker-compose"
  | "supabase-cli"
  | "caddy"
  | "cloudflared"
  | "systemd"
  | "systemd-journal"
  | "aws-cli"
  | "rclone"
  | "wal-g"
  | "dns-resolver"
  | "ram-staging";

export interface HostPreflightCheck {
  capability: HostCapability;
  required: boolean;
  ok: boolean;
  version?: string;
  detail: string;
}

export interface HostPreflightReport {
  version: 1;
  hostId: string;
  ready: boolean;
  checks: readonly HostPreflightCheck[];
  missingRequired: readonly HostCapability[];
}

export interface HostPreflightRequirements {
  caddy?: boolean;
  cloudflared?: boolean;
  systemd?: boolean;
  systemdJournal?: boolean;
  awsCli?: boolean;
  rclone?: boolean;
  walG?: boolean;
  supabaseCli?: boolean;
  dnsResolver?: boolean;
  ramStaging?: boolean;
}

/**
 * Domainless TryCloudflare needs cloudflared + systemd/journald, but no Caddy
 * or wildcard-DNS resolver contract. Backup/migration requirements keep their
 * normal defaults.
 */
export const CLOUDFLARE_QUICK_TUNNEL_PREFLIGHT_REQUIREMENTS = Object.freeze({
  caddy: false,
  cloudflared: true,
  systemd: true,
  systemdJournal: true,
  dnsResolver: false,
}) satisfies HostPreflightRequirements;

function firstVersion(value: string): string | undefined {
  return value.match(/\b\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?\b/)?.[0];
}

async function commandCheck(
  host: FactoryHostExecutor,
  capability: HostCapability,
  required: boolean,
  file: string,
  args: readonly string[],
): Promise<HostPreflightCheck> {
  try {
    const result = await host.exec(file, args, { timeoutMs: 30_000 });
    const output = `${result.stdout}\n${result.stderr}`.trim();
    return {
      capability,
      required,
      ok: true,
      ...(firstVersion(output) ? { version: firstVersion(output) } : {}),
      detail: output.split(/\r?\n/).find(Boolean)?.trim() || `${file} available`,
    };
  } catch {
    return { capability, required, ok: false, detail: `${file} is unavailable or failed its version probe` };
  }
}

/**
 * Capability preflight only: it never installs packages or mutates the host.
 * The deployment/bootstrap layer can consume the report and install exactly the
 * missing prerequisites using the host's actual distribution/package manager.
 */
export class FactoryHostPreflight {
  readonly host: FactoryHostExecutor;

  constructor(host: FactoryHostExecutor) {
    this.host = host;
  }

  async run(requirements: HostPreflightRequirements = {}): Promise<HostPreflightReport> {
    const required = {
      caddy: requirements.caddy ?? true,
      cloudflared: requirements.cloudflared ?? false,
      systemd: requirements.systemd ?? false,
      systemdJournal: requirements.systemdJournal ?? false,
      awsCli: requirements.awsCli ?? true,
      rclone: requirements.rclone ?? true,
      walG: requirements.walG ?? false,
      supabaseCli: requirements.supabaseCli ?? true,
      dnsResolver: requirements.dnsResolver ?? true,
      ramStaging: requirements.ramStaging ?? true,
    };

    const checks: HostPreflightCheck[] = [];
    checks.push(await commandCheck(this.host, "git", true, "git", ["--version"]));
    checks.push(await commandCheck(this.host, "docker", true, "docker", ["--version"]));

    const compose = await commandCheck(this.host, "docker-compose", true, "docker", ["compose", "version", "--short"]);
    if (compose.ok) {
      try {
        const version = parseComposeVersion(compose.version ?? compose.detail);
        if (!versionAtLeast(version, [2, 24, 4])) {
          compose.ok = false;
          compose.detail = `Docker Compose ${version.join(".")} is below required 2.24.4`;
        }
      } catch {
        compose.ok = false;
        compose.detail = "Docker Compose version could not be parsed";
      }
    }
    checks.push(compose);

    const supabase = await commandCheck(this.host, "supabase-cli", required.supabaseCli, "supabase", ["--version"]);
    if (supabase.ok && required.supabaseCli && supabase.version !== SUPABASE_CLI_BASELINE) {
      supabase.ok = false;
      supabase.detail = `Supabase CLI ${supabase.version ?? "unknown"} does not match pinned ${SUPABASE_CLI_BASELINE}`;
    }
    checks.push(supabase);

    checks.push(await commandCheck(this.host, "caddy", required.caddy, "caddy", ["version"]));
    checks.push(await commandCheck(this.host, "cloudflared", required.cloudflared, "cloudflared", ["--version"]));
    checks.push(await commandCheck(this.host, "systemd", required.systemd, "systemctl", ["--version"]));
    checks.push(await commandCheck(this.host, "systemd-journal", required.systemdJournal, "journalctl", ["--version"]));
    checks.push(await commandCheck(this.host, "aws-cli", required.awsCli, "aws", ["--version"]));
    checks.push(await commandCheck(this.host, "rclone", required.rclone, "rclone", ["version"]));
    checks.push(await commandCheck(this.host, "wal-g", required.walG, "wal-g", ["--version"]));
    checks.push(await commandCheck(this.host, "dns-resolver", required.dnsResolver, "getent", ["--version"]));

    let ramOk = false;
    try {
      await this.host.exec("sh", ["-c", "test -d /dev/shm && test -w /dev/shm"], { timeoutMs: 10_000 });
      ramOk = true;
    } catch {}
    checks.push({
      capability: "ram-staging",
      required: required.ramStaging,
      ok: ramOk,
      detail: ramOk ? "/dev/shm exists and is writable" : "/dev/shm is missing or not writable",
    });

    const missingRequired = checks.filter((check) => check.required && !check.ok).map((check) => check.capability);
    return {
      version: 1,
      hostId: this.host.id,
      ready: missingRequired.length === 0,
      checks,
      missingRequired,
    };
  }
}
