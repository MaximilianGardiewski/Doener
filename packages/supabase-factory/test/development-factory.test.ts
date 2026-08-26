import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  SUPABASE_BASELINE,
  MemorySecretStore,
  createDevelopmentFactory,
  resolveManifest,
  type PublicEndpointVerifier,
  type SupabaseFactoryManifest,
} from "../src/index.ts";

const healthyVerifier: PublicEndpointVerifier = {
  async verify() {
    return {
      healthy: true,
      checks: {
        httpsBoundary: true,
        authHealth: true,
        restWithSecretKey: true,
        apiKeyEnforcement: true,
      },
    };
  },
};

function manifest(): SupabaseFactoryManifest {
  return {
    apiVersion: FACTORY_API_VERSION,
    project: { id: "dev-app", environment: "development" },
    profile: "minimal",
  };
}

test("memory SecretStore provides an OS/filesystem-neutral development adapter", async () => {
  const store = new MemorySecretStore("test-memory");
  const ref = await store.put("projects/dev-app/key", "secret-value");
  assert.equal(await store.get(ref), "secret-value");
  assert.equal(await store.has("projects/dev-app/key"), true);
  await store.delete("projects/dev-app/key");
  assert.equal(await store.has("projects/dev-app/key"), false);
});

test("development Factory attaches to self-hosted Supabase without Docker/systemd/DNS/Cloudflare assumptions", async () => {
  const factory = createDevelopmentFactory({ publicEndpointVerifier: healthyVerifier });
  if (!factory.runtimeCatalog) throw new Error("default development composition must provide an attached runtime catalog");

  const desired = resolveManifest(manifest());
  await factory.runtimeCatalog.put({
    projectId: desired.project.id,
    publicUrl: "http://127.0.0.1:54321",
    release: desired.supabase.release,
    upstreamCommit: desired.supabase.upstreamCommit,
    postgresMajor: desired.supabase.postgresMajor,
    services: desired.services,
    allowHttp: true,
  });
  await factory.secretStore.put(`projects/${desired.project.id}/supabase/SUPABASE_PUBLISHABLE_KEY`, "publishable-development-key");
  await factory.secretStore.put(`projects/${desired.project.id}/supabase/SUPABASE_SECRET_KEY`, "secret-development-key");

  const result = await factory.api.invoke({
    principal: { id: "chatgpt-dev", roles: ["operator"] },
    tool: "factory.project.create",
    arguments: { manifest: manifest() },
    requestId: "dev-attach-0001",
  }) as { id: string; state: string; publicUrl?: string; databaseCredentialConfigured: boolean };

  assert.equal(result.id, "dev-app");
  assert.equal(result.state, "HEALTHY");
  assert.equal(result.publicUrl, "http://127.0.0.1:54321");
  assert.equal(result.databaseCredentialConfigured, false);
  assert.equal((await factory.registry.list()).length, 1);

  const serialized = JSON.stringify(result);
  for (const forbidden of ["Docker", "systemd", "cloudflared", "Cloudflare", "Ubuntu", "SUPABASE_ACCESS_TOKEN", "sbp_"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("attached development provider detects runtime version drift but refuses to mutate deployment infrastructure", async () => {
  const factory = createDevelopmentFactory({ publicEndpointVerifier: healthyVerifier });
  if (!factory.runtimeCatalog) throw new Error("runtime catalog missing");
  const desired = resolveManifest(manifest());

  await factory.runtimeCatalog.put({
    projectId: desired.project.id,
    publicUrl: "https://dev-app.example.invalid",
    release: "self-hosted/v0.7.2",
    upstreamCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    postgresMajor: desired.supabase.postgresMajor,
    services: desired.services,
  });
  await factory.secretStore.put(`projects/${desired.project.id}/supabase/SUPABASE_PUBLISHABLE_KEY`, "publishable-development-key");
  await factory.secretStore.put(`projects/${desired.project.id}/supabase/SUPABASE_SECRET_KEY`, "secret-development-key");

  const plan = await factory.controlPlane.plan(manifest());
  assert.ok(plan.operations.some((operation) => operation.kind === "upgrade-project"));
  await assert.rejects(
    () => factory.controlPlane.apply(manifest(), { approvedOperationIds: plan.operations.map((operation) => operation.id) }),
    /does not mutate deployment infrastructure/,
  );
});

test("development composition keeps the reviewed Supabase baseline independent from a deployment destination", () => {
  const desired = resolveManifest(manifest());
  assert.equal(desired.supabase.release, SUPABASE_BASELINE.release);
  assert.equal(desired.supabase.upstreamCommit, SUPABASE_BASELINE.upstreamCommit);
  assert.equal(desired.supabase.postgresMajor, 17);
});
