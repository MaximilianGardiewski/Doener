import type { VerifiedBackupCreator, ReleaseRuntimeReconciler } from "./upgrade.ts";
import type { FactoryHostExecutor, HostExecutorRegistry } from "./host.ts";
import type { ProjectPlacement, ProjectScheduler } from "./placement.ts";
import type { ResolvedFactoryManifest } from "./types.ts";

const INCOMPATIBLE_EXTENSIONS = ["timescaledb", "plv8", "plcoffee", "plls"] as const;
const EXTRA_REQUIRED_KB = 5 * 1024 * 1024;

export interface Postgres17UpgradePreview {
  projectId: string;
  fromMajor: 15;
  toMajor: 17;
  currentImage: string;
  dataSizeKb: number;
  availableKb: number;
  requiredKb: number;
  incompatibleExtensions: readonly string[];
  requiresVerifiedBackup: true;
  requiresExplicitApply: true;
}

export interface Postgres17UpgradeResult {
  projectId: string;
  fromMajor: 15;
  toMajor: 17;
  backupId: string;
  backupArtifactRef: string;
  preservedPg15Data: string;
  preservedPgsodiumKey: string;
  applied: true;
  verified: true;
}

function parseFirstInteger(value: string, label: string): number {
  const match = value.match(/\d+/);
  if (!match) throw new Error(`could not determine ${label}`);
  const parsed = Number(match[0]);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`invalid ${label}`);
  return parsed;
}

function assertTransition(current: ResolvedFactoryManifest, target: ResolvedFactoryManifest): void {
  if (current.project.id !== target.project.id) throw new Error("Postgres upgrade source and target must refer to the same project");
  if (current.supabase.postgresMajor !== 15 || target.supabase.postgresMajor !== 17) {
    throw new Error("this controller only supports PostgreSQL 15 -> 17");
  }
  if (current.supabase.release !== target.supabase.release || current.supabase.upstreamCommit !== target.supabase.upstreamCommit) {
    throw new Error("change the Supabase release separately before or after the PostgreSQL major upgrade");
  }
}

export class Postgres15To17UpgradeController {
  readonly scheduler: ProjectScheduler;
  readonly hosts: HostExecutorRegistry;
  readonly backupCreator: VerifiedBackupCreator;
  readonly reconciler: ReleaseRuntimeReconciler;
  readonly privilege: "sudo" | "direct";

  constructor(options: {
    scheduler: ProjectScheduler;
    hosts: HostExecutorRegistry;
    backupCreator: VerifiedBackupCreator;
    reconciler: ReleaseRuntimeReconciler;
    privilege?: "sudo" | "direct";
  }) {
    this.scheduler = options.scheduler;
    this.hosts = options.hosts;
    this.backupCreator = options.backupCreator;
    this.reconciler = options.reconciler;
    this.privilege = options.privilege ?? "sudo";
  }

