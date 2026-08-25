import type { FactoryHostExecutor, HostExecutorRegistry } from "./host.ts";
import type { ProjectPlacement, ProjectScheduler } from "./placement.ts";
import type { SecretStore } from "./secrets.ts";

export const SUPABASE_CLI_BASELINE = "2.115.0" as const;

const CLOUD_ENV_KEYS = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_REF",
] as const;

export interface MigrationSource {
  /** Absolute project checkout root containing supabase/migrations. */
  workdir: string;
  /** When supplied, the checkout must resolve exactly to this Git commit. */
  expectedGitCommit?: string;
  /** Production defaults to refusing tracked modifications. */
  allowDirtyTrackedFiles?: boolean;
}

export interface MigrationPlanResult {
  projectId: string;
  cliVersion: string;
  sourceGitCommit?: string;
  pending: boolean;
  dryRunOutput: string;
  cloudManagementCredentialsRequired: false;
  requiresExplicitApply: true;
}

export interface MigrationApplyResult {
  projectId: string;
  applied: true;
  cliVersion: string;
  output: string;
  migrationHistory: string;
  cloudManagementCredentialsRequired: false;
}

interface DatabaseTarget {
  placement: ProjectPlacement;
  host: FactoryHostExecutor;
  url: string;
  password: string;
}

function parseCliVersion(output: string): string {
  const match = output.match(/\b(\d+\.\d+\.\d+)\b/);
  if (!match) throw new Error(`could not parse Supabase CLI version from: ${output.trim()}`);
  return match[1];
}

function redact(value: string, secrets: readonly string[]): string {
  let safe = value;
  for (const secret of secrets) {
    if (!secret) continue;
    safe = safe.split(secret).join("[REDACTED]");
    try {
      safe = safe.split(encodeURIComponent(secret)).join("[REDACTED]");
    } catch {
      // Literal replacement above is still applied.
    }
  }
  return safe;
}

function cloudlessCommand(command: string, args: readonly string[]): readonly string[] {
  const unset = CLOUD_ENV_KEYS.flatMap((key) => ["-u", key]);
  return [...unset, command, ...args];
}

export class DockerMigrationController {
  readonly scheduler: ProjectScheduler;
  readonly hosts: HostExecutorRegistry;
  readonly secretStore: SecretStore;
  readonly cliVersion: string;

  constructor(options: {
    scheduler: ProjectScheduler;
    hosts: HostExecutorRegistry;
    secretStore: SecretStore;
    cliVersion?: string;
  }) {
    this.scheduler = options.scheduler;
    this.hosts = options.hosts;
    this.secretStore = options.secretStore;
    this.cliVersion = options.cliVersion ?? SUPABASE_CLI_BASELINE;
  }

