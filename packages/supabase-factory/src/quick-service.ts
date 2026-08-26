import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { CloudflareQuickTunnelController } from "./cloudflare-quick-tunnel.ts";
import { FactoryHostPreflight } from "./host-preflight.ts";
import { LocalHostExecutor } from "./host.ts";
import { createSingleHostQuickTunnelFactory } from "./single-host-quick-factory.ts";

function envString(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`${name} is required`);
}

function envInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function envBoolean(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`${name} must be true/false`);
}

function envList(name: string): string[] | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

async function masterKeyFromFile(path: string): Promise<Uint8Array> {
  const raw = await readFile(path);
  if (raw.byteLength === 32) return raw;
  const text = raw.toString("utf8").trim();
  if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, "hex");
  try {
    const decoded = Buffer.from(text, "base64");
    if (decoded.byteLength === 32) return decoded;
  } catch {}
  throw new Error("Factory master-key file must contain 32 raw bytes, 64 hex characters, or base64 encoding of 32 bytes");
}

async function bearerFromFile(path: string): Promise<string> {
  const token = (await readFile(path, "utf8")).trim();
  if (token.length < 32 || /\s/.test(token)) throw new Error("Factory MCP token file must contain at least 32 non-whitespace characters");
  return token;
}

export interface QuickServiceRuntime {
  loopbackMcpUrl: string;
  publicMcpUrl?: string;
  close(): Promise<void>;
}

/**
 * Environment-driven service entrypoint. It deliberately reads secret values
 * from protected files instead of command-line arguments or normal environment
 * variables, so process listings do not expose the Factory master key/token.
 */
export async function startQuickService(): Promise<QuickServiceRuntime> {
  const dataDir = envString("FACTORY_DATA_DIR", "/var/lib/supabase-factory");
  const projectRoot = envString("FACTORY_PROJECT_ROOT", "/srv/supabase-factory/projects");
  const masterKeyFile = envString("FACTORY_MASTER_KEY_FILE", "/etc/supabase-factory/master-key");
  const tokenFile = envString("FACTORY_MCP_TOKEN_FILE", "/etc/supabase-factory/mcp-token");
  const hostId = envString("FACTORY_HOST_ID", "local");
  const gatewayPortStart = envInteger("FACTORY_GATEWAY_PORT_START", 18001);
  const gatewayPortEnd = envInteger("FACTORY_GATEWAY_PORT_END", 18100);
  const maxProjects = envInteger("FACTORY_MAX_PROJECTS", 100);
  const mcpPort = envInteger("FACTORY_MCP_PORT", 18787);
  const mcpPath = envString("FACTORY_MCP_PATH", "/mcp");
  const exposeMcpQuick = envBoolean("FACTORY_EXPOSE_MCP_QUICK", false);
  const masterKey = await masterKeyFromFile(masterKeyFile);
  const mcpBearerToken = await bearerFromFile(tokenFile);
  const host = new LocalHostExecutor(hostId);

  // Preflight before creating any public management tunnel.
  const preflight = await new FactoryHostPreflight(host).run({
    caddy: false,
    cloudflared: true,
    systemd: true,
    systemdJournal: true,
    awsCli: false,
    rclone: false,
    walG: false,
    supabaseCli: true,
    dnsResolver: false,
    ramStaging: false,
  });
  if (!preflight.ready) throw new Error(`Factory host is not ready: ${preflight.missingRequired.join(", ")}`);

  let managementTunnel: CloudflareQuickTunnelController | undefined;
  let publicMcpBase: string | undefined;
  try {
    if (exposeMcpQuick) {
      managementTunnel = new CloudflareQuickTunnelController({ host });
      const binding = await managementTunnel.ensure({
        projectId: "factory-mcp",
        upstream: `127.0.0.1:${mcpPort}`,
      });
      publicMcpBase = binding.publicUrl;
    }

    const dynamicHost = publicMcpBase ? new URL(publicMcpBase).hostname : undefined;
    const configuredHosts = envList("FACTORY_MCP_ALLOWED_HOSTS") ?? [];
    const mcpAllowedHosts = [...new Set(["127.0.0.1", "localhost", ...(dynamicHost ? [dynamicHost] : []), ...configuredHosts])];
    const factory = await createSingleHostQuickTunnelFactory({
      dataDir,
      projectRoot,
      masterKey,
      mcpBearerToken,
      hostId,
      gatewayPortStart,
      gatewayPortEnd,
      maxProjects,
      mcpPort,
      mcpPath,
      mcpAllowedHosts,
      mcpAllowedOrigins: envList("FACTORY_MCP_ALLOWED_ORIGINS"),
      host,
    });
    const server = await factory.startMcp();
    const loopbackMcpUrl = `http://127.0.0.1:${mcpPort}${mcpPath}`;
    const publicMcpUrl = publicMcpBase ? `${publicMcpBase}${mcpPath}` : undefined;

    const close = async () => {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      } else {
        await factory.mcpHandler.close();
      }
      if (managementTunnel) await managementTunnel.stop("factory-mcp");
    };

    return { loopbackMcpUrl, ...(publicMcpUrl ? { publicMcpUrl } : {}), close };
  } catch (error) {
    if (managementTunnel) await managementTunnel.stop("factory-mcp").catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const runtime = await startQuickService();
  // Machine-readable and intentionally secret-free. A bootstrap UI can capture
  // publicMcpUrl and configure a compatible ChatGPT MCP app with the token file.
  process.stdout.write(`${JSON.stringify({
    status: "READY",
    loopbackMcpUrl: runtime.loopbackMcpUrl,
    ...(runtime.publicMcpUrl ? { publicMcpUrl: runtime.publicMcpUrl } : {}),
  })}\n`);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try { await runtime.close(); process.exitCode = 0; }
    catch { process.exitCode = 1; }
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Factory quick service failed";
    process.stderr.write(`SUPABASE_FACTORY_START_FAILED=${message}\n`);
    process.exitCode = 1;
  });
}
