import assert from "node:assert/strict";
import {
  SUPABASE_BASELINE,
  createDevelopmentFactory,
  parseFactoryRepositoryManifest,
  type ProvisioningPlan,
} from "../src/index.ts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing integration environment variable: ${name}`);
  return value;
}

const projectId = process.env.FACTORY_SMOKE_PROJECT_ID ?? "factory-ci-smoke";
const publicUrl = required("FACTORY_SMOKE_URL");
const publishableKey = required("FACTORY_SMOKE_PUBLISHABLE_KEY");
const secretKey = required("FACTORY_SMOKE_SECRET_KEY");
const postgresPassword = required("FACTORY_SMOKE_POSTGRES_PASSWORD");

const factory = createDevelopmentFactory();
const prefix = `projects/${projectId}/supabase`;
await factory.secretStore.put(`${prefix}/SUPABASE_PUBLISHABLE_KEY`, publishableKey);
await factory.secretStore.put(`${prefix}/SUPABASE_SECRET_KEY`, secretKey);
await factory.secretStore.put(`${prefix}/POSTGRES_PASSWORD`, postgresPassword);

const operator = { id: "github-actions-smoke", roles: ["operator"] } as const;
const planner = { id: "github-actions-smoke", roles: ["planner"] } as const;

const attached = await factory.api.invoke({
  principal: operator,
  tool: "factory.runtime.attach",
  arguments: {
    projectId,
    publicUrl,
    release: SUPABASE_BASELINE.release,
    upstreamCommit: SUPABASE_BASELINE.upstreamCommit,
    postgresMajor: SUPABASE_BASELINE.postgresMajor,
    services: ["database", "auth", "rest", "gateway"],
    allowHttp: true,
  },
  requestId: "smoke-runtime-attach",
}) as { attached: boolean; runtimeMutated: boolean };
assert.equal(attached.attached, true);
assert.equal(attached.runtimeMutated, false);

const repository = await factory.api.invoke({
  principal: planner,
  tool: "factory.repository.bootstrap",
  arguments: {
    projectId,
    environment: "development",
    displayName: "Factory GitHub Actions Smoke",
    profile: "minimal",
  },
  requestId: "smoke-repository-bootstrap",
}) as { projectJson: string; lock: { deploymentTargetSelected: boolean } };
assert.equal(repository.lock.deploymentTargetSelected, false);

const planned = await factory.api.invoke({
  principal: planner,
  tool: "factory.repository.plan",
  arguments: { projectJson: repository.projectJson },
  requestId: "smoke-repository-plan",
}) as { plan: ProvisioningPlan };
assert.equal(planned.plan.projectId, projectId);
assert.equal(planned.plan.cloudManagementCredentialsRequired, false);
assert.equal(planned.plan.exposesSecretValues, false);
assert.deepEqual(planned.plan.operations, []);

const manifest = parseFactoryRepositoryManifest(repository.projectJson);
const created = await factory.api.invoke({
  principal: operator,
  tool: "factory.project.create",
  arguments: { manifest },
  requestId: "smoke-project-create",
}) as {
  id: string;
  state: string;
  publicUrl?: string;
  publishableKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  databaseCredentialConfigured: boolean;
};
assert.equal(created.id, projectId);
assert.equal(created.state, "HEALTHY");
assert.equal(created.publicUrl, publicUrl);
assert.equal(created.publishableKeyConfigured, true);
assert.equal(created.secretKeyConfigured, true);
assert.equal(created.databaseCredentialConfigured, true);

const health = await factory.api.invoke({
  principal: operator,
  tool: "factory.health.check",
  arguments: { projectId },
  requestId: "smoke-health-check",
}) as { exists: boolean; healthy?: boolean; state?: string };
assert.equal(health.exists, true);
assert.equal(health.healthy, true);
assert.equal(health.state, "HEALTHY");

const detached = await factory.api.invoke({
  principal: operator,
  tool: "factory.runtime.detach",
  arguments: { projectId },
  requestId: "smoke-runtime-detach",
}) as { detached: boolean; runtimeDestroyed: boolean };
assert.equal(detached.detached, true);
assert.equal(detached.runtimeDestroyed, false);

console.log(JSON.stringify({
  status: "PASS",
  projectId,
  baseline: {
    release: SUPABASE_BASELINE.release,
    upstreamCommit: SUPABASE_BASELINE.upstreamCommit,
    postgresMajor: SUPABASE_BASELINE.postgresMajor,
  },
  repositoryContract: "PASS",
  runtimeAttachment: "PASS",
  publicHealth: "PASS",
  runtimeDestroyedByFactory: false,
}));