  async #verifyCli(host: FactoryHostExecutor): Promise<void> {
    const result = await host.exec("supabase", ["--version"], { timeoutMs: 30_000 });
    const actual = parseCliVersion(`${result.stdout}\n${result.stderr}`);
    if (actual !== this.cliVersion) {
      throw new Error(`Supabase CLI version mismatch: expected ${this.cliVersion}, got ${actual}`);
    }
  }

  async #verifySource(host: FactoryHostExecutor, source: MigrationSource): Promise<string | undefined> {
    if (!source.workdir.startsWith("/")) throw new Error("migration source workdir must be absolute");
    if (!(await host.exists(`${source.workdir}/supabase/migrations`))) {
      throw new Error(`migration source is missing supabase/migrations: ${source.workdir}`);
    }

    if (!source.expectedGitCommit) return undefined;
    if (!/^[0-9a-f]{40}$/.test(source.expectedGitCommit)) throw new Error("expectedGitCommit must be a 40-character SHA");

    const actual = (await host.exec("git", ["-C", source.workdir, "rev-parse", "HEAD"], { timeoutMs: 30_000 })).stdout.trim();
    if (actual !== source.expectedGitCommit) {
      throw new Error(`migration source commit mismatch: expected ${source.expectedGitCommit}, got ${actual}`);
    }

    if (!source.allowDirtyTrackedFiles) {
      const dirty = (await host.exec("git", ["-C", source.workdir, "status", "--porcelain", "--untracked-files=no"], { timeoutMs: 30_000 })).stdout.trim();
      if (dirty) throw new Error("migration source has tracked modifications; refusing non-reproducible apply");
    }
    return actual;
  }

  async #target(projectId: string): Promise<DatabaseTarget> {
    const placement = await this.scheduler.get(projectId);
    if (!placement) throw new Error(`project ${projectId} has no Factory placement`);
    const host = this.hosts.get(placement.hostId);

    const containerId = (await host.exec("docker", ["compose", "ps", "-q", "db"], {
      cwd: placement.projectRoot,
      timeoutMs: 30_000,
    })).stdout.trim();
    if (!containerId) throw new Error(`project ${projectId} database container is not running`);

    const ipOutput = (await host.exec("docker", [
      "inspect",
      "-f",
      "{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}",
      containerId,
    ], { timeoutMs: 30_000 })).stdout.trim();
    const hostIp = ipOutput.split(/\s+/).find(Boolean);
    if (!hostIp) throw new Error(`project ${projectId} database has no Docker network address`);

    const secretRef = {
      store: this.secretStore.name,
      key: `projects/${projectId}/supabase/POSTGRES_PASSWORD`,
    };
    const password = await this.secretStore.get(secretRef);
    const url = new URL(`postgresql://postgres@${hostIp}:5432/postgres`);
    url.password = password;
    return { placement, host, url: url.toString(), password };
  }

  async #run(target: DatabaseTarget, source: MigrationSource, args: readonly string[]): Promise<string> {
    const commandArgs = cloudlessCommand("supabase", args);
    try {
      const result = await target.host.exec("env", commandArgs, {
        cwd: source.workdir,
        timeoutMs: 300_000,
      });
      return redact(`${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`.trim(), [target.password, target.url]);
    } catch (error) {
      const candidate = error as { message?: string; stdout?: string; stderr?: string };
      const details = [candidate.message, candidate.stdout, candidate.stderr].filter(Boolean).join("\n");
      throw new Error(redact(details || "Supabase migration command failed", [target.password, target.url]));
    }
  }

  async plan(projectId: string, source: MigrationSource): Promise<MigrationPlanResult> {
    const target = await this.#target(projectId);
    await this.#verifyCli(target.host);
    const sourceGitCommit = await this.#verifySource(target.host, source);
    const dryRunOutput = await this.#run(target, source, ["db", "push", "--db-url", target.url, "--dry-run"]);
    const pending = !/no pending migrations|database is up to date/i.test(dryRunOutput);

    return {
      projectId,
      cliVersion: this.cliVersion,
      ...(sourceGitCommit ? { sourceGitCommit } : {}),
      pending,
      dryRunOutput,
      cloudManagementCredentialsRequired: false,
      requiresExplicitApply: true,
    };
  }

  async apply(
    projectId: string,
    source: MigrationSource,
    approval: "APPLY_MIGRATIONS",
  ): Promise<MigrationApplyResult> {
    if (approval !== "APPLY_MIGRATIONS") throw new Error("explicit APPLY_MIGRATIONS approval is required");
    const target = await this.#target(projectId);
    await this.#verifyCli(target.host);
    await this.#verifySource(target.host, source);

    // Always run a fresh dry-run immediately before the mutating command.
    await this.#run(target, source, ["db", "push", "--db-url", target.url, "--dry-run"]);
    const output = await this.#run(target, source, ["db", "push", "--db-url", target.url]);
    const migrationHistory = await this.#run(target, source, ["migration", "list", "--db-url", target.url]);

    return {
      projectId,
      applied: true,
      cliVersion: this.cliVersion,
      output,
      migrationHistory,
      cloudManagementCredentialsRequired: false,
    };
  }
}
