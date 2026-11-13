import assert from "node:assert/strict";
import test from "node:test";
import {
  createDevelopmentFactory,
  planSupabaseAdoption,
  prepareSupabaseAdoption,
  SUPABASE_BASELINE,
  type SupabaseAdoptionSourceInventory,
} from "../src/index.ts";

const target = {
  projectId: "adopted-app",
  environment: "production" as const,
  profile: "production-critical" as const,
  displayName: "Adopted App",
};

function source(overrides: Partial<SupabaseAdoptionSourceInventory> = {}): SupabaseAdoptionSourceInventory {
  return {
    provider: "supabase-cloud",
    projectRef: "example-project-ref",
    displayName: "Existing Supabase",
    region: "eu-central-1",
    status: "ACTIVE_HEALTHY",
    postgresMajor: 17,
    databaseExport: "available",
    authExport: "available",
    storageExport: "available",
    edgeFunctionsExport: "available",
    edgeFunctionSlugs: ["hello-world"],
    ...overrides,
  };
}

test("adoption plan is staged, source-preserving and cutover/decommission are not implicit", () => {
  const plan = planSupabaseAdoption(source(), target);
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.readyForRepositoryPreparation, true);
  assert.equal(plan.readyForDataTransfer, true);
  assert.equal(plan.sourceMutationRequiredBeforeCutover, false);
  assert.equal(plan.sourceDecommissionIncluded, false);
  assert.equal(plan.secretsBelongInRepository, false);
  assert.ok(plan.phases.some((phase) => phase.id === "parallel-target"));
  assert.ok(plan.phases.some((phase) => phase.id === "verify"));
  assert.ok(plan.phases.some((phase) => phase.id === "cutover"));
  assert.ok(plan.phases.every((phase) => phase.mutatesSource === false));
});

test("inactive source blocks data transfer but still permits secret-free repository preparation", () => {
  const plan = planSupabaseAdoption(source({ status: "INACTIVE", databaseExport: "unknown" }), target);
  assert.equal(plan.readyForRepositoryPreparation, true);
  assert.equal(plan.readyForDataTransfer, false);
  assert.ok(plan.blockers.includes("SOURCE_NOT_READABLE"));
  assert.ok(plan.warnings.includes("DATABASE_EXPORT_NOT_YET_CONFIRMED"));
});

test("prepare generates only canonical Factory repository files and no source credentials", () => {
  const prepared = prepareSupabaseAdoption(source(), target);
  assert.deepEqual(prepared.files.map((file) => file.path), [
    ".supabase-factory/project.json",
    ".supabase-factory/lock.json",
  ]);
  assert.equal(prepared.migrationDirectory, "supabase/migrations/");
  assert.equal(prepared.sourceMutationPerformed, false);
  assert.equal(prepared.runtimeProvisioned, false);
  assert.equal(prepared.secretsBelongInRepository, false);
  assert.match(prepared.files[0].content, /adopted-app/);
  assert.match(prepared.files[1].content, new RegExp(SUPABASE_BASELINE.upstreamCommit));

  const joined = prepared.files.map((file) => file.content).join("\n");
  for (const forbidden of [
    "SUPABASE_ACCESS_TOKEN",
    "sbp_",
    "SERVICE_ROLE_KEY",
    "POSTGRES_PASSWORD",
    "JWT_SECRET",
    "example-project-ref",
  ]) {
    assert.equal(joined.includes(forbidden), false);
  }
});

test("development Factory exposes adoption planning/preparation as planner tools", async () => {
  const factory = createDevelopmentFactory();
  const planner = { id: "plugin-planner", roles: ["planner"] } as const;
  const inventory = source({ status: "INACTIVE", databaseExport: "unknown", authExport: "unknown", storageExport: "unknown" });

  assert.ok(factory.api.handlers["factory.adopt.plan"]);
  assert.ok(factory.api.handlers["factory.adopt.prepare"]);

  const planned = await factory.api.invoke({
    principal: planner,
    tool: "factory.adopt.plan",
    arguments: { source: inventory, target },
    requestId: "adopt-plan-test",
  }) as { blockers: string[]; readyForDataTransfer: boolean };
  assert.equal(planned.readyForDataTransfer, false);
  assert.ok(planned.blockers.includes("SOURCE_NOT_READABLE"));

  const prepared = await factory.api.invoke({
    principal: planner,
    tool: "factory.adopt.prepare",
    arguments: { source: inventory, target },
    requestId: "adopt-prepare-test",
  }) as { files: Array<{ path: string; content: string }>; sourceMutationPerformed: boolean };
  assert.equal(prepared.sourceMutationPerformed, false);
  assert.equal(prepared.files.length, 2);
});
