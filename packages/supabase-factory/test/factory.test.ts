import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  JsonFileProjectRegistry,
  MemoryProjectRegistry,
  SupabaseFactoryControlPlane,
  assertApproved,
  planProject,
  resolveManifest,
  type ApplyOptions,
  type ApplyResult,
  type InfrastructureProvider,
  type ObservedProjectState,
  type ProvisioningPlan,
  type SupabaseFactoryManifest,
} from "../src/index.ts";

function manifest(overrides: Partial<SupabaseFactoryManifest> = {}): SupabaseFactoryManifest {
  return {
    apiVersion: FACTORY_API_VERSION,
    project: { id: "example-app", environment: "production" },
    profile: "webapp",
    ...overrides,
  };
}

test("production webapp resolves to pinned Envoy/PG17 baseline and S3 storage", () => {
  const resolved = resolveManifest(manifest());
  assert.equal(resolved.supabase.release, "self-hosted/v0.8.0");
  assert.equal(resolved.supabase.postgresMajor, 17);
  assert.equal(resolved.supabase.gateway, "envoy");
  assert.equal(resolved.storage.backend, "s3");
  assert.equal(resolved.security.databasePublic, false);
  assert.equal(resolved.security.studioPublic, false);
  assert.equal(resolved.security.allowLegacyApiKeys, false);
});

test("production Storage refuses local filesystem backend", () => {
  assert.throws(
    () => resolveManifest(manifest({ storage: { backend: "file" } })),
    /must use an S3-compatible backend/,
  );
});

test("factory policy refuses public database and Studio exposure", () => {
  assert.throws(() => resolveManifest(manifest({ security: { databasePublic: true } })), /public PostgreSQL/);
  assert.throws(() => resolveManifest(manifest({ security: { studioPublic: true } })), /public Studio/);
});

test("new project plan is cloud-management-token free and does not expose secrets", () => {
  const plan = planProject(manifest());
  assert.equal(plan.cloudManagementCredentialsRequired, false);
  assert.equal(plan.exposesSecretValues, false);
  assert.ok(plan.operations.some((operation) => operation.kind === "generate-project-secrets"));

  const serialized = JSON.stringify(plan);
  for (const forbidden of ["SUPABASE_ACCESS_TOKEN", "supabase login", "supabase link", "sbp_"]) {
    assert.equal(serialized.includes(forbidden), false, `plan leaked cloud-management concept: ${forbidden}`);
  }
});

test("reconcile is idempotent when observed state already matches desired state", () => {
  const desired = resolveManifest(manifest());
  const plan = planProject(manifest(), {
    exists: true,
    release: desired.supabase.release,
    postgresMajor: desired.supabase.postgresMajor,
    services: desired.services,
    healthy: true,
  });
  assert.deepEqual(plan.operations, []);
});

test("version changes become explicit approval-gated upgrade operations", () => {
  const desired = resolveManifest(manifest());
  const plan = planProject(manifest(), {
    exists: true,
    release: "self-hosted/v0.7.2",
    postgresMajor: desired.supabase.postgresMajor,
    services: desired.services,
    healthy: true,
  });

  const upgrade = plan.operations.find((operation) => operation.id === "upgrade-supabase");
  assert.ok(upgrade);
  assert.equal(upgrade.requiresApproval, true);
  assert.throws(() => assertApproved(plan), /explicit approval required/);
  assert.doesNotThrow(() => assertApproved(plan, { approvedOperationIds: ["upgrade-supabase"] }));
});

test("registry persists only secret status flags, never secret values", async () => {
  const directory = await mkdtemp(join(tmpdir(), "supabase-factory-"));
  const path = join(directory, "registry.json");
  const registry = new JsonFileProjectRegistry(path);
  const desired = resolveManifest(manifest());

  await registry.put({
    id: desired.project.id,
    desired,
    state: "HEALTHY",
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    publicUrl: "https://api.example.invalid",
    publishableKeyConfigured: true,
    secretKeyConfigured: true,
    databaseCredentialConfigured: true,
  });

  const raw = await readFile(path, "utf8");
  assert.equal(raw.includes("sb_secret_"), false);
  assert.equal(raw.includes("POSTGRES_PASSWORD"), false);
  assert.equal((await registry.get(desired.project.id))?.state, "HEALTHY");
});

class FakeProvider implements InfrastructureProvider {
  observed: ObservedProjectState = { exists: false };
  applied?: ProvisioningPlan;

  async observe(): Promise<ObservedProjectState> {
    return this.observed;
  }

  async apply(plan: ProvisioningPlan, _options?: ApplyOptions): Promise<ApplyResult> {
    this.applied = plan;
    this.observed = {
      exists: true,
      release: plan.desired.supabase.release,
      postgresMajor: plan.desired.supabase.postgresMajor,
      services: plan.desired.services,
      healthy: true,
    };
    return {
      projectId: plan.projectId,
      state: "HEALTHY",
      publicUrl: `https://api.${plan.projectId}.example.invalid`,
      publishableKeyConfigured: true,
      secretKeyConfigured: true,
      databaseCredentialConfigured: true,
    };
  }
}

test("control plane records a secret-free healthy project and subsequent plan is a no-op", async () => {
  const provider = new FakeProvider();
  const registry = new MemoryProjectRegistry();
  const controlPlane = new SupabaseFactoryControlPlane(
    registry,
    provider,
    () => new Date("2026-08-26T00:00:00.000Z"),
  );

  const record = await controlPlane.apply(manifest());
  assert.equal(record.state, "HEALTHY");
  assert.equal(record.secretKeyConfigured, true);
  assert.ok(provider.applied);

  const secondPlan = await controlPlane.plan(manifest());
  assert.deepEqual(secondPlan.operations, []);
});
