import {
  FactoryAgentApi,
  MemoryFactoryAuditLog,
  StaticRoleAuthorizationPolicy,
  type FactoryAuditLog,
  type FactoryAuthorizationPolicy,
} from "./agent-api.ts";
import { createAdoptionToolHandlers } from "./adoption.ts";
import { MemoryAttachedRuntimeCatalog, AttachedSelfHostedInfrastructureProvider, type AttachedRuntimeCatalog } from "./attached-runtime.ts";
import { MemoryBackupCatalog, type BackupCatalog } from "./backup-catalog.ts";
import { SupabaseFactoryControlPlane } from "./control-plane.ts";
import {
  createAttachedRuntimeDevelopmentToolHandlers,
  createRepositoryDevelopmentToolHandlers,
} from "./development-tools.ts";
import { FetchPublicEndpointVerifier, type PublicEndpointVerifier } from "./health.ts";
import { createFactoryMcpHttpHandler, type FactoryMcpAuthenticator, type FactoryMcpHttpHandler } from "./mcp.ts";
import type { InfrastructureProvider } from "./provider.ts";
import { MemoryProjectRegistry, type ProjectRegistry } from "./registry.ts";
import { MemorySecretStore, type SecretStore } from "./secrets.ts";
import {
  FactoryServiceComposition,
  type BackupLifecycleService,
  type BackupRecordVerifier,
  type MigrationLifecycleService,
  type Postgres17UpgradeLifecycleService,
  type RestoreDrillLifecycleService,
  type SupabaseReleaseUpgradeLifecycleService,
} from "./service-composition.ts";

export interface DevelopmentFactoryOptions {
  registry?: ProjectRegistry;
  backupCatalog?: BackupCatalog;
  secretStore?: SecretStore;
  runtimeCatalog?: AttachedRuntimeCatalog;
  provider?: InfrastructureProvider;
  publicEndpointVerifier?: PublicEndpointVerifier;
  authorization?: FactoryAuthorizationPolicy;
  audit?: FactoryAuditLog;
  migrations?: MigrationLifecycleService;
  backups?: BackupLifecycleService;
  backupVerifier?: BackupRecordVerifier;
  restoreDrill?: RestoreDrillLifecycleService;
  releaseUpgrade?: SupabaseReleaseUpgradeLifecycleService;
  postgres17Upgrade?: Postgres17UpgradeLifecycleService;
  now?: () => Date;
}

export interface DevelopmentFactory {
  registry: ProjectRegistry;
  backupCatalog: BackupCatalog;
  secretStore: SecretStore;
  runtimeCatalog?: AttachedRuntimeCatalog;
  provider: InfrastructureProvider;
  controlPlane: SupabaseFactoryControlPlane;
  services: FactoryServiceComposition;
  api: FactoryAgentApi;
  audit: FactoryAuditLog;
  createMcpHandler(options: {
    authenticator: FactoryMcpAuthenticator;
    allowedHosts: readonly string[];
    allowedOrigins?: readonly string[];
    path?: string;
  }): FactoryMcpHttpHandler;
}

/**
 * Host-neutral composition for the current development phase.
 *
 * Defaults are entirely in-memory and the runtime provider only attaches to an
 * already-running self-hosted Supabase endpoint. There is no Docker, SSH,
 * systemd, DNS, Cloudflare, Linux distribution or filesystem assumption in this
 * composition. Deployment-specific adapters can be supplied later through the
 * same interfaces without changing ChatGPT/MCP/control-plane behavior.
 *
 * The default ChatGPT tool surface exposes repository bootstrap/status/sync/
 * planning plus existing-project adoption planning/preparation. When the default
 * attached-runtime catalog is present, secret-free runtime attach/get/list/
 * detach tools are exposed too. None of these tools call GitHub, Supabase Cloud
 * management APIs or mutate deployment infrastructure directly.
 */
export function createDevelopmentFactory(options: DevelopmentFactoryOptions = {}): DevelopmentFactory {
  const registry = options.registry ?? new MemoryProjectRegistry();
  const backupCatalog = options.backupCatalog ?? new MemoryBackupCatalog();
  const secretStore = options.secretStore ?? new MemorySecretStore();
  const runtimeCatalog = options.runtimeCatalog ?? (options.provider ? undefined : new MemoryAttachedRuntimeCatalog());
  const provider = options.provider ?? new AttachedSelfHostedInfrastructureProvider({
    catalog: runtimeCatalog!,
    secretStore,
    publicEndpointVerifier: options.publicEndpointVerifier ?? new FetchPublicEndpointVerifier(),
  });
  const controlPlane = new SupabaseFactoryControlPlane(registry, provider, options.now);
  const services = new FactoryServiceComposition({
    controlPlane,
    backupCatalog,
    migrations: options.migrations,
    backups: options.backups,
    backupVerifier: options.backupVerifier,
    restoreDrill: options.restoreDrill,
    releaseUpgrade: options.releaseUpgrade,
    postgres17Upgrade: options.postgres17Upgrade,
    now: options.now,
  });
  const audit = options.audit ?? new MemoryFactoryAuditLog();
  const handlers = {
    ...services.handlers(),
    ...createRepositoryDevelopmentToolHandlers(controlPlane),
    ...createAdoptionToolHandlers(),
    ...(runtimeCatalog ? createAttachedRuntimeDevelopmentToolHandlers(runtimeCatalog) : {}),
  };
  const api = new FactoryAgentApi({
    authorization: options.authorization ?? new StaticRoleAuthorizationPolicy(),
    audit,
    handlers,
    now: options.now,
  });

  return {
    registry,
    backupCatalog,
    secretStore,
    ...(runtimeCatalog ? { runtimeCatalog } : {}),
    provider,
    controlPlane,
    services,
    api,
    audit,
    createMcpHandler(mcp) {
      return createFactoryMcpHttpHandler({
        api,
        authenticator: mcp.authenticator,
        allowedHosts: mcp.allowedHosts,
        allowedOrigins: mcp.allowedOrigins,
        path: mcp.path,
      });
    },
  };
}