  async #placement(projectId: string): Promise<{ placement: ProjectPlacement; host: FactoryHostExecutor }> {
    const placement = await this.scheduler.get(projectId);
    if (!placement) throw new Error(`project ${projectId} has no Factory placement`);
    return { placement, host: this.hosts.get(placement.hostId) };
  }

  async #extensions(host: FactoryHostExecutor, placement: ProjectPlacement): Promise<string[]> {
    const sql = "SELECT extname FROM pg_extension WHERE extname IN ('timescaledb','plv8','plcoffee','plls') ORDER BY extname;";
    const result = await host.exec("docker", ["compose", "exec", "-T", "db", "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], {
      cwd: placement.projectRoot,
      timeoutMs: 60_000,
    });
    return result.stdout.split(/\r?\n/).map((value) => value.trim()).filter((value) => INCOMPATIBLE_EXTENSIONS.includes(value as typeof INCOMPATIBLE_EXTENSIONS[number]));
  }

  async preview(current: ResolvedFactoryManifest, target: ResolvedFactoryManifest): Promise<Postgres17UpgradePreview> {
    assertTransition(current, target);
    const { placement, host } = await this.#placement(current.project.id);
    for (const relative of ["utils/upgrade-pg17.sh", "docker-compose.pg17.yml", ".env", "volumes/db/data"]) {
      if (!(await host.exists(`${placement.projectRoot}/${relative}`))) throw new Error(`Postgres 17 upgrade prerequisite is missing: ${relative}`);
    }
    if (await host.exists(`${placement.projectRoot}/volumes/db/data.bak.pg15`)) {
      throw new Error("a previous PG15 backup directory exists; verify/rollback/clean it before another major upgrade");
    }

    const containerId = (await host.exec("docker", ["compose", "ps", "-q", "db"], { cwd: placement.projectRoot, timeoutMs: 30_000 })).stdout.trim();
    if (!containerId) throw new Error("PostgreSQL 15 database container is not running");
    const currentImage = (await host.exec("docker", ["inspect", "-f", "{{.Config.Image}}", containerId], { timeoutMs: 30_000 })).stdout.trim();
    if (!/^supabase[/.]postgres:15\./.test(currentImage)) throw new Error(`expected a Supabase PostgreSQL 15 image, got ${currentImage}`);

    const dataSizeKb = parseFirstInteger((await host.exec("du", ["-sk", `${placement.projectRoot}/volumes/db/data`], { timeoutMs: 120_000 })).stdout, "PostgreSQL data size");
    const dfOutput = (await host.exec("df", ["-Pk", `${placement.projectRoot}/volumes/db`], { timeoutMs: 30_000 })).stdout.trim().split(/\r?\n/);
    const dataRow = dfOutput.at(-1)?.trim().split(/\s+/) ?? [];
    if (dataRow.length < 4) throw new Error("could not determine free disk space for PostgreSQL upgrade");
    const availableKb = parseFirstInteger(dataRow[3], "available disk space");
    const requiredKb = dataSizeKb * 2 + EXTRA_REQUIRED_KB;
    if (availableKb < requiredKb) {
      throw new Error(`insufficient disk space for PG15 -> PG17: need at least ${requiredKb} KB, have ${availableKb} KB`);
    }

    const incompatibleExtensions = await this.#extensions(host, placement);
    if (incompatibleExtensions.length > 0) {
      throw new Error(`PostgreSQL 17 incompatible extensions installed: ${incompatibleExtensions.join(", ")}`);
    }

    return {
      projectId: current.project.id,
      fromMajor: 15,
      toMajor: 17,
      currentImage,
      dataSizeKb,
      availableKb,
      requiredKb,
      incompatibleExtensions,
      requiresVerifiedBackup: true,
      requiresExplicitApply: true,
    };
  }

  async #runUpgrade(host: FactoryHostExecutor, placement: ProjectPlacement): Promise<void> {
    if (this.privilege === "sudo") {
      await host.exec("sudo", ["-n", "bash", "utils/upgrade-pg17.sh", "--yes"], { cwd: placement.projectRoot, timeoutMs: 7_200_000 });
    } else {
      await host.exec("bash", ["utils/upgrade-pg17.sh", "--yes"], { cwd: placement.projectRoot, timeoutMs: 7_200_000 });
    }
  }

  async apply(
    current: ResolvedFactoryManifest,
    target: ResolvedFactoryManifest,
    approval: "APPLY_POSTGRES_17_UPGRADE",
  ): Promise<Postgres17UpgradeResult> {
    if (approval !== "APPLY_POSTGRES_17_UPGRADE") throw new Error("explicit APPLY_POSTGRES_17_UPGRADE approval is required");
    await this.preview(current, target);
    const { placement, host } = await this.#placement(current.project.id);

    const backup = await this.backupCreator.create(current);
    if (!backup.verified || !backup.artifact.encrypted) {
      throw new Error("PostgreSQL major upgrade requires a freshly verified encrypted Factory backup");
    }

    await this.#runUpgrade(host, placement);

    const version = (await host.exec("docker", ["compose", "exec", "-T", "db", "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", "SHOW server_version_num;"], {
      cwd: placement.projectRoot,
      timeoutMs: 60_000,
    })).stdout.trim();
    if (!/^17\d{4}$/.test(version)) throw new Error(`PostgreSQL upgrade finished but server reports unexpected version ${version}`);

    const preservedPg15Data = `${placement.projectRoot}/volumes/db/data.bak.pg15`;
    const preservedPgsodiumKey = `${placement.projectRoot}/volumes/db/pgsodium_root.key.bak.pg15`;
    if (!(await host.exists(preservedPg15Data))) throw new Error("PG15 rollback data directory was not preserved");
    if (!(await host.exists(preservedPgsodiumKey))) throw new Error("PG15 pgsodium root-key backup was not preserved");

    await this.reconciler.reconcile(target, placement);
    if (!(await this.reconciler.verify(target, placement))) throw new Error("PG17 runtime failed Factory health/integrity verification");

    return {
      projectId: current.project.id,
      fromMajor: 15,
      toMajor: 17,
      backupId: backup.backupId,
      backupArtifactRef: backup.artifact.ref,
      preservedPg15Data,
      preservedPgsodiumKey,
      applied: true,
      verified: true,
    };
  }
}
