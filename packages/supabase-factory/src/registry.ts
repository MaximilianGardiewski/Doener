import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ProjectRecord } from "./types.ts";

export interface ProjectRegistry {
  get(projectId: string): Promise<ProjectRecord | undefined>;
  list(): Promise<readonly ProjectRecord[]>;
  put(record: ProjectRecord): Promise<void>;
}

export class MemoryProjectRegistry implements ProjectRegistry {
  readonly #records = new Map<string, ProjectRecord>();

  async get(projectId: string): Promise<ProjectRecord | undefined> {
    return this.#records.get(projectId);
  }

  async list(): Promise<readonly ProjectRecord[]> {
    return [...this.#records.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  async put(record: ProjectRecord): Promise<void> {
    this.#records.set(record.id, structuredClone(record));
  }
}

interface RegistryFile {
  version: 1;
  projects: ProjectRecord[];
}

export class JsonFileProjectRegistry implements ProjectRegistry {
  readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async #read(): Promise<RegistryFile> {
    try {
      const content = await readFile(this.path, "utf8");
      const parsed = JSON.parse(content) as RegistryFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.projects)) {
        throw new Error("unsupported Supabase Factory registry format");
      }
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, projects: [] };
      }
      throw error;
    }
  }

  async get(projectId: string): Promise<ProjectRecord | undefined> {
    return (await this.#read()).projects.find((project) => project.id === projectId);
  }

  async list(): Promise<readonly ProjectRecord[]> {
    return (await this.#read()).projects.sort((a, b) => a.id.localeCompare(b.id));
  }

  async put(record: ProjectRecord): Promise<void> {
    const registry = await this.#read();
    const index = registry.projects.findIndex((project) => project.id === record.id);
    if (index >= 0) registry.projects[index] = record;
    else registry.projects.push(record);

    await mkdir(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, this.path);
  }
}
