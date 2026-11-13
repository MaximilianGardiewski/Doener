import type { FactoryToolHandler, FactoryToolName } from "./agent-api.ts";
import type { BackupCatalog } from "./backup-catalog.ts";
import type { ProjectBackupRecord } from "./backup.ts";
import type { SupabaseFactoryControlPlane } from "./control-plane.ts";
import { resolveManifest } from "./manifest.ts";
import type { MigrationSource } from "./migrations.ts";
import type { ProjectRecord, ResolvedFactoryManifest, SupabaseFactoryManifest } from "./types.ts";

export interface MigrationLifecycleService {
  plan(projectId: string, source: MigrationSource): Promise<unknown>;
  apply(projectId: string, source: MigrationSource, approval: "APPLY_MIGRATIONS"): Promise<unknown>;
}

export interface BackupLifecycleService {
  create(manifest: ResolvedFactoryManifest): Promise<ProjectBackupRecord>;
}

export interface BackupRecordVerifier {
  verify(record: ProjectBackupRecord): Promise<boolean>;
}

export interface RestoreDrillLifecycleService {
  run(record: ProjectBackupRecord): Promise<unknown>;
}

export interface SupabaseReleaseUpgradeLifecycleService {
  preview(current: ResolvedFactoryManifest, target: ResolvedFactoryManifest): Promise<unknown>;
  apply(current: ResolvedFactoryManifest, target: ResolvedFactoryManifest, approval: "APPLY_SUPABASE_UPGRADE"): Promise<unknown>;
}

export interface Postgres17UpgradeLifecycleService {
  preview(current: ResolvedFactoryManifest, target: ResolvedFactoryManifest): Promise<unknown>;
  apply(current: ResolvedFactoryManifest, target: ResolvedFactoryManifest, approval: "APPLY_POSTGRES_17_UPGRADE"): Promise<unknown>;
}

function object(input: unknown, label = "input"): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object`);
  return input as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function optionalStrings(value: unknown, label: string): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) throw new Error(`${label} must be an array of strings`);
  return value as string[];
}

function manifest(value: unknown): SupabaseFactoryManifest {
  const candidate = object(value, "manifest") as unknown as SupabaseFactoryManifest;
  // Resolve once at the API boundary for validation, while preserving the input
  // shape required by the control-plane planner.
  resolveManifest(candidate);
  return candidate;
}

function migrationSource(value: unknown): MigrationSource {
  const candidate = object(value, "source");
  const workdir = requiredString(candidate, "workdir");
  const expectedGitCommit = candidate.expectedGitCommit;
  if (expectedGitCommit !== undefined && (typeof expectedGitCommit !== "string" || !/^[0-9a-f]{40}$/.test(expectedGitCommit))) {
    throw new Error("source.expectedGitCommit must be a 40-character lowercase Git SHA");
  }
  const allowDirtyTrackedFiles = candidate.allowDirtyTrackedFiles;
  if (allowDirtyTrackedFiles !== undefined && typeof allowDirtyTrackedFiles !== "boolean") {
    throw new Error("source.allowDirtyTrackedFiles must be boolean");
  }
  return {
    workdir,
    ...(typeof expectedGitCommit === "string" ? { expectedGitCommit } : {}),
    ...(typeof allowDirtyTrackedFiles === "boolean" ? { allowDirtyTrackedFiles } : {}),
  };
}

function literal<T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} must equal ${expected}`);
  return expected;
}

export interface FactoryServiceCompositionOptions {
  controlPlane: SupabaseFactoryControlPlane;
  backupCatalog: BackupCatalog;
  migrations?: MigrationLifecycleService;
  backups?: BackupLifecycleService;
  backupVerifier?: BackupRecordVerifier;
  restoreDrill?: RestoreDrillLifecycleService;
  releaseUpgrade?: SupabaseReleaseUpgradeLifecycleService;
  postgres17Upgrade?: Postgres17UpgradeLifecycleService;
  now?: () => Date;
}

/**
 * Concrete handler composition for FactoryAgentApi. It intentionally wires only
 * lifecycle services that have real implementations. Unsupported destructive
 * capabilities remain absent, causing FactoryAgentApi to fail closed with
 * TOOL_NOT_CONFIGURED rather than inventing behavior.
 */
export class FactoryServiceComposition {
  readonly controlPlane: SupabaseFactoryControlPlane;
  readonly backupCatalog: BackupCatalog;
  readonly migrations?: MigrationLifecycleService;
  readonly backups?: BackupLifecycleService;
  readonly backupVerifier?: BackupRecordVerifier;
  readonly restoreDrill?: RestoreDrillLifecycleService;
  readonly releaseUpgrade?: SupabaseReleaseUpgradeLifecycleService;
  readonly postgres17Upgrade?: Postgres17UpgradeLifecycleService;
  readonly now: () => Date;

  constructor(options: FactoryServiceCompositionOptions) {
    this.controlPlane = options.controlPlane;
    this.backupCatalog = options.backupCatalog;
    this.migrations = options.migrations;
    this.backups = options.backups;
    this.backupVerifier = options.backupVerifier;
    this.restoreDrill = options.restoreDrill;
    this.releaseUpgrade = options.releaseUpgrade;
    this.postgres17Upgrade = options.postgres17Upgrade;
    this.now = options.now ?? (() => new Date());
  }

