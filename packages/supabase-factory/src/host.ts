import { execFile } from "node:child_process";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface HostCommandOptions {
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

export interface HostCommandResult {
  stdout: string;
  stderr: string;
}

export interface FactoryHostExecutor {
  readonly id: string;
  exec(file: string, args?: readonly string[], options?: HostCommandOptions): Promise<HostCommandResult>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, mode?: number): Promise<void>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string, mode?: number): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  remove(path: string, recursive?: boolean): Promise<void>;
}

export class LocalHostExecutor implements FactoryHostExecutor {
  constructor(readonly id = "local") {}

  async exec(file: string, args: readonly string[] = [], options: HostCommandOptions = {}): Promise<HostCommandResult> {
    const result = await execFileAsync(file, [...args], {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? 120_000,
      maxBuffer: 8 * 1024 * 1024,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      encoding: "utf8",
    });
    return { stdout: result.stdout, stderr: result.stderr };
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async mkdir(path: string, mode = 0o700): Promise<void> {
    await mkdir(path, { recursive: true, mode });
  }

  async readText(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async writeText(path: string, content: string, mode = 0o600): Promise<void> {
    await writeFile(path, content, { encoding: "utf8", mode });
    await chmod(path, mode);
  }

  async chmod(path: string, mode: number): Promise<void> {
    await chmod(path, mode);
  }

  async remove(path: string, recursive = false): Promise<void> {
    await rm(path, { recursive, force: true });
  }
}

export class HostExecutorRegistry {
  readonly #hosts = new Map<string, FactoryHostExecutor>();

  constructor(hosts: readonly FactoryHostExecutor[]) {
    for (const host of hosts) {
      if (this.#hosts.has(host.id)) throw new Error(`duplicate host executor id: ${host.id}`);
      this.#hosts.set(host.id, host);
    }
  }

  get(id: string): FactoryHostExecutor {
    const host = this.#hosts.get(id);
    if (!host) throw new Error(`no host executor registered for ${id}`);
    return host;
  }
}
