import assert from "node:assert/strict";
import test from "node:test";
import {
  DockerComposeInfrastructureProvider,
  FACTORY_API_VERSION,
  HostExecutorRegistry,
  MemoryPlacementStore,
  ProjectScheduler,
  planProject,
  type DockerRuntimeController,
  type DockerRuntimeInput,
  type DockerRuntimeState,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
  type ProjectRuntimeBindingProvider,
  type PublicEndpointVerifier,
  type SecretRef,
  type SecretStore,
} from "../src/index.ts";

class MemorySecretStore implements SecretStore {
  readonly name = "memory";
  readonly values = new Map<string, string>();

  async put(key: string, value: string): Promise<SecretRef> {
    this.values.set(key, value);
    return { store: this.name, key };
  }

  async get(ref: SecretRef): Promise<string> {
    const value = this.values.get(ref.key);
    if (value === undefined) throw new Error("missing secret");
    return value;
  }

  async has(key: string): Promise<boolean> {
    return this.values.has(key);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class FakeHost implements FactoryHostExecutor {
  readonly id = "node-a";
  running = true;

  async exec(_file: string, args: readonly string[] = [], _options: HostCommandOptions = {}): Promise<HostCommandResult> {
    if (args.includes("ps") && this.running) return { stdout: "db\napi-gw\nauth\nrest\n", stderr: "" };
    return { stdout: "", stderr: "" };
  }

  async exists(): Promise<boolean> { return true; }
  async mkdir(): Promise<void> {}
  async readText(): Promise<string> { return ""; }
  async writeText(): Promise<void> {}
  async chmod(): Promise<void> {}
  async remove(): Promise<void> {}
}

class FakeRuntime implements DockerRuntimeController {
  state?: DockerRuntimeState;
  starts = 0;
  readonly secretStore: SecretStore;

  constructor(secretStore: SecretStore) {
    this.secretStore = secretStore;
  }

  async prepare(input: DockerRuntimeInput) {
    this.state = {
      version: 1,
      projectId: input.manifest.project.id,
      hostId: input.placement.hostId,
      apiGatewayPort: input.placement.apiGatewayPort,
      composeProjectName: `sbf-${input.manifest.project.id}`,
      realtimeTenantName: `sbf-${input.manifest.project.id}`,
      release: input.manifest.supabase.release,
      upstreamCommit: input.manifest.supabase.upstreamCommit,
      postgresMajor: input.manifest.supabase.postgresMajor,
      services: input.manifest.services,
      publicUrl: input.endpoints.publicUrl,
      preparedAt: "2026-08-26T00:00:00.000Z",
    };
    const prefix = `projects/${input.manifest.project.id}/supabase`;
    const generatedSecretRefs: Record<string, SecretRef> = {};
    for (const key of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "POSTGRES_PASSWORD"]) {
      generatedSecretRefs[key] = await this.secretStore.put(`${prefix}/${key}`, `generated-${key}`);
    }
    return { state: this.state, generatedSecretRefs };
  }

  async start(): Promise<void> { this.starts += 1; }
  async readState(): Promise<DockerRuntimeState | undefined> { return this.state; }
}

class FakePublicEndpointVerifier implements PublicEndpointVerifier {
  healthy = true;
  calls = 0;

