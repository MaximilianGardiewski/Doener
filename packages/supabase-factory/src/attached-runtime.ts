import type { PublicEndpointVerifier } from "./health.ts";
import { assertApproved, type ApplyOptions, type ApplyResult, type InfrastructureProvider } from "./provider.ts";
import type { SecretStore } from "./secrets.ts";
import type { ObservedProjectState, ProvisioningPlan, SupabaseService } from "./types.ts";

export interface AttachedSelfHostedRuntime {
  projectId: string;
  /** Auth/REST gateway URL of an already-running self-hosted Supabase runtime. */
  publicUrl: string;
  release: string;
  upstreamCommit: string;
  postgresMajor: 15 | 17;
  services: readonly SupabaseService[];
  /** Local/ephemeral development runtimes may explicitly use HTTP. */
  allowHttp?: boolean;
}

export interface AttachedRuntimeCatalog {
  get(projectId: string): Promise<AttachedSelfHostedRuntime | undefined>;
  list(): Promise<readonly AttachedSelfHostedRuntime[]>;
  put(runtime: AttachedSelfHostedRuntime): Promise<void>;
  delete(projectId: string): Promise<void>;
}

function validateRuntime(runtime: AttachedSelfHostedRuntime): void {
  if (runtime.projectId.length < 3) throw new Error("attached runtime projectId is invalid");
  const url = new URL(runtime.publicUrl);
  if (url.username || url.password) throw new Error("attached runtime URL must not contain credentials");
  if (!runtime.allowHttp && url.protocol !== "https:") throw new Error("attached runtime requires HTTPS unless allowHttp is explicit");
  if (runtime.allowHttp && !["http:", "https:"].includes(url.protocol)) throw new Error("attached runtime URL must use HTTP or HTTPS");
  if (!/^[0-9a-f]{40}$/.test(runtime.upstreamCommit)) throw new Error("attached runtime upstreamCommit must be a 40-character SHA");
  if (!runtime.release) throw new Error("attached runtime release is required");
  if (!runtime.services.includes("database") || !runtime.services.includes("gateway")) {
    throw new Error("attached self-hosted runtime must expose database and gateway services");
  }
}

/** In-memory runtime inventory for GitHub CI and development harnesses. */
export class MemoryAttachedRuntimeCatalog implements AttachedRuntimeCatalog {
  readonly #runtimes = new Map<string, AttachedSelfHostedRuntime>();

  async get(projectId: string): Promise<AttachedSelfHostedRuntime | undefined> {
    const runtime = this.#runtimes.get(projectId);
    return runtime ? structuredClone(runtime) : undefined;
  }

  async list(): Promise<readonly AttachedSelfHostedRuntime[]> {
    return [...this.#runtimes.values()]
      .sort((a, b) => a.projectId.localeCompare(b.projectId))
      .map((runtime) => structuredClone(runtime));
  }

  async put(runtime: AttachedSelfHostedRuntime): Promise<void> {
    validateRuntime(runtime);
    this.#runtimes.set(runtime.projectId, structuredClone(runtime));
  }

  async delete(projectId: string): Promise<void> {
    this.#runtimes.delete(projectId);
  }
}

/**
 * Platform-neutral development provider.
 *
 * The Factory core is attached to a self-hosted Supabase runtime supplied by a
 * development harness or CI job. This provider never runs Docker, SSH, systemd,
 * DNS, Cloudflare or host package-manager commands. That makes the current
 * ChatGPT/GitHub development contract independent of the later deployment
 * destination.
 */
export class AttachedSelfHostedInfrastructureProvider implements InfrastructureProvider {
  readonly catalog: AttachedRuntimeCatalog;
  readonly secretStore: SecretStore;
  readonly publicEndpointVerifier: PublicEndpointVerifier;

  constructor(options: {
    catalog: AttachedRuntimeCatalog;
    secretStore: SecretStore;
    publicEndpointVerifier: PublicEndpointVerifier;
  }) {
    this.catalog = options.catalog;
    this.secretStore = options.secretStore;
    this.publicEndpointVerifier = options.publicEndpointVerifier;
  }

  async #secretStatus(projectId: string): Promise<{
    publishableKeyConfigured: boolean;
    secretKeyConfigured: boolean;
    databaseCredentialConfigured: boolean;
  }> {
    const prefix = `projects/${projectId}/supabase`;
    const [publishableKeyConfigured, secretKeyConfigured, databaseCredentialConfigured] = await Promise.all([
      this.secretStore.has(`${prefix}/SUPABASE_PUBLISHABLE_KEY`),
      this.secretStore.has(`${prefix}/SUPABASE_SECRET_KEY`),
      this.secretStore.has(`${prefix}/POSTGRES_PASSWORD`),
    ]);
    return { publishableKeyConfigured, secretKeyConfigured, databaseCredentialConfigured };
  }

  async observe(projectId: string): Promise<ObservedProjectState> {
    const runtime = await this.catalog.get(projectId);
    if (!runtime) return { exists: false };

    const prefix = `projects/${projectId}/supabase`;
    let healthy = false;
    try {
      const [publishableKey, secretKey] = await Promise.all([
        this.secretStore.get({ store: this.secretStore.name, key: `${prefix}/SUPABASE_PUBLISHABLE_KEY` }),
        this.secretStore.get({ store: this.secretStore.name, key: `${prefix}/SUPABASE_SECRET_KEY` }),
      ]);
      healthy = (await this.publicEndpointVerifier.verify({
        publicUrl: runtime.publicUrl,
        publishableKey,
        secretKey,
        allowHttp: runtime.allowHttp ?? false,
      })).healthy;
    } catch {
      healthy = false;
    }

    return {
      exists: true,
      state: healthy ? "HEALTHY" : "DEGRADED",
      release: runtime.release,
      upstreamCommit: runtime.upstreamCommit,
      postgresMajor: runtime.postgresMajor,
      services: runtime.services,
      healthy,
    };
  }

  async apply(plan: ProvisioningPlan, options: ApplyOptions = {}): Promise<ApplyResult> {
    assertApproved(plan, options);
    const runtime = await this.catalog.get(plan.projectId);
    if (!runtime) {
      throw new Error(`self-hosted development runtime is not attached: ${plan.projectId}`);
    }

    const unsupported = plan.operations.filter((operation) =>
      operation.kind === "upgrade-project" || operation.kind === "reconcile-services" || operation.kind === "allocate-project"
    );
    if (unsupported.length) {
      throw new Error(`attached runtime provider does not mutate deployment infrastructure: ${unsupported.map((item) => item.kind).join(", ")}`);
    }

    const observed = await this.observe(plan.projectId);
    const secrets = await this.#secretStatus(plan.projectId);
    return {
      projectId: plan.projectId,
      state: observed.healthy ? "HEALTHY" : "DEGRADED",
      publicUrl: runtime.publicUrl,
      ...secrets,
    };
  }
}
