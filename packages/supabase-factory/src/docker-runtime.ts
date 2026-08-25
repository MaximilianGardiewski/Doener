import { dirname } from "node:path";
import { patchEnvFile, requireEnvValues } from "./env-file.ts";
import type { FactoryHostExecutor } from "./host.ts";
import type { ProjectPlacement } from "./placement.ts";
import type { SecretRef, SecretStore } from "./secrets.ts";
import {
  patchEnvoyRealtimeConfig,
  renderFactoryComposeOverride,
  resolveDockerRuntimeLayout,
} from "./docker-compose.ts";
import type { ResolvedFactoryManifest, SupabaseService } from "./types.ts";

const UPSTREAM_REPO = "https://github.com/supabase/supabase.git";
const MIN_COMPOSE = [2, 24, 4] as const;

const REQUIRED_GENERATED_SECRET_KEYS = [
  "POSTGRES_PASSWORD",
  "JWT_SECRET",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "JWT_KEYS",
  "JWT_JWKS",
  "ANON_KEY_ASYMMETRIC",
  "SERVICE_ROLE_KEY_ASYMMETRIC",
  "DASHBOARD_PASSWORD",
  "SECRET_KEY_BASE",
  "REALTIME_DB_ENC_KEY",
  "VAULT_ENC_KEY",
  "PG_META_CRYPTO_KEY",
] as const;

const OPTIONAL_GENERATED_SECRET_KEYS = [
  "LOGFLARE_PUBLIC_ACCESS_TOKEN",
  "LOGFLARE_PRIVATE_ACCESS_TOKEN",
  "S3_PROTOCOL_ACCESS_KEY_ID",
  "S3_PROTOCOL_ACCESS_KEY_SECRET",
  "MINIO_ROOT_PASSWORD",
] as const;

export interface DockerRuntimeEndpoints {
  publicUrl: string;
  siteUrl: string;
  additionalRedirectUrls?: readonly string[];
}

export interface ExternalS3RuntimeConfig {
  endpoint: string;
  protocol?: "http" | "https";
  forcePathStyle?: boolean;
  accessKeyId: SecretRef;
  secretAccessKey: SecretRef;
}

export interface DockerRuntimeInput {
  manifest: ResolvedFactoryManifest;
  placement: ProjectPlacement;
  endpoints: DockerRuntimeEndpoints;
  s3?: ExternalS3RuntimeConfig;
}

export interface DockerRuntimeState {
  version: 1;
  projectId: string;
  hostId: string;
  apiGatewayPort: number;
  composeProjectName: string;
  realtimeTenantName: string;
  release: string;
  upstreamCommit: string;
  postgresMajor: 15 | 17;
  services: readonly SupabaseService[];
  publicUrl: string;
  preparedAt: string;
}

export interface PreparedDockerRuntime {
  state: DockerRuntimeState;
  generatedSecretRefs: Readonly<Record<string, SecretRef>>;
}