  async verify(input: Parameters<PublicEndpointVerifier["verify"]>[0]) {
    this.calls += 1;
    assert.match(input.publicUrl, /^https:\/\//);
    assert.match(input.publishableKey, /SUPABASE_PUBLISHABLE_KEY/);
    assert.match(input.secretKey, /SUPABASE_SECRET_KEY/);
    return {
      healthy: this.healthy,
      checks: {
        httpsBoundary: this.healthy,
        authHealth: this.healthy,
        restWithSecretKey: this.healthy,
        apiKeyEnforcement: this.healthy,
      },
      authVersion: "v2.test",
    };
  }
}

test("Docker provider allocates, resolves bindings, starts runtime and requires public endpoint health", async () => {
  const secretStore = new MemorySecretStore();
  const fakeHost = new FakeHost();
  const runtime = new FakeRuntime(secretStore);
  const publicEndpointVerifier = new FakePublicEndpointVerifier();
  let bindingCalls = 0;
  const bindings: ProjectRuntimeBindingProvider = {
    async resolve(manifest, _placement) {
      bindingCalls += 1;
      return {
        endpoints: {
          publicUrl: `https://api.${manifest.project.id}.example.invalid`,
          siteUrl: `https://${manifest.project.id}.example.invalid`,
        },
      };
    },
  };
  const scheduler = new ProjectScheduler([{
    id: "node-a",
    enabled: true,
    projectRoot: "/srv/sbf",
    gatewayPortStart: 18000,
    gatewayPortEnd: 18005,
    maxProjects: 6,
  }], new MemoryPlacementStore());
  const provider = new DockerComposeInfrastructureProvider({
    scheduler,
    hosts: new HostExecutorRegistry([fakeHost]),
    secretStore,
    bindings,
    runtimeFactory: () => runtime,
    publicEndpointVerifier,
  });
  const plan = planProject({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "provider-app", environment: "staging" },
    profile: "minimal",
  });

  const result = await provider.apply(plan);
  assert.equal(result.state, "HEALTHY");
  assert.equal(result.publishableKeyConfigured, true);
  assert.equal(result.secretKeyConfigured, true);
  assert.equal(result.databaseCredentialConfigured, true);
  assert.equal(bindingCalls, 1);
  assert.equal(runtime.starts, 1);
  assert.ok(publicEndpointVerifier.calls >= 1);
  assert.match(result.publicUrl ?? "", /^https:\/\/api\.provider-app/);

  const observed = await provider.observe("provider-app");
  assert.equal(observed.exists, true);
  assert.equal(observed.healthy, true);
  assert.equal(observed.upstreamCommit, plan.desired.supabase.upstreamCommit);
});

test("running containers remain DEGRADED when the public Envoy path is unhealthy", async () => {
  const secretStore = new MemorySecretStore();
  const fakeHost = new FakeHost();
  const runtime = new FakeRuntime(secretStore);
  runtime.state = {
    version: 1,
    projectId: "degraded-app",
    hostId: "node-a",
    apiGatewayPort: 18000,
    composeProjectName: "sbf-degraded-app",
    realtimeTenantName: "sbf-degraded-app",
    release: "self-hosted/v0.8.0",
    upstreamCommit: "241bb11c0627f2981746d37033f57dbfa81d29b0",
    postgresMajor: 17,
    services: ["database", "auth", "rest", "gateway"],
    publicUrl: "https://api.degraded-app.example.invalid",
    preparedAt: "2026-08-26T00:00:00.000Z",
  };
  for (const key of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "POSTGRES_PASSWORD"]) {
    await secretStore.put(`projects/degraded-app/supabase/${key}`, `generated-${key}`);
  }
  const placementStore = new MemoryPlacementStore();
  await placementStore.put({ projectId: "degraded-app", hostId: "node-a", projectRoot: "/srv/sbf/degraded-app", apiGatewayPort: 18000 });
  const publicEndpointVerifier = new FakePublicEndpointVerifier();
  publicEndpointVerifier.healthy = false;
  const provider = new DockerComposeInfrastructureProvider({
    scheduler: new ProjectScheduler([{
      id: "node-a", enabled: true, projectRoot: "/srv/sbf", gatewayPortStart: 18000, gatewayPortEnd: 18005, maxProjects: 6,
    }], placementStore),
    hosts: new HostExecutorRegistry([fakeHost]),
    secretStore,
    bindings: { async resolve() { return { endpoints: { publicUrl: runtime.state!.publicUrl, siteUrl: "https://degraded-app.example.invalid" } }; } },
    runtimeFactory: () => runtime,
    publicEndpointVerifier,
  });

  const observed = await provider.observe("degraded-app");
  assert.equal(observed.exists, true);
  assert.equal(observed.healthy, false);
  assert.equal(observed.state, "DEGRADED");
});

test("Docker provider refuses upgrade operations even when generic apply is called", async () => {
  const secretStore = new MemorySecretStore();
  const fakeHost = new FakeHost();
  const runtime = new FakeRuntime(secretStore);
  const publicEndpointVerifier = new FakePublicEndpointVerifier();
  runtime.state = {
    version: 1,
    projectId: "upgrade-app",
    hostId: "node-a",
    apiGatewayPort: 18000,
    composeProjectName: "sbf-upgrade-app",
    realtimeTenantName: "sbf-upgrade-app",
    release: "self-hosted/v0.7.2",
    upstreamCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    postgresMajor: 17,
    services: ["database", "auth", "rest", "gateway"],
    publicUrl: "https://api.upgrade-app.example.invalid",
    preparedAt: "2026-08-26T00:00:00.000Z",
  };
  for (const key of ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "POSTGRES_PASSWORD"]) {
    await secretStore.put(`projects/upgrade-app/supabase/${key}`, `generated-${key}`);
  }

  const placementStore = new MemoryPlacementStore();
  await placementStore.put({ projectId: "upgrade-app", hostId: "node-a", projectRoot: "/srv/sbf/upgrade-app", apiGatewayPort: 18000 });
  const scheduler = new ProjectScheduler([{
    id: "node-a",
    enabled: true,
    projectRoot: "/srv/sbf",
    gatewayPortStart: 18000,
    gatewayPortEnd: 18005,
    maxProjects: 6,
  }], placementStore);
  const provider = new DockerComposeInfrastructureProvider({
    scheduler,
    hosts: new HostExecutorRegistry([fakeHost]),
    secretStore,
    bindings: {
      async resolve() {
        return { endpoints: { publicUrl: "https://api.upgrade-app.example.invalid", siteUrl: "https://upgrade-app.example.invalid" } };
      },
    },
    runtimeFactory: () => runtime,
    publicEndpointVerifier,
  });
  const desired = {
    apiVersion: FACTORY_API_VERSION,
    project: { id: "upgrade-app", environment: "staging" as const },
    profile: "minimal" as const,
  };
  const observed = await provider.observe("upgrade-app");
  const plan = planProject(desired, observed);
  assert.ok(plan.operations.some((operation) => operation.kind === "upgrade-project"));
  await assert.rejects(() => provider.apply(plan), /dedicated staged upgrade workflow/);
});
