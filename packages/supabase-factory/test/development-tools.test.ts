import assert from "node:assert/strict";
import test from "node:test";
import {
  SUPABASE_BASELINE,
  createDevelopmentFactory,
  type ApplyResult,
  type InfrastructureProvider,
  type ObservedProjectState,
  type ProvisioningPlan,
} from "../src/index.ts";

const planner = { id: "chatgpt-planner", roles: ["planner"] } as const;
const operator = { id: "chatgpt-operator", roles: ["operator"] } as const;

test("ChatGPT repository bootstrap returns ready-to-write secret-free project and lock files", async () => {
  const factory = createDevelopmentFactory();
  const result = await factory.api.invoke({
    principal: planner,
    tool: "factory.repository.bootstrap",
    arguments: {
      projectId: "new-chatgpt-app",
      environment: "development",
      displayName: "New ChatGPT App",
      profile: "realtime",
    },
    requestId: "repo-bootstrap-1",
  }) as {
    paths: { manifest: string; lock: string; migrations: string };
    projectJson: string;
    lockJson: string;
    deploymentTargetSelected: boolean;
  };

  assert.equal(result.paths.manifest, ".supabase-factory/project.json");
  assert.equal(result.paths.lock, ".supabase-factory/lock.json");
  assert.equal(result.paths.migrations, "supabase/migrations/");
  assert.equal(result.deploymentTargetSelected, false);
  assert.match(result.projectJson, /new-chatgpt-app/);
  assert.match(result.lockJson, new RegExp(SUPABASE_BASELINE.upstreamCommit));
  for (const forbidden of ["SUPABASE_ACCESS_TOKEN", "sbp_", "POSTGRES_PASSWORD", "Cloudflare", "systemd"] as const) {
    assert.equal(result.projectJson.includes(forbidden), false);
    assert.equal(result.lockJson.includes(forbidden), false);
  }
});

test("repository validate and plan use project.json as source of truth without applying infrastructure", async () => {
  const factory = createDevelopmentFactory();
  const bootstrap = await factory.api.invoke({
    principal: planner,
    tool: "factory.repository.bootstrap",
    arguments: { projectId: "planned-app", environment: "development" },
    requestId: "repo-bootstrap-2",
  }) as { projectJson: string };

  const validated = await factory.api.invoke({
    principal: planner,
    tool: "factory.repository.validate",
    arguments: { projectJson: bootstrap.projectJson },
    requestId: "repo-validate-1",
  }) as { valid: boolean; lock: { deploymentTargetSelected: boolean } };
  assert.equal(validated.valid, true);
  assert.equal(validated.lock.deploymentTargetSelected, false);

  const planned = await factory.api.invoke({
    principal: planner,
    tool: "factory.repository.plan",
    arguments: { projectJson: bootstrap.projectJson },
    requestId: "repo-plan-1",
  }) as { plan: ProvisioningPlan; lock: { manifestSha256: string } };
  assert.equal(planned.plan.projectId, "planned-app");
  assert.equal(planned.plan.cloudManagementCredentialsRequired, false);
  assert.match(planned.lock.manifestSha256, /^[0-9a-f]{64}$/);
  assert.ok(planned.plan.operations.length > 0);
  assert.equal((await factory.registry.list()).length, 0);
});

test("development runtime tools attach and detach only Factory inventory, never the runtime itself", async () => {
  const factory = createDevelopmentFactory();
  const descriptor = {
    projectId: "ephemeral-app",
    publicUrl: "http://127.0.0.1:54321",
    release: SUPABASE_BASELINE.release,
    upstreamCommit: SUPABASE_BASELINE.upstreamCommit,
    postgresMajor: 17 as const,
    services: ["database", "auth", "rest", "gateway"] as const,
    allowHttp: true,
  };

  const attached = await factory.api.invoke({
    principal: operator,
    tool: "factory.runtime.attach",
    arguments: descriptor,
    requestId: "runtime-attach-1",
  }) as { attached: boolean; runtimeMutated: boolean };
  assert.equal(attached.attached, true);
  assert.equal(attached.runtimeMutated, false);

  const listed = await factory.api.invoke({
    principal: operator,
    tool: "factory.runtime.list",
    arguments: {},
    requestId: "runtime-list-1",
  }) as Array<{ projectId: string }>;
  assert.deepEqual(listed.map((runtime) => runtime.projectId), ["ephemeral-app"]);

  const fetched = await factory.api.invoke({
    principal: operator,
    tool: "factory.runtime.get",
    arguments: { projectId: "ephemeral-app" },
    requestId: "runtime-get-1",
  }) as { publicUrl: string };
  assert.equal(fetched.publicUrl, descriptor.publicUrl);

  const detached = await factory.api.invoke({
    principal: operator,
    tool: "factory.runtime.detach",
    arguments: { projectId: "ephemeral-app" },
    requestId: "runtime-detach-1",
  }) as { detached: boolean; runtimeDestroyed: boolean };
  assert.equal(detached.detached, true);
  assert.equal(detached.runtimeDestroyed, false);
  assert.deepEqual(await factory.runtimeCatalog!.list(), []);
});

test("repository tools remain available with a future provider while attached-runtime tools are development-composition only", () => {
  const provider: InfrastructureProvider = {
    async observe(): Promise<ObservedProjectState> { return { exists: false }; },
    async apply(plan: ProvisioningPlan): Promise<ApplyResult> {
      return {
        projectId: plan.projectId,
        state: "DEGRADED",
        publishableKeyConfigured: false,
        secretKeyConfigured: false,
        databaseCredentialConfigured: false,
      };
    },
  };
  const factory = createDevelopmentFactory({ provider });
  assert.ok(factory.api.handlers["factory.repository.bootstrap"]);
  assert.ok(factory.api.handlers["factory.repository.validate"]);
  assert.ok(factory.api.handlers["factory.repository.plan"]);
  assert.equal(factory.api.handlers["factory.runtime.attach"], undefined);
  assert.equal(factory.api.handlers["factory.runtime.detach"], undefined);
});
