import type { ProjectBackupRecord } from "./backup.ts";
import type { FactoryHostExecutor, HostExecutorRegistry } from "./host.ts";
import type { ProjectPlacement, ProjectScheduler } from "./placement.ts";
import type { ResolvedFactoryManifest } from "./types.ts";

const UPSTREAM_REPO = "https://github.com/supabase/supabase.git";

export interface VerifiedBackupCreator {
  create(manifest: ResolvedFactoryManifest): Promise<ProjectBackupRecord>;
}

/**
 * Re-applies Factory-owned runtime layers after update.sh has merged upstream
 * vendor files, before containers are recreated. This is where Compose isolation,
 * Realtime Envoy patching, endpoint bindings and other Factory overlays converge.
 */
export interface ReleaseRuntimeReconciler {
  reconcile(target: ResolvedFactoryManifest, placement: ProjectPlacement): Promise<void>;
  verify(target: ResolvedFactoryManifest, placement: ProjectPlacement): Promise<boolean>;
}

export interface SupabaseReleaseUpgradePreview {
  projectId: string;
  fromRelease: string;
  fromCommit: string;
  toRelease: string;
  toCommit: string;
  dryRunOutput: string;
  requiresVerifiedBackup: true;
  requiresExplicitApply: true;
  postgresMajorChange: false;
}

export interface SupabaseReleaseUpgradeResult {
  projectId: string;
  fromRelease: string;
  toRelease: string;
  backupId: string;
  backupArtifactRef: string;
  applied: true;
  verified: true;
}

function assertCompatibleUpgrade(current: ResolvedFactoryManifest, target: ResolvedFactoryManifest): void {
  if (current.project.id !== target.project.id) throw new Error("upgrade source and target must refer to the same project");
  if (current.supabase.postgresMajor !== target.supabase.postgresMajor) {
    throw new Error("PostgreSQL major-version changes require the dedicated pg_upgrade workflow");
  }
  if (current.supabase.release === target.supabase.release && current.supabase.upstreamCommit === target.supabase.upstreamCommit) {
    throw new Error("project already matches the requested Supabase release and commit");
  }
}

function parseRemoteTag(output: string, release: string): string | undefined {
  const tag = `refs/tags/${release}`;
  const peeled = `${tag}^{}`;
  const rows = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const peeledRow = rows.find((line) => line.endsWith(`\t${peeled}`));
  const directRow = rows.find((line) => line.endsWith(`\t${tag}`));
  return (peeledRow ?? directRow)?.split(/\s+/)[0];
}

export class StagedSupabaseReleaseUpgradeController {
  readonly scheduler: ProjectScheduler;
  readonly hosts: HostExecutorRegistry;
  readonly backupCreator: VerifiedBackupCreator;
  readonly reconciler: ReleaseRuntimeReconciler;

  constructor(options: {
    scheduler: ProjectScheduler;
    hosts: HostExecutorRegistry;
    backupCreator: VerifiedBackupCreator;
    reconciler: ReleaseRuntimeReconciler;
  }) {
    this.scheduler = options.scheduler;
    this.hosts = options.hosts;
    this.backupCreator = options.backupCreator;
    this.reconciler = options.reconciler;
  }

  async #placement(projectId: string): Promise<{ placement: ProjectPlacement; host: FactoryHostExecutor }> {
    const placement = await this.scheduler.get(projectId);
    if (!placement) throw new Error(`project ${projectId} has no Factory placement`);
    return { placement, host: this.hosts.get(placement.hostId) };
  }

  async #verifyTargetCommit(host: FactoryHostExecutor, target: ResolvedFactoryManifest): Promise<void> {
    const result = await host.exec("git", [
      "ls-remote",
      "--tags",
      UPSTREAM_REPO,
      `refs/tags/${target.supabase.release}`,
      `refs/tags/${target.supabase.release}^{}`,
    ], { timeoutMs: 60_000 });
    const resolved = parseRemoteTag(result.stdout, target.supabase.release);
    if (!resolved) throw new Error(`could not resolve upstream Supabase release ${target.supabase.release}`);
    if (resolved !== target.supabase.upstreamCommit) {
      throw new Error(`Supabase target integrity mismatch: expected ${target.supabase.upstreamCommit}, got ${resolved}`);
    }
  }

  async preview(current: ResolvedFactoryManifest, target: ResolvedFactoryManifest): Promise<SupabaseReleaseUpgradePreview> {
    assertCompatibleUpgrade(current, target);
    const { placement, host } = await this.#placement(current.project.id);
    if (!(await host.exists(`${placement.projectRoot}/update.sh`))) throw new Error("Supabase update.sh is missing from the project runtime");
    if (!(await host.exists(`${placement.projectRoot}/.supabase-version`))) {
      throw new Error(".supabase-version is missing; a safe three-way update preview is not possible");
    }
    await this.#verifyTargetCommit(host, target);
    const result = await host.exec("sh", ["update.sh", "--dry-run", "--to", target.supabase.release], {
      cwd: placement.projectRoot,
      timeoutMs: 300_000,
    });
    return {
      projectId: current.project.id,
      fromRelease: current.supabase.release,
      fromCommit: current.supabase.upstreamCommit,
      toRelease: target.supabase.release,
      toCommit: target.supabase.upstreamCommit,
      dryRunOutput: `${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim(),
      requiresVerifiedBackup: true,
      requiresExplicitApply: true,
      postgresMajorChange: false,
    };
  }

  async apply(
    current: ResolvedFactoryManifest,
    target: ResolvedFactoryManifest,
    approval: "APPLY_SUPABASE_UPGRADE",
  ): Promise<SupabaseReleaseUpgradeResult> {
    if (approval !== "APPLY_SUPABASE_UPGRADE") throw new Error("explicit APPLY_SUPABASE_UPGRADE approval is required");

    // Fresh integrity check + dry-run immediately before any mutating step.
    await this.preview(current, target);
    const { placement, host } = await this.#placement(current.project.id);

    const backup = await this.backupCreator.create(current);
    if (!backup.verified || !backup.artifact.encrypted) {
      throw new Error("Supabase release upgrade requires a freshly verified encrypted project backup");
    }

    await host.exec("sh", ["update.sh", "--to", target.supabase.release, "--yes"], {
      cwd: placement.projectRoot,
      timeoutMs: 600_000,
    });

    // update.sh owns vendor merging; Factory immediately restores its generated
    // isolation/binding layers before the updated containers are recreated.
    await this.reconciler.reconcile(target, placement);
    await host.exec("sh", ["run.sh", "pull"], { cwd: placement.projectRoot, timeoutMs: 600_000 });
    await host.exec("sh", ["run.sh", "recreate"], { cwd: placement.projectRoot, timeoutMs: 600_000 });

    if (!(await this.reconciler.verify(target, placement))) {
      throw new Error("updated Supabase runtime failed Factory health/integrity verification");
    }

    // Preserve update.sh-compatible ref= while adding the exact commit pin used by
    // Factory drift/supply-chain checks.
    await host.writeText(
      `${placement.projectRoot}/.supabase-version`,
      `# Managed by Supabase Factory; compatible with official update.sh\nref=${target.supabase.release}\ncommit=${target.supabase.upstreamCommit}\n`,
      0o600,
    );

    return {
      projectId: current.project.id,
      fromRelease: current.supabase.release,
      toRelease: target.supabase.release,
      backupId: backup.backupId,
      backupArtifactRef: backup.artifact.ref,
      applied: true,
      verified: true,
    };
  }
}
