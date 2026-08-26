import type { Server } from "node:http";
import { FileFactoryAuditLog, FactoryAgentApi, StaticRoleAuthorizationPolicy, type FactoryPrincipal } from "./agent-api.ts";
import { JsonFileBackupCatalog } from "./backup-catalog.ts";
import { CloudflareQuickTunnelController, CloudflareQuickTunnelRuntimeBindingProvider } from "./cloudflare-quick-tunnel.ts";
import { SupabaseFactoryControlPlane } from "./control-plane.ts";
import { DockerComposeInfrastructureProvider, type DockerRuntimeControllerFactory } from "./docker-provider.ts";
import { DockerRuntimePreparer } from "./docker-runtime.ts";
import { FetchPublicEndpointVerifier, type PublicEndpointVerifier } from "./health.ts";
import { FactoryHostPreflight, type HostPreflightReport } from "./host-preflight.ts";
import { HostExecutorRegistry, LocalHostExecutor, type FactoryHostExecutor } from "./host.ts";
import { JsonFilePlacementStore } from "./json-placement-store.ts";
import { DockerMigrationController } from "./migrations.ts";
import { createFactoryMcpHttpHandler, SecretStoreBearerAuthenticator, type FactoryMcpHttpHandler } from "./mcp.ts";
import { startFactoryMcpNodeServer } from "./mcp-node.ts";
import { ProjectScheduler } from "./placement.ts";
import { JsonFileProjectRegistry } from "./registry.ts";
import { EncryptedJsonSecretStore } from "./secrets.ts";
import { FactoryServiceComposition } from "./service-composition.ts";

function absolute(value: string, label: string): string {
  if (!value.startsWith("/")) throw new Error(`${label} must be an absolute path`);
  return value.replace(/\/+$/, "") || "/";
}

function port(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`${label} must be an unprivileged TCP port`);
  return value;
}

function safeHostId(value: string): string {
  const id = value.trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(id)) throw new Error("Factory host ID is invalid");
  return id;
}

function safeBearer(value: string): string {
  if (value.length < 32 || /\s/.test(value)) throw new Error("Factory MCP bearer token must be at least 32 non-whitespace characters");
  return value;
}

export interface SingleHostQuickTunnelFactoryOptions {
  /** Persistent control-plane state. Recommended: /var/lib/supabase-factory */
  dataDir: string;
  /** Parent directory that receives one isolated Supabase checkout per project. */
  projectRoot: string;
  /** 32-byte AES key supplied by systemd credentials / protected bootstrap file. Never persisted by Factory. */
  masterKey: Uint8Array;
  /** High-entropy bearer token for the private Factory MCP endpoint. Stored only inside SecretStore. */
  mcpBearerToken: string;
  hostId?: string;
  gatewayPortStart?: number;
  gatewayPortEnd?: number;
  maxProjects?: number;
  mcpPort?: number;
  mcpPath?: string;
  mcpAllowedHosts?: readonly string[];
  mcpAllowedOrigins?: readonly string[];
  principal?: FactoryPrincipal;
  /** Test/alternate executor seam. Production defaults to LocalHostExecutor. */
  host?: FactoryHostExecutor;
  /** Test/alternate public health verifier seam. */
  publicEndpointVerifier?: PublicEndpointVerifier;
  /** Test/alternate Docker runtime factory seam. */
  runtimeFactory?: DockerRuntimeControllerFactory;
  now?: () => Date;
}

export interface SingleHostQuickTunnelFactory {
  readonly host: FactoryHostExecutor;
  readonly preflight: FactoryHostPreflight;
  readonly quickTunnel: CloudflareQuickTunnelController;
  readonly controlPlane: SupabaseFactoryControlPlane;
  readonly agentApi: FactoryAgentApi;
  readonly mcpHandler: FactoryMcpHttpHandler;
  readonly mcpPort: number;
  readonly mcpPath: string;
  /** Start the loopback MCP listener. Public exposure remains a separate edge concern. */
  startMcp(): Promise<Server>;
  /** Core host readiness for project creation + direct migrations + Quick Tunnel. */
  checkReady(): Promise<HostPreflightReport>;
}

/**
 * Production-shaped single-host composition for the zero-domain bootstrap mode.
 *
 * This is the missing "no custom TypeScript wiring" layer: callers provide paths,
 * two secrets and optional port ranges; Factory constructs persistent placement,
 * registry, encrypted secrets, Docker runtime, Quick Tunnel edge, migrations,
 * agent authorization/audit and the authenticated loopback MCP endpoint.
 *
 * Backup/restore/upgrade services intentionally remain separate until their
 * storage/PITR/approval dependencies are configured; absent tools stay fail-closed.
 */
