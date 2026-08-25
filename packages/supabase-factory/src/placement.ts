export interface FactoryHost {
  id: string;
  enabled: boolean;
  projectRoot: string;
  gatewayPortStart: number;
  gatewayPortEnd: number;
  maxProjects: number;
  labels?: Readonly<Record<string, string>>;
}

export interface ProjectPlacement {
  projectId: string;
  hostId: string;
  projectRoot: string;
  apiGatewayPort: number;
}

export interface PlacementStore {
  get(projectId: string): Promise<ProjectPlacement | undefined>;
  list(): Promise<readonly ProjectPlacement[]>;
  put(placement: ProjectPlacement): Promise<void>;
  delete(projectId: string): Promise<void>;
}

export class MemoryPlacementStore implements PlacementStore {
  readonly #placements = new Map<string, ProjectPlacement>();

  async get(projectId: string): Promise<ProjectPlacement | undefined> {
    return this.#placements.get(projectId);
  }

  async list(): Promise<readonly ProjectPlacement[]> {
    return [...this.#placements.values()].sort((a, b) => a.projectId.localeCompare(b.projectId));
  }

  async put(placement: ProjectPlacement): Promise<void> {
    this.#placements.set(placement.projectId, structuredClone(placement));
  }

  async delete(projectId: string): Promise<void> {
    this.#placements.delete(projectId);
  }
}

function validateHost(host: FactoryHost): void {
  if (!host.id.trim()) throw new Error("host id is required");
  if (!host.projectRoot.startsWith("/")) throw new Error(`host ${host.id} projectRoot must be absolute`);
  if (!Number.isInteger(host.maxProjects) || host.maxProjects < 1) throw new Error(`host ${host.id} maxProjects must be >= 1`);
  for (const [label, port] of [["gatewayPortStart", host.gatewayPortStart], ["gatewayPortEnd", host.gatewayPortEnd]] as const) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`host ${host.id} ${label} is invalid`);
  }
  if (host.gatewayPortStart > host.gatewayPortEnd) throw new Error(`host ${host.id} gateway port range is reversed`);
  const availablePorts = host.gatewayPortEnd - host.gatewayPortStart + 1;
  if (availablePorts < host.maxProjects) {
    throw new Error(`host ${host.id} gateway port range has fewer ports than maxProjects`);
  }
}

export class ProjectScheduler {
  readonly #hosts: readonly FactoryHost[];
  readonly store: PlacementStore;

  constructor(hosts: readonly FactoryHost[], store: PlacementStore) {
    if (hosts.length === 0) throw new Error("at least one Factory host is required");
    for (const host of hosts) validateHost(host);
    const ids = new Set(hosts.map((host) => host.id));
    if (ids.size !== hosts.length) throw new Error("Factory host ids must be unique");
    this.#hosts = [...hosts];
    this.store = store;
  }

  async get(projectId: string): Promise<ProjectPlacement | undefined> {
    return this.store.get(projectId);
  }

  async allocate(projectId: string, requiredLabels: Readonly<Record<string, string>> = {}): Promise<ProjectPlacement> {
    const existing = await this.store.get(projectId);
    if (existing) return existing;

    const placements = await this.store.list();
    const candidates = this.#hosts
      .filter((host) => host.enabled)
      .filter((host) => Object.entries(requiredLabels).every(([key, value]) => host.labels?.[key] === value))
      .map((host) => ({
        host,
        placements: placements.filter((item) => item.hostId === host.id),
      }))
      .filter(({ host, placements: assigned }) => assigned.length < host.maxProjects)
      .sort((a, b) => a.placements.length - b.placements.length || a.host.id.localeCompare(b.host.id));

    for (const { host, placements: assigned } of candidates) {
      const usedPorts = new Set(assigned.map((item) => item.apiGatewayPort));
      for (let port = host.gatewayPortStart; port <= host.gatewayPortEnd; port += 1) {
        if (usedPorts.has(port)) continue;
        const placement: ProjectPlacement = {
          projectId,
          hostId: host.id,
          projectRoot: `${host.projectRoot.replace(/\/$/, "")}/${projectId}`,
          apiGatewayPort: port,
        };
        await this.store.put(placement);
        return placement;
      }
    }

    throw new Error(`no Factory host capacity available for project ${projectId}`);
  }

  async release(projectId: string): Promise<void> {
    await this.store.delete(projectId);
  }
}
