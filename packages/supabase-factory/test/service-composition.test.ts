import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  FactoryAgentApi,
  FactoryServiceComposition,
  MemoryBackupCatalog,
  MemoryProjectRegistry,
  StaticRoleAuthorizationPolicy,
  SupabaseFactoryControlPlane,
  type ApplyResult,
  type FactoryAuditEntry,
  type FactoryAuditLog,
  type InfrastructureProvider,
  type ObservedProjectState,
  type ProjectBackupRecord,
  type ProvisioningPlan,
  type ResolvedFactoryManifest,
} from "../src/index.ts";

class FakeProvider implements InfrastructureProvider {
  readonly observed = new Map<string, ObservedProjectState>();
  async observe(projectId: string): Promise<ObservedProjectState> { return this.observed.get(projectId) ?? { exists: false }; }
  async apply(plan: ProvisioningPlan): Promise<ApplyResult> {
    this.observed.set(plan.projectId, {
      exists: true,
      state: "HEALTHY",
      release: plan.desired.supabase.release,
      upstreamCommit: plan.desired.supabase.upstreamCommit,
      postgresMajor: plan.desired.supabase.postgresMajor,
      services: plan.desired.services,
      healthy: true,
    });
    return {
      projectId: plan.projectId,
      state: "HEALTHY",
      publicUrl: `https://${plan.projectId}.example.invalid`,
      publishableKeyConfigured: true,
      secretKeyConfigured: true,
      databaseCredentialConfigured: true,
    };
  }
}

class MemoryAudit implements FactoryAuditLog {
  readonly entries: FactoryAuditEntry[] = [];
  async append(entry: FactoryAuditEntry): Promise<void> { this.entries.push(entry); }
}

function backupRecord(manifest: ResolvedFactoryManifest): ProjectBackupRecord {
  return {
    version: 1,
    projectId: manifest.project.id,
    backupId: "20260826050000",
    createdAt: "2026-08-26T05:00:00.000Z",
    supabaseRelease: manifest.supabase.release,
    upstreamCommit: manifest.supabase.upstreamCommit,
    postgresMajor: manifest.supabase.postgresMajor,
    cliVersion: "2.115.0",
    database: { roles: true, schema: true, data: true, pgsodiumRootKey: true },
    runtimeConfigIncluded: true,
    artifact: { ref: `s3://backups/${manifest.project.id}/20260826050000.sbf`, sha256: "a".repeat(64), encrypted: true },
    verified: true,
    cloudManagementCredentialsRequired: false,
  };
}

async function fixture(options: {
  withBackup?: boolean;
  withRestore?: boolean;
  withMigrations?: boolean;
} = {}) {
  const provider = new FakeProvider();
  const registry = new MemoryProjectRegistry();
  const controlPlane = new SupabaseFactoryControlPlane(registry, provider, () => new Date("2026-08-26T05:01:00.000Z"));
  const backupCatalog = new MemoryBackupCatalog();
  let restoredBackupId: string | undefined;
  let migrationApplyCalls = 0;
  const composition = new FactoryServiceComposition({
    controlPlane,
    backupCatalog,
    ...(options.withBackup ? { backups: { async create(manifest: ResolvedFactoryManifest) { return backupRecord(manifest); } } } : {}),
    ...(options.withRestore ? { restoreDrill: { async run(record: ProjectBackupRecord) { restoredBackupId = record.backupId; return { projectId: record.projectId, backupId: record.backupId, verified: true }; } } } : {}),
    ...(options.withMigrations ? {
      migrations: {
        async plan(projectId: string) { return { projectId, pending: true }; },
        async apply(projectId: string, _source: unknown, approval: "APPLY_MIGRATIONS") {
          assert.equal(approval, "APPLY_MIGRATIONS");
          migrationApplyCalls += 1;
          return { projectId, applied: true };
        },
      },
    } : {}),
    now: () => new Date("2026-08-26T05:02:00.000Z"),
  });
  const audit = new MemoryAudit();
  const api = new FactoryAgentApi({
    authorization: new StaticRoleAuthorizationPolicy(),
    audit,
    handlers: composition.handlers(),
    now: () => new Date("2026-08-26T05:03:00.000Z"),
  });
  return { provider, registry, controlPlane, backupCatalog, composition, api, audit, getRestoredBackupId: () => restoredBackupId, getMigrationApplyCalls: () => migrationApplyCalls };
}

const manifest = {
  apiVersion: FACTORY_API_VERSION,
  project: { id: "service-app", environment: "staging" as const },
  profile: "minimal" as const,
};

async function createProject(api: FactoryAgentApi) {
  return api.invoke({
    principal: { id: "factory-admin", roles: ["administrator"] },
    tool: "factory.project.create",
    arguments: { manifest },
    requestId: "request-create-0001",
  });
}

test("service composition wires project create and backup create into persistent catalog state", async () => {
  const f = await fixture({ withBackup: true });
  await createProject(f.api);
  const backup = await f.api.invoke({
    principal: { id: "factory-admin", roles: ["administrator"] },
    tool: "factory.backup.create",
    arguments: { projectId: "service-app" },
    requestId: "request-backup-0001",
  }) as ProjectBackupRecord;

  assert.equal(backup.backupId, "20260826050000");
  assert.equal((await f.backupCatalog.get("service-app", backup.backupId))?.verified, true);
  assert.equal((await f.controlPlane.get("service-app"))?.lastBackupAt, "2026-08-26T05:00:00.000Z");
  assert.equal(f.audit.entries.at(-1)?.outcome, "success");
});

test("restore drill resolves a cataloged backup using only projectId + backupId", async () => {
  const f = await fixture({ withBackup: true, withRestore: true });
  await createProject(f.api);
  await f.api.invoke({
    principal: { id: "factory-admin", roles: ["administrator"] },
    tool: "factory.backup.create",
    arguments: { projectId: "service-app" },
    requestId: "request-backup-0002",
  });
  const result = await f.api.invoke({
    principal: { id: "factory-admin", roles: ["administrator"] },
    tool: "factory.restore.drill",
    arguments: { projectId: "service-app", backupId: "20260826050000" },
    requestId: "request-restore-0001",
  }) as { verified: boolean };
  assert.equal(result.verified, true);
  assert.equal(f.getRestoredBackupId(), "20260826050000");
  assert.equal((await f.controlPlane.get("service-app"))?.lastRestoreDrillAt, "2026-08-26T05:02:00.000Z");
});

test("migration apply handler preserves controller approval token instead of bypassing lifecycle gate", async () => {
  const f = await fixture({ withMigrations: true });
  await createProject(f.api);
  await f.api.invoke({
    principal: { id: "factory-admin", roles: ["administrator"] },
    tool: "factory.migrations.apply",
    arguments: {
      projectId: "service-app",
      source: { workdir: "/srv/checkouts/service-app" },
      approval: "APPLY_MIGRATIONS",
    },
    requestId: "request-migrate-0001",
  });
  assert.equal(f.getMigrationApplyCalls(), 1);
});

test("unimplemented destructive tools stay fail-closed instead of being auto-wired", async () => {
  const f = await fixture();
  await createProject(f.api);
  await assert.rejects(() => f.api.invoke({
    principal: { id: "factory-admin", roles: ["administrator"] },
    tool: "factory.project.destroy",
    arguments: { projectId: "service-app", approval: "DESTROY" },
    requestId: "request-destroy-0001",
  }), /not configured/);
  assert.equal(f.audit.entries.at(-1)?.errorCode, "TOOL_NOT_CONFIGURED");
});
