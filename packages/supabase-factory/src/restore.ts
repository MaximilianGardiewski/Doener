import type {
  ProjectBackupRecord,
  StorageBackupReference,
  StoredBackupArtifact,
} from "./backup.ts";
import type { FactoryHostExecutor, HostExecutorRegistry } from "./host.ts";

export interface MaterializedProjectBackup {
  directory: string;
  rolesFile: string;
  schemaFile: string;
  dataFile: string;
  envFile: string;
  pgsodiumRootKey: string;
  bundledStorageDirectory?: string;
}

export interface BackupArtifactReader {
  materialize(input: {
    artifact: StoredBackupArtifact;
    host: FactoryHostExecutor;
    destination: string;
  }): Promise<MaterializedProjectBackup>;
}

export interface RestoreDrillTarget {
  id: string;
  hostId: string;
  projectRoot: string;
  disposable: true;
}

export interface RestoreHealthReport {
  healthy: boolean;
  checks: Readonly<Record<string, boolean>>;
}

export interface RestoreDrillTargetProvider {
  allocate(record: ProjectBackupRecord): Promise<RestoreDrillTarget>;
  /** Must install the original encrypted runtime configuration and pgsodium key before DB start. */
  prepare(target: RestoreDrillTarget, input: {
    record: ProjectBackupRecord;
    envFile: string;
    pgsodiumRootKey: string;
  }): Promise<void>;
  start(target: RestoreDrillTarget): Promise<void>;
  restoreBundledStorage?(target: RestoreDrillTarget, directory: string): Promise<void>;
  health(target: RestoreDrillTarget): Promise<RestoreHealthReport>;
  destroy(target: RestoreDrillTarget): Promise<void>;
}

export interface StorageRestoreProvider {
  restore(reference: StorageBackupReference, target: RestoreDrillTarget): Promise<void>;
  verify(reference: StorageBackupReference, target: RestoreDrillTarget): Promise<boolean>;
}

export interface RestoreDrillResult {
  version: 1;
  projectId: string;
  backupId: string;
  targetId: string;
  restoredDatabase: true;
  restoredStorage: boolean;
  health: RestoreHealthReport;
  verified: true;
  targetDestroyed: true;
  cloudManagementCredentialsRequired: false;
}

function assertInside(parent: string, child: string, label: string): void {
  const prefix = `${parent.replace(/\/$/, "")}/`;
  if (!child.startsWith(prefix)) throw new Error(`${label} escaped the restore staging directory`);
}

function isExternalStorage(
  storage: ProjectBackupRecord["storage"],
): storage is StorageBackupReference {
  return Boolean(storage && "ref" in storage);
}

export class DisposableRestoreDrillController {
  readonly hosts: HostExecutorRegistry;
  readonly artifactReader: BackupArtifactReader;
  readonly targets: RestoreDrillTargetProvider;
  readonly storageRestore?: StorageRestoreProvider;

  constructor(options: {
    hosts: HostExecutorRegistry;
    artifactReader: BackupArtifactReader;
    targets: RestoreDrillTargetProvider;
    storageRestore?: StorageRestoreProvider;
  }) {
    this.hosts = options.hosts;
    this.artifactReader = options.artifactReader;
    this.targets = options.targets;
    this.storageRestore = options.storageRestore;
  }

  async #restoreDatabase(
    host: FactoryHostExecutor,
    target: RestoreDrillTarget,
    backup: MaterializedProjectBackup,
  ): Promise<void> {
    const containerId = (await host.exec("docker", ["compose", "ps", "-q", "db"], {
      cwd: target.projectRoot,
      timeoutMs: 30_000,
    })).stdout.trim();
    if (!containerId) throw new Error(`restore target ${target.id} database container is not running`);

    const files: Array<[string, string]> = [
      [backup.rolesFile, "/tmp/factory-restore-roles.sql"],
      [backup.schemaFile, "/tmp/factory-restore-schema.sql"],
      [backup.dataFile, "/tmp/factory-restore-data.sql"],
    ];
    for (const [source, destination] of files) {
      await host.exec("docker", ["cp", source, `${containerId}:${destination}`], { timeoutMs: 120_000 });
    }

    await host.exec("docker", [
      "exec",
      containerId,
      "psql",
      "-U",
      "postgres",
      "--single-transaction",
      "--variable",
      "ON_ERROR_STOP=1",
      "--file",
      "/tmp/factory-restore-roles.sql",
      "--file",
      "/tmp/factory-restore-schema.sql",
      "--command",
      "SET session_replication_role = replica",
      "--file",
      "/tmp/factory-restore-data.sql",
      "--dbname",
      "postgres",
    ], { timeoutMs: 900_000 });
  }

  async run(record: ProjectBackupRecord): Promise<RestoreDrillResult> {
    if (!record.verified || !record.artifact.encrypted) {
      throw new Error("restore drills require a verified encrypted backup artifact");
    }

    const target = await this.targets.allocate(record);
    if (!target.disposable) throw new Error("restore drill target provider returned a non-disposable target");
    const host = this.hosts.get(target.hostId);
    const staging = (await host.exec("mktemp", ["-d", `/tmp/sbf-restore-${record.projectId}-${record.backupId}-XXXXXX`])).stdout.trim();
    if (!staging.startsWith("/tmp/")) throw new Error("restore staging directory was not created under /tmp");

    let destroyed = false;
    try {
      await host.chmod(staging, 0o700);
      const materialized = await this.artifactReader.materialize({ artifact: record.artifact, host, destination: staging });
      assertInside(staging, materialized.directory, "backup directory");
      assertInside(staging, materialized.rolesFile, "roles file");
      assertInside(staging, materialized.schemaFile, "schema file");
      assertInside(staging, materialized.dataFile, "data file");
      assertInside(staging, materialized.envFile, "runtime env file");
      if (!materialized.pgsodiumRootKey) throw new Error("backup artifact is missing pgsodium root key");

      await this.targets.prepare(target, {
        record,
        envFile: materialized.envFile,
        pgsodiumRootKey: materialized.pgsodiumRootKey,
      });
      await this.targets.start(target);
      await this.#restoreDatabase(host, target, materialized);

      let restoredStorage = false;
      if (record.storage && "bundledFileBackend" in record.storage) {
        if (!materialized.bundledStorageDirectory) throw new Error("backup record expects bundled Storage but artifact did not materialize it");
        assertInside(staging, materialized.bundledStorageDirectory, "bundled Storage directory");
        if (!this.targets.restoreBundledStorage) throw new Error("restore target provider cannot restore bundled file Storage");
        await this.targets.restoreBundledStorage(target, materialized.bundledStorageDirectory);
        restoredStorage = true;
      } else if (isExternalStorage(record.storage)) {
        if (!this.storageRestore) throw new Error("external Storage restore provider is required for this backup");
        await this.storageRestore.restore(record.storage, target);
        if (!(await this.storageRestore.verify(record.storage, target))) throw new Error("restored external Storage verification failed");
        restoredStorage = true;
      }

      const health = await this.targets.health(target);
      if (!health.healthy || Object.values(health.checks).some((value) => value === false)) {
        throw new Error(`restore target ${target.id} failed health/integrity checks`);
      }

      await this.targets.destroy(target);
      destroyed = true;
      return {
        version: 1,
        projectId: record.projectId,
        backupId: record.backupId,
        targetId: target.id,
        restoredDatabase: true,
        restoredStorage,
        health,
        verified: true,
        targetDestroyed: true,
        cloudManagementCredentialsRequired: false,
      };
    } finally {
      await host.remove(staging, true);
      if (!destroyed) await this.targets.destroy(target);
    }
  }
}