  async #project(projectId: string): Promise<ProjectRecord> {
    const project = await this.controlPlane.get(projectId);
    if (!project) throw new Error(`Factory project not found: ${projectId}`);
    return project;
  }

  async #backup(projectId: string, backupId: string): Promise<ProjectBackupRecord> {
    const backup = await this.backupCatalog.get(projectId, backupId);
    if (!backup) throw new Error(`Factory backup not found: ${projectId}/${backupId}`);
    return backup;
  }

  async #recordBackup(project: ProjectRecord, backup: ProjectBackupRecord): Promise<void> {
    await this.backupCatalog.put(backup);
    await this.controlPlane.registry.put({
      ...project,
      lastBackupAt: backup.createdAt,
      updatedAt: this.now().toISOString(),
    });
  }

  async #recordRestoreDrill(project: ProjectRecord): Promise<void> {
    await this.controlPlane.registry.put({
      ...project,
      lastRestoreDrillAt: this.now().toISOString(),
      updatedAt: this.now().toISOString(),
    });
  }

  handlers(): Readonly<Partial<Record<FactoryToolName, FactoryToolHandler>>> {
    const handlers: Partial<Record<FactoryToolName, FactoryToolHandler>> = {
      "factory.project.plan": async (input) => {
        const args = object(input);
        return this.controlPlane.plan(manifest(args.manifest));
      },
      "factory.project.create": async (input) => {
        const args = object(input);
        return this.controlPlane.apply(manifest(args.manifest), {
          approvedOperationIds: optionalStrings(args.approvedOperationIds, "approvedOperationIds"),
        });
      },
      "factory.project.get": async (input) => {
        const args = object(input);
        return this.#project(requiredString(args, "projectId"));
      },
      "factory.project.list": async () => this.controlPlane.list(),
      "factory.project.reconcile": async (input) => {
        const args = object(input);
        const desired = manifest(args.manifest);
        await this.#project(desired.project.id);
        return this.controlPlane.apply(desired, {
          approvedOperationIds: optionalStrings(args.approvedOperationIds, "approvedOperationIds"),
        });
      },
      "factory.health.check": async (input) => {
        const args = object(input);
        const projectId = requiredString(args, "projectId");
        await this.#project(projectId);
        return this.controlPlane.provider.observe(projectId);
      },
    };

    if (this.migrations) {
      handlers["factory.migrations.plan"] = async (input) => {
        const args = object(input);
        const projectId = requiredString(args, "projectId");
        await this.#project(projectId);
        return this.migrations!.plan(projectId, migrationSource(args.source));
      };
      handlers["factory.migrations.apply"] = async (input) => {
        const args = object(input);
        const projectId = requiredString(args, "projectId");
        await this.#project(projectId);
        return this.migrations!.apply(
          projectId,
          migrationSource(args.source),
          literal(args.approval, "APPLY_MIGRATIONS", "approval"),
        );
      };
    }

    if (this.backups) {
      handlers["factory.backup.create"] = async (input) => {
        const args = object(input);
        const project = await this.#project(requiredString(args, "projectId"));
        const backup = await this.backups!.create(project.desired);
        await this.#recordBackup(project, backup);
        return backup;
      };
    }

    if (this.backupVerifier) {
      handlers["factory.backup.verify"] = async (input) => {
        const args = object(input);
        const projectId = requiredString(args, "projectId");
        const backupId = requiredString(args, "backupId");
        const backup = await this.#backup(projectId, backupId);
        const verified = await this.backupVerifier!.verify(backup);
        return { projectId, backupId, verified };
      };
    }

    if (this.restoreDrill) {
      handlers["factory.restore.drill"] = async (input) => {
        const args = object(input);
        const projectId = requiredString(args, "projectId");
        const backupId = requiredString(args, "backupId");
        const project = await this.#project(projectId);
        const backup = await this.#backup(projectId, backupId);
        const result = await this.restoreDrill!.run(backup);
        await this.#recordRestoreDrill(project);
        return result;
      };
    }

    if (this.releaseUpgrade) {
      handlers["factory.upgrade.plan"] = async (input) => {
        const args = object(input);
        const project = await this.#project(requiredString(args, "projectId"));
        const target = resolveManifest(manifest(args.target));
        return this.releaseUpgrade!.preview(project.desired, target);
      };
      handlers["factory.upgrade.apply"] = async (input) => {
        const args = object(input);
        const project = await this.#project(requiredString(args, "projectId"));
        const target = resolveManifest(manifest(args.target));
        return this.releaseUpgrade!.apply(
          project.desired,
          target,
          literal(args.approval, "APPLY_SUPABASE_UPGRADE", "approval"),
        );
      };
    }

    if (this.postgres17Upgrade) {
      handlers["factory.pg17.plan"] = async (input) => {
        const args = object(input);
        const project = await this.#project(requiredString(args, "projectId"));
        const target = resolveManifest(manifest(args.target));
        return this.postgres17Upgrade!.preview(project.desired, target);
      };
      handlers["factory.pg17.apply"] = async (input) => {
        const args = object(input);
        const project = await this.#project(requiredString(args, "projectId"));
        const target = resolveManifest(manifest(args.target));
        return this.postgres17Upgrade!.apply(
          project.desired,
          target,
          literal(args.approval, "APPLY_POSTGRES_17_UPGRADE", "approval"),
        );
      };
    }

    return handlers;
  }
}
