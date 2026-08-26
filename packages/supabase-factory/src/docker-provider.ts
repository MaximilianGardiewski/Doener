import type { DockerRuntimeInput, DockerRuntimeState, PreparedDockerRuntime } from "./docker-runtime.ts";
import type { PublicEndpointVerifier } from "./health.ts";
import type { FactoryHostExecutor, HostExecutorRegistry } from "./host.ts";
import type { ProjectPlacement, ProjectScheduler } from "./placement.ts";
import type { ApplyOptions, ApplyResult, InfrastructureProvider } from "./provider.ts";
import type { SecretStore } from "./secrets.ts";
import type { ObservedProjectState, ProvisioningPlan, ResolvedFactoryManifest } from "./types.ts";

export interface ProjectRuntimeBindingProvider {
  resolve(manifest: ResolvedFactoryManifest, placement: ProjectPlacement): Promise<Omit<DockerRuntimeInput, "manifest" | "placement">>;
}

export interface DockerRuntimeController {
  prepare(input: DockerRuntimeInput): Promise<PreparedDockerRuntime>;
  start(projectRoot: string): Promise<void>;
  readState(projectRoot: string): Promise<DockerRuntimeState | undefined>;
}

export type DockerRuntimeControllerFactory = (
  host: FactoryHostExecutor,
  secretStore: SecretStore,
) => DockerRuntimeController;

function hasUpgrade(plan: ProvisioningPlan): boolean {
  return plan.operations.some((operation) => operation.kind === "upgrade-project");
}

export class DockerComposeInfrastructureProvider implements InfrastructureProvider {
  readonly scheduler: ProjectScheduler;
  readonly hosts: HostExecutorRegistry;
  readonly secretStore: SecretStore;
  readonly bindings: ProjectRuntimeBindingProvider;
  readonly runtimeFactory: DockerRuntimeControllerFactory;
  readonly publicEndpointVerifier: PublicEndpointVerifier;
  readonly allowHttpHealth: boolean;

  constructor(options: {
    scheduler: ProjectScheduler;
    hosts: HostExecutorRegistry;
    secretStore: SecretStore;
    bindings: ProjectRuntimeBindingProvider;
    runtimeFactory: DockerRuntimeControllerFactory;
    publicEndpointVerifier: PublicEndpointVerifier;
    /** Development-only escape hatch. Production bindings should never enable this. */
    allowHttpHealth?: boolean;
  }) {
    this.scheduler = options.scheduler;
    this.hosts = options.hosts;
    this.secretStore = options.secretStore;
    this.bindings = options.bindings;
    this.runtimeFactory = options.runtimeFactory;
    this.publicEndpointVerifier = options.publicEndpointVerifier;
    this.allowHttpHealth = options.allowHttpHealth ?? false;
  }

  async #placement(projectId: string): Promise<ProjectPlacement | undefined> {
    return this.scheduler.get(projectId);
  }

  async #runningServices(host: FactoryHostExecutor, projectRoot: string): Promise<readonly string[]> {
    try {
      const result = await host.exec("docker", ["compose", "ps", "--services", "--status", "running"], {
        cwd: projectRoot,
        timeoutMs: 30_000,
      });
      return result.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).sort();
    } catch {
      return [];
    }
  }

  async #publicHealthy(projectId: string, publicUrl: string): Promise<boolean> {
    const prefix = `projects/${projectId}/supabase`;
    try {
      const [publishableKey, secretKey] = await Promise.all([
        this.secretStore.get({ store: this.secretStore.name, key: `${prefix}/SUPABASE_PUBLISHABLE_KEY` }),
        this.secretStore.get({ store: this.secretStore.name, key: `${prefix}/SUPABASE_SECRET_KEY` }),
      ]);
      const report = await this.publicEndpointVerifier.verify({
        publicUrl,
        publishableKey,
        secretKey,
        allowHttp: this.allowHttpHealth,
      });
      return report.healthy;
    } catch {
      return false;
    }
  }

  async observe(projectId: string): Promise<ObservedProjectState> {
    const placement = await this.#placement(projectId);
    if (!placement) return { exists: false };

    const host = this.hosts.get(placement.hostId);
    const runtime = this.runtimeFactory(host, this.secretStore);
    const state = await runtime.readState(placement.projectRoot);
    if (!state) return { exists: false };

    const running = await this.#runningServices(host, placement.projectRoot);
    const containersHealthy = running.includes("db") && running.includes("api-gw");
    const publicHealthy = containersHealthy && await this.#publicHealthy(projectId, state.publicUrl);
    const healthy = containersHealthy && publicHealthy;

    return {
      exists: true,
      state: healthy ? "HEALTHY" : "DEGRADED",
      release: state.release,
      upstreamCommit: state.upstreamCommit,
      postgresMajor: state.postgresMajor,
      services: state.services,
      healthy,
    };
  }

  async apply(plan: ProvisioningPlan, _options: ApplyOptions = {}): Promise<ApplyResult> {
    if (hasUpgrade(plan)) {
      throw new Error("Supabase/PostgreSQL upgrades require the dedicated staged upgrade workflow");
    }

    const placement = await this.scheduler.allocate(plan.projectId);
    const host = this.hosts.get(placement.hostId);
    const runtime = this.runtimeFactory(host, this.secretStore);

    if (plan.operations.length > 0) {
      const binding = await this.bindings.resolve(plan.desired, placement);
      await runtime.prepare({
        manifest: plan.desired,
        placement,
        ...binding,
      });
      await runtime.start(placement.projectRoot);
    }

    const observed = await this.observe(plan.projectId);
    if (!observed.exists) throw new Error(`project ${plan.projectId} did not produce observable runtime state`);

    const state = await runtime.readState(placement.projectRoot);
    if (!state) throw new Error(`project ${plan.projectId} runtime state disappeared after apply`);

    const secretPrefix = `projects/${plan.projectId}/supabase`;
    const [publishableKeyConfigured, secretKeyConfigured, databaseCredentialConfigured] = await Promise.all([
      this.secretStore.has(`${secretPrefix}/SUPABASE_PUBLISHABLE_KEY`),
      this.secretStore.has(`${secretPrefix}/SUPABASE_SECRET_KEY`),
      this.secretStore.has(`${secretPrefix}/POSTGRES_PASSWORD`),
    ]);

    return {
      projectId: plan.projectId,
      state: observed.healthy ? "HEALTHY" : "DEGRADED",
      publicUrl: state.publicUrl,
      publishableKeyConfigured,
      secretKeyConfigured,
      databaseCredentialConfigured,
    };
  }
}