export function parseComposeVersion(value: string): [number, number, number] {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`could not parse Docker Compose version: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function versionAtLeast(current: readonly number[], minimum: readonly number[]): boolean {
  for (let i = 0; i < 3; i += 1) {
    if ((current[i] ?? 0) > (minimum[i] ?? 0)) return true;
    if ((current[i] ?? 0) < (minimum[i] ?? 0)) return false;
  }
  return true;
}

function validateHttps(url: string, name: string, production: boolean): void {
  const parsed = new URL(url);
  if (production && parsed.protocol !== "https:") throw new Error(`${name} must use https in production`);
  if (production && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error(`${name} must not use localhost in production`);
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function optionalEnvValues(source: string, keys: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of keys) {
    const match = source.match(new RegExp(`^${key}=(.+)$`, "m"));
    if (match?.[1]) values[key] = match[1];
  }
  return values;
}

export class DockerRuntimePreparer {
  readonly host: FactoryHostExecutor;
  readonly secretStore: SecretStore;
  readonly now: () => Date;

  constructor(
    host: FactoryHostExecutor,
    secretStore: SecretStore,
    now: () => Date = () => new Date(),
  ) {
    this.host = host;
    this.secretStore = secretStore;
    this.now = now;
  }

  async checkPrerequisites(): Promise<void> {
    await this.host.exec("git", ["--version"]);
    await this.host.exec("sh", ["--version"]).catch(async () => this.host.exec("sh", ["-c", "exit 0"]));
    const compose = await this.host.exec("docker", ["compose", "version", "--short"]);
    const version = parseComposeVersion(compose.stdout.trim() || compose.stderr.trim());
    if (!versionAtLeast(version, MIN_COMPOSE)) {
      throw new Error(`Docker Compose >= ${MIN_COMPOSE.join(".")} is required for deterministic Factory overrides`);
    }
  }

  async #bootstrapOfficialRuntime(input: DockerRuntimeInput): Promise<void> {
    const { manifest, placement } = input;
    if (await this.host.exists(placement.projectRoot)) return;

    await this.host.mkdir(dirname(placement.projectRoot));
    const clonePath = `${placement.projectRoot}.upstream-${process.pid}-${Date.now()}`;
    try {
      await this.host.exec("git", [
        "clone",
        "--filter=blob:none",
        "--no-checkout",
        "--depth=1",
        "--branch",
        manifest.supabase.release,
        UPSTREAM_REPO,
        clonePath,
      ], { timeoutMs: 180_000 });

      const head = (await this.host.exec("git", ["-C", clonePath, "rev-parse", "HEAD"])).stdout.trim();
      if (head !== manifest.supabase.upstreamCommit) {
        throw new Error(`Supabase release integrity mismatch: expected ${manifest.supabase.upstreamCommit}, got ${head}`);
      }

      await this.host.exec("git", ["-C", clonePath, "sparse-checkout", "init", "--cone"]);
      await this.host.exec("git", ["-C", clonePath, "sparse-checkout", "set", "docker"]);
      await this.host.exec("git", ["-C", clonePath, "checkout", "--quiet"]);
      await this.host.mkdir(placement.projectRoot);
      await this.host.exec("cp", ["-a", `${clonePath}/docker/.`, placement.projectRoot]);
    } catch (error) {
      await this.host.remove(placement.projectRoot, true);
      throw error;
    } finally {
      await this.host.remove(clonePath, true);
    }

    const envExample = await this.host.readText(`${placement.projectRoot}/.env.example`);
    await this.host.writeText(`${placement.projectRoot}/.env`, envExample, 0o600);

    await this.host.exec("sh", ["utils/generate-keys.sh", "--update-env"], { cwd: placement.projectRoot });
    await this.host.exec("sh", ["utils/add-new-auth-keys.sh", "--update-env"], { cwd: placement.projectRoot });
    await this.host.writeText(
      `${placement.projectRoot}/.supabase-version`,
      `# Managed by Supabase Factory; compatible with official update.sh\nref=${manifest.supabase.release}\ncommit=${manifest.supabase.upstreamCommit}\n`,
      0o600,
    );
  }

  async #configureRuntime(input: DockerRuntimeInput): Promise<Readonly<Record<string, SecretRef>>> {
    const { manifest, placement, endpoints } = input;
    const production = manifest.project.environment === "production";
    validateHttps(endpoints.publicUrl, "publicUrl", production);
    validateHttps(endpoints.siteUrl, "siteUrl", production);

    const layout = resolveDockerRuntimeLayout(manifest, {
      hostId: placement.hostId,
      apiGatewayPort: placement.apiGatewayPort,
    });
    const envPath = `${placement.projectRoot}/.env`;
    let env = await this.host.readText(envPath);

    const replacements: Record<string, string> = {
      COMPOSE_PROJECT_NAME: layout.composeProjectName,
      COMPOSE_FILE: "docker-compose.yml:docker-compose.factory.yml",
      SUPABASE_PUBLIC_URL: trimSlash(endpoints.publicUrl),
      API_EXTERNAL_URL: `${trimSlash(endpoints.publicUrl)}/auth/v1`,
      SITE_URL: trimSlash(endpoints.siteUrl),
      ADDITIONAL_REDIRECT_URLS: (endpoints.additionalRedirectUrls ?? []).join(","),
      STORAGE_TENANT_ID: manifest.project.id,
      GLOBAL_S3_BUCKET: manifest.storage.bucketPrefix,
      REGION: manifest.storage.region,
    };

    if (manifest.services.includes("storage") && manifest.storage.backend === "s3") {
      if (!input.s3) throw new Error("production S3 Storage requires an external S3 runtime configuration");
      replacements.FACTORY_S3_ENDPOINT = input.s3.endpoint;
      replacements.FACTORY_S3_PROTOCOL = input.s3.protocol ?? "https";
      replacements.FACTORY_S3_FORCE_PATH_STYLE = String(input.s3.forcePathStyle ?? true);
      replacements.FACTORY_S3_ACCESS_KEY_ID = await this.secretStore.get(input.s3.accessKeyId);
      replacements.FACTORY_S3_SECRET_ACCESS_KEY = await this.secretStore.get(input.s3.secretAccessKey);
    }

    env = patchEnvFile(env, replacements);
    await this.host.writeText(envPath, env, 0o600);
    await this.host.writeText(
      `${placement.projectRoot}/docker-compose.factory.yml`,
      renderFactoryComposeOverride(manifest, {
        hostId: placement.hostId,
        apiGatewayPort: placement.apiGatewayPort,
      }),
      0o600,
    );

    if (manifest.services.includes("realtime")) {
      for (const relative of ["volumes/api/envoy/cds.yaml", "volumes/api/envoy/lds.template.yaml"]) {
        const path = `${placement.projectRoot}/${relative}`;
        const source = await this.host.readText(path);
        await this.host.writeText(path, patchEnvoyRealtimeConfig(source, layout.realtimeDnsName), 0o600);
      }
    }

    const generated = {
      ...requireEnvValues(env, REQUIRED_GENERATED_SECRET_KEYS),
      ...optionalEnvValues(env, OPTIONAL_GENERATED_SECRET_KEYS),
    };
    const refs: Record<string, SecretRef> = {};
    for (const [key, value] of Object.entries(generated)) {
      refs[key] = await this.secretStore.put(`projects/${manifest.project.id}/supabase/${key}`, value);
    }
    return refs;
  }

  async prepare(input: DockerRuntimeInput): Promise<PreparedDockerRuntime> {
    if (input.placement.hostId !== this.host.id) {
      throw new Error(`placement targets ${input.placement.hostId}, but preparer is attached to ${this.host.id}`);
    }
    await this.checkPrerequisites();
    await this.#bootstrapOfficialRuntime(input);
    const generatedSecretRefs = await this.#configureRuntime(input);

    await this.host.exec("docker", ["compose", "config", "--quiet"], { cwd: input.placement.projectRoot });

    const layout = resolveDockerRuntimeLayout(input.manifest, {
      hostId: input.placement.hostId,
      apiGatewayPort: input.placement.apiGatewayPort,
    });
    const state: DockerRuntimeState = {
      version: 1,
      projectId: input.manifest.project.id,
      hostId: input.placement.hostId,
      apiGatewayPort: input.placement.apiGatewayPort,
      composeProjectName: layout.composeProjectName,
      realtimeTenantName: layout.realtimeTenantName,
      release: input.manifest.supabase.release,
      upstreamCommit: input.manifest.supabase.upstreamCommit,
      postgresMajor: input.manifest.supabase.postgresMajor,
      services: input.manifest.services,
      publicUrl: trimSlash(input.endpoints.publicUrl),
      preparedAt: this.now().toISOString(),
    };
    await this.host.writeText(`${input.placement.projectRoot}/.factory-state.json`, `${JSON.stringify(state, null, 2)}\n`, 0o600);
    return { state, generatedSecretRefs };
  }

  async start(projectRoot: string): Promise<void> {
    await this.host.exec("docker", ["compose", "pull"], { cwd: projectRoot, timeoutMs: 600_000 });
    await this.host.exec("docker", ["compose", "up", "-d", "--wait"], { cwd: projectRoot, timeoutMs: 600_000 });
  }

  async stop(projectRoot: string): Promise<void> {
    await this.host.exec("docker", ["compose", "down"], { cwd: projectRoot, timeoutMs: 180_000 });
  }

  async readState(projectRoot: string): Promise<DockerRuntimeState | undefined> {
    const path = `${projectRoot}/.factory-state.json`;
    if (!(await this.host.exists(path))) return undefined;
    const parsed = JSON.parse(await this.host.readText(path)) as DockerRuntimeState;
    if (parsed.version !== 1) throw new Error("unsupported Docker runtime state version");
    return parsed;
  }
}
