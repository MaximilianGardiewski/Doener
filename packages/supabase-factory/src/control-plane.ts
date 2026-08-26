import { planProject } from "./planner.ts";
import { assertApproved, type ApplyOptions, type InfrastructureProvider } from "./provider.ts";
import type { ProjectRegistry } from "./registry.ts";
import type { ProjectRecord, ProvisioningPlan, SupabaseFactoryManifest } from "./types.ts";

export class SupabaseFactoryControlPlane {
  readonly registry: ProjectRegistry;
  readonly provider: InfrastructureProvider;
  readonly now: () => Date;

  constructor(
    registry: ProjectRegistry,
    provider: InfrastructureProvider,
    now: () => Date = () => new Date(),
  ) {
    this.registry = registry;
    this.provider = provider;
    this.now = now;
  }

  async plan(manifest: SupabaseFactoryManifest): Promise<ProvisioningPlan> {
    const observed = await this.provider.observe(manifest.project.id);
    return planProject(manifest, observed);
  }

  async apply(manifest: SupabaseFactoryManifest, options: ApplyOptions = {}): Promise<ProjectRecord> {
    const plan = await this.plan(manifest);
    assertApproved(plan, options);

    const existing = await this.registry.get(plan.projectId);
    const result = await this.provider.apply(plan, options);
    const timestamp = this.now().toISOString();

    const record: ProjectRecord = {
      id: plan.projectId,
      desired: plan.desired,
      state: result.state,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      ...(result.publicUrl ? { publicUrl: result.publicUrl } : {}),
      publishableKeyConfigured: result.publishableKeyConfigured,
      secretKeyConfigured: result.secretKeyConfigured,
      databaseCredentialConfigured: result.databaseCredentialConfigured,
      ...(existing?.lastBackupAt ? { lastBackupAt: existing.lastBackupAt } : {}),
      ...(existing?.lastRestoreDrillAt ? { lastRestoreDrillAt: existing.lastRestoreDrillAt } : {}),
    };

    await this.registry.put(record);
    return record;
  }

  async get(projectId: string): Promise<ProjectRecord | undefined> {
    return this.registry.get(projectId);
  }

  async list(): Promise<readonly ProjectRecord[]> {
    return this.registry.list();
  }
}
