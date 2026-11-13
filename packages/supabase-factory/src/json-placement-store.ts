import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PlacementStore, ProjectPlacement } from "./placement.ts";

interface PlacementFile {
  version: 1;
  placements: ProjectPlacement[];
}

function assertPlacement(value: ProjectPlacement): void {
  if (!/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/.test(value.projectId)) throw new Error("invalid persisted Factory project ID");
  if (!value.hostId.trim()) throw new Error("invalid persisted Factory host ID");
  if (!value.projectRoot.startsWith("/")) throw new Error("persisted Factory project root must be absolute");
  if (!Number.isInteger(value.apiGatewayPort) || value.apiGatewayPort < 1024 || value.apiGatewayPort > 65535) {
    throw new Error("invalid persisted Factory gateway port");
  }
}

function sorted(values: readonly ProjectPlacement[]): ProjectPlacement[] {
  return [...values].sort((a, b) => a.projectId.localeCompare(b.projectId));
}

/**
 * Durable single-daemon placement store. Writes use temp-file + atomic rename and
 * mode 0600. A tiny in-process write queue prevents concurrent MCP calls from
 * losing updates while still keeping the scheduler interface simple.
 */
export class JsonFilePlacementStore implements PlacementStore {
  readonly path: string;
  #writeTail: Promise<void> = Promise.resolve();

  constructor(path: string) {
    if (!path.startsWith("/")) throw new Error("placement store path must be absolute");
    this.path = path;
  }

  async #read(): Promise<PlacementFile> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as PlacementFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.placements)) throw new Error("unsupported Factory placement-store format");
      for (const placement of parsed.placements) assertPlacement(placement);
      const ids = new Set(parsed.placements.map((item) => item.projectId));
      if (ids.size !== parsed.placements.length) throw new Error("duplicate project IDs in Factory placement store");
      const ports = new Set(parsed.placements.map((item) => `${item.hostId}:${item.apiGatewayPort}`));
      if (ports.size !== parsed.placements.length) throw new Error("duplicate host gateway ports in Factory placement store");
      return { version: 1, placements: sorted(parsed.placements) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, placements: [] };
      throw error;
    }
  }

  async #mutate(mutator: (file: PlacementFile) => void): Promise<void> {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const turn = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
    const previous = this.#writeTail;
    this.#writeTail = turn.catch(() => undefined);
    await previous;
    try {
      const file = await this.#read();
      mutator(file);
      file.placements = sorted(file.placements);
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temp = `${this.path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temp, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temp, this.path);
      resolve();
    } catch (error) {
      reject(error);
      throw error;
    }
  }

  async get(projectId: string): Promise<ProjectPlacement | undefined> {
    const value = (await this.#read()).placements.find((item) => item.projectId === projectId);
    return value ? structuredClone(value) : undefined;
  }

  async list(): Promise<readonly ProjectPlacement[]> {
    return (await this.#read()).placements.map((item) => structuredClone(item));
  }

  async put(placement: ProjectPlacement): Promise<void> {
    assertPlacement(placement);
    await this.#mutate((file) => {
      const portOwner = file.placements.find((item) =>
        item.hostId === placement.hostId && item.apiGatewayPort === placement.apiGatewayPort && item.projectId !== placement.projectId,
      );
      if (portOwner) throw new Error(`gateway port ${placement.apiGatewayPort} is already assigned to ${portOwner.projectId}`);
      const index = file.placements.findIndex((item) => item.projectId === placement.projectId);
      if (index >= 0) file.placements[index] = structuredClone(placement);
      else file.placements.push(structuredClone(placement));
    });
  }

  async delete(projectId: string): Promise<void> {
    await this.#mutate((file) => {
      file.placements = file.placements.filter((item) => item.projectId !== projectId);
    });
  }
}
