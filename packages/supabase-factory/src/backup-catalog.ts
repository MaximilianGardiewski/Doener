import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ProjectBackupRecord } from "./backup.ts";

export interface BackupCatalog {
  get(projectId: string, backupId: string): Promise<ProjectBackupRecord | undefined>;
  list(projectId?: string): Promise<readonly ProjectBackupRecord[]>;
  put(record: ProjectBackupRecord): Promise<void>;
}

function assertCatalogRecord(record: ProjectBackupRecord): void {
  if (!record.verified || !record.artifact.encrypted) {
    throw new Error("Factory backup catalog accepts only verified encrypted backups");
  }
  if (!record.projectId || !record.backupId) throw new Error("backup catalog record is missing project/backup identity");
}

function sorted(records: readonly ProjectBackupRecord[]): ProjectBackupRecord[] {
  return [...records].sort((a, b) => {
    const project = a.projectId.localeCompare(b.projectId);
    if (project !== 0) return project;
    return b.createdAt.localeCompare(a.createdAt) || b.backupId.localeCompare(a.backupId);
  });
}

export class MemoryBackupCatalog implements BackupCatalog {
  readonly #records = new Map<string, ProjectBackupRecord>();

  #key(projectId: string, backupId: string): string { return `${projectId}\u0000${backupId}`; }

  async get(projectId: string, backupId: string): Promise<ProjectBackupRecord | undefined> {
    const value = this.#records.get(this.#key(projectId, backupId));
    return value ? structuredClone(value) : undefined;
  }

  async list(projectId?: string): Promise<readonly ProjectBackupRecord[]> {
    const records = [...this.#records.values()].filter((record) => !projectId || record.projectId === projectId);
    return sorted(records).map((record) => structuredClone(record));
  }

  async put(record: ProjectBackupRecord): Promise<void> {
    assertCatalogRecord(record);
    this.#records.set(this.#key(record.projectId, record.backupId), structuredClone(record));
  }
}

interface BackupCatalogFile {
  version: 1;
  backups: ProjectBackupRecord[];
}

export class JsonFileBackupCatalog implements BackupCatalog {
  readonly path: string;

  constructor(path: string) {
    if (!path.startsWith("/")) throw new Error("backup catalog path must be absolute");
    this.path = path;
  }

  async #read(): Promise<BackupCatalogFile> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as BackupCatalogFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.backups)) throw new Error("unsupported Factory backup catalog format");
      for (const backup of parsed.backups) assertCatalogRecord(backup);
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, backups: [] };
      throw error;
    }
  }

  async get(projectId: string, backupId: string): Promise<ProjectBackupRecord | undefined> {
    return (await this.#read()).backups.find((record) => record.projectId === projectId && record.backupId === backupId);
  }

  async list(projectId?: string): Promise<readonly ProjectBackupRecord[]> {
    return sorted((await this.#read()).backups.filter((record) => !projectId || record.projectId === projectId));
  }

  async put(record: ProjectBackupRecord): Promise<void> {
    assertCatalogRecord(record);
    const catalog = await this.#read();
    const index = catalog.backups.findIndex((existing) => existing.projectId === record.projectId && existing.backupId === record.backupId);
    if (index >= 0) catalog.backups[index] = record;
    else catalog.backups.push(record);
    catalog.backups = sorted(catalog.backups);

    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }
}