export async function createSingleHostQuickTunnelFactory(
  options: SingleHostQuickTunnelFactoryOptions,
): Promise<SingleHostQuickTunnelFactory> {
  const dataDir = absolute(options.dataDir, "Factory dataDir");
  const projectRoot = absolute(options.projectRoot, "Factory projectRoot");
  if (options.masterKey.byteLength !== 32) throw new Error("Factory master key must be exactly 32 bytes");
  const bearer = safeBearer(options.mcpBearerToken);
  const hostId = safeHostId(options.hostId ?? options.host?.id ?? "local");
  const host = options.host ?? new LocalHostExecutor(hostId);
  if (host.id !== hostId) throw new Error(`Factory host executor ID ${host.id} does not match configured hostId ${hostId}`);

  const gatewayPortStart = port(options.gatewayPortStart ?? 18001, "gatewayPortStart");
  const gatewayPortEnd = port(options.gatewayPortEnd ?? 18100, "gatewayPortEnd");
  if (gatewayPortEnd < gatewayPortStart) throw new Error("Factory gateway port range is reversed");
  const availablePorts = gatewayPortEnd - gatewayPortStart + 1;
  const maxProjects = options.maxProjects ?? Math.min(availablePorts, 100);
  if (!Number.isInteger(maxProjects) || maxProjects < 1 || maxProjects > availablePorts) {
    throw new Error("Factory maxProjects must fit inside the gateway port range");
  }
  const mcpPort = port(options.mcpPort ?? 18787, "Factory MCP port");
  if (mcpPort >= gatewayPortStart && mcpPort <= gatewayPortEnd) throw new Error("Factory MCP port must not overlap project gateway ports");
  const mcpPath = options.mcpPath ?? "/mcp";
  if (!mcpPath.startsWith("/") || mcpPath.includes("?")) throw new Error("Factory MCP path must be an absolute URL path");

  const secretStore = new EncryptedJsonSecretStore(`${dataDir}/secrets.enc.json`, options.masterKey);
  const mcpTokenRef = await secretStore.put("factory/mcp/admin-bearer", bearer);
  const placementStore = new JsonFilePlacementStore(`${dataDir}/placements.json`);
  const scheduler = new ProjectScheduler([
    {
      id: hostId,
      enabled: true,
      projectRoot,
      gatewayPortStart,
      gatewayPortEnd,
      maxProjects,
      labels: { edge: "cloudflare-quick", topology: "single-host" },
    },
  ], placementStore);
  const hosts = new HostExecutorRegistry([host]);
  const quickTunnel = new CloudflareQuickTunnelController({ host });
  const bindings = new CloudflareQuickTunnelRuntimeBindingProvider(quickTunnel);
  const runtimeFactory = options.runtimeFactory ?? ((runtimeHost, runtimeSecrets) => new DockerRuntimePreparer(runtimeHost, runtimeSecrets, options.now));
  const provider = new DockerComposeInfrastructureProvider({
    scheduler,
    hosts,
    secretStore,
    bindings,
    runtimeFactory,
    publicEndpointVerifier: options.publicEndpointVerifier ?? new FetchPublicEndpointVerifier(),
  });
  const registry = new JsonFileProjectRegistry(`${dataDir}/projects.json`);
  const controlPlane = new SupabaseFactoryControlPlane(registry, provider, options.now);
  const backupCatalog = new JsonFileBackupCatalog(`${dataDir}/backups/catalog.json`);
  const migrations = new DockerMigrationController({ scheduler, hosts, secretStore });
  const composition = new FactoryServiceComposition({
    controlPlane,
    backupCatalog,
    migrations,
    now: options.now,
  });
  const authorization = new StaticRoleAuthorizationPolicy();
  const audit = new FileFactoryAuditLog(`${dataDir}/audit/factory.jsonl`);
  const agentApi = new FactoryAgentApi({ authorization, audit, handlers: composition.handlers(), now: options.now });
  const principal = options.principal ?? { id: "chatgpt-admin", roles: ["administrator"] };
  const authenticator = new SecretStoreBearerAuthenticator({
    secretStore,
    bindings: [{ principal, token: mcpTokenRef }],
  });
  const allowedHosts = options.mcpAllowedHosts ?? ["127.0.0.1", "localhost", "::1"];
  const mcpHandler = createFactoryMcpHttpHandler({
    api: agentApi,
    authenticator,
    path: mcpPath,
    allowedHosts,
    allowedOrigins: options.mcpAllowedOrigins,
  });
  const preflight = new FactoryHostPreflight(host);

  return {
    host,
    preflight,
    quickTunnel,
    controlPlane,
    agentApi,
    mcpHandler,
    mcpPort,
    mcpPath,
    async startMcp() {
      return startFactoryMcpNodeServer({ handler: mcpHandler, port: mcpPort });
    },
    async checkReady() {
      return preflight.run({
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
    },
  };
}

export interface StartedSingleHostQuickTunnelFactory extends SingleHostQuickTunnelFactory {
  readonly server: Server;
  close(): Promise<void>;
}

/**
 * Convenience start used by the eventual systemd entrypoint. It fails before
 * opening MCP when required host capabilities are missing.
 */
export async function startSingleHostQuickTunnelFactory(
  options: SingleHostQuickTunnelFactoryOptions,
): Promise<StartedSingleHostQuickTunnelFactory> {
  const factory = await createSingleHostQuickTunnelFactory(options);
  const report = await factory.checkReady();
  if (!report.ready) throw new Error(`Factory host is not ready: ${report.missingRequired.join(", ")}`);
  const server = await factory.startMcp();
  return {
    ...factory,
    server,
    async close() {
      if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      else await factory.mcpHandler.close();
    },
  };
}
