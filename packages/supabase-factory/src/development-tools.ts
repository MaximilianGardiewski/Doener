import type { FactoryToolHandler, FactoryToolName } from "./agent-api.ts";
import type { AttachedRuntimeCatalog, AttachedSelfHostedRuntime } from "./attached-runtime.ts";
import type { SupabaseFactoryControlPlane } from "./control-plane.ts";
import {
  FACTORY_REPOSITORY_LOCK_PATH,
  FACTORY_REPOSITORY_MANIFEST_PATH,
  buildFactoryRepositoryLock,
  parseFactoryRepositoryManifest,
  renderFactoryRepositoryLock,
  renderFactoryRepositoryManifest,
} from "./repository-contract.ts";
import {
  FACTORY_API_VERSION,
  type ProjectEnvironment,
  type ProjectProfileName,
  type SupabaseFactoryManifest,
  type SupabaseService,
} from "./types.ts";

const ENVIRONMENTS = new Set<ProjectEnvironment>(["development", "staging", "production"]);
const PROFILES = new Set<ProjectProfileName>(["minimal", "webapp", "realtime", "full", "production-critical"]);
const SERVICES = new Set<SupabaseService>([
  "database",
  "auth",
  "rest",
  "gateway",
  "storage",
  "realtime",
  "functions",
  "studio",
  "analytics",
]);

function object(input: unknown, label = "input"): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object`);
  return input as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function optionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string`);
  return value.trim();
}

function repositoryResult(manifest: SupabaseFactoryManifest) {
  const projectJson = renderFactoryRepositoryManifest(manifest);
  const lock = buildFactoryRepositoryLock(manifest);
  return {
    paths: {
      manifest: FACTORY_REPOSITORY_MANIFEST_PATH,
      lock: FACTORY_REPOSITORY_LOCK_PATH,
      migrations: "supabase/migrations/",
    },
    projectJson,
    lockJson: renderFactoryRepositoryLock(manifest),
    manifest,
    lock,
    secretsBelongInRepository: false,
    deploymentTargetSelected: false,
  } as const;
}

function bootstrapManifest(input: unknown): SupabaseFactoryManifest {
  const args = object(input);
  const projectId = requiredString(args, "projectId");
  const environment = requiredString(args, "environment") as ProjectEnvironment;
  if (!ENVIRONMENTS.has(environment)) throw new Error("environment must be development, staging or production");
  const profile = (optionalString(args, "profile") ?? "webapp") as ProjectProfileName;
  if (!PROFILES.has(profile)) throw new Error("profile is invalid");
  const displayName = optionalString(args, "displayName");

  return {
    apiVersion: FACTORY_API_VERSION,
    project: {
      id: projectId,
      environment,
      ...(displayName ? { displayName } : {}),
    },
    profile,
  };
}

function attachedRuntime(input: unknown): AttachedSelfHostedRuntime {
  const args = object(input);
  const services = args.services;
  if (!Array.isArray(services) || services.length === 0 || services.some((item) => typeof item !== "string" || !SERVICES.has(item as SupabaseService))) {
    throw new Error("services must be a non-empty array of known Supabase services");
  }
  const postgresMajor = args.postgresMajor;
  if (postgresMajor !== 15 && postgresMajor !== 17) throw new Error("postgresMajor must be 15 or 17");
  const allowHttp = args.allowHttp;
  if (allowHttp !== undefined && typeof allowHttp !== "boolean") throw new Error("allowHttp must be boolean");

  return {
    projectId: requiredString(args, "projectId"),
    publicUrl: requiredString(args, "publicUrl"),
    release: requiredString(args, "release"),
    upstreamCommit: requiredString(args, "upstreamCommit"),
    postgresMajor,
    services: services as SupabaseService[],
    ...(typeof allowHttp === "boolean" ? { allowHttp } : {}),
  };
}

/**
 * Repository-oriented tools for ChatGPT. They return repository file contents
 * but never call GitHub directly; ChatGPT remains the orchestrator between the
 * GitHub connector and Factory MCP.
 */
export function createRepositoryDevelopmentToolHandlers(
  controlPlane: SupabaseFactoryControlPlane,
): Readonly<Partial<Record<FactoryToolName, FactoryToolHandler>>> {
  return {
    "factory.repository.bootstrap": async (input) => repositoryResult(bootstrapManifest(input)),
    "factory.repository.validate": async (input) => {
      const args = object(input);
      const manifest = parseFactoryRepositoryManifest(requiredString(args, "projectJson"));
      return { valid: true, ...repositoryResult(manifest) };
    },
    "factory.repository.plan": async (input) => {
      const args = object(input);
      const manifest = parseFactoryRepositoryManifest(requiredString(args, "projectJson"));
      return {
        ...repositoryResult(manifest),
        plan: await controlPlane.plan(manifest),
      };
    },
  };
}

/**
 * Development-only attachment inventory. Detach removes only Factory's catalog
 * reference; it never stops, deletes or otherwise mutates the supplied runtime.
 */
export function createAttachedRuntimeDevelopmentToolHandlers(
  catalog: AttachedRuntimeCatalog,
): Readonly<Partial<Record<FactoryToolName, FactoryToolHandler>>> {
  return {
    "factory.runtime.attach": async (input) => {
      const runtime = attachedRuntime(input);
      await catalog.put(runtime);
      return { ...runtime, attached: true, runtimeMutated: false };
    },
    "factory.runtime.get": async (input) => {
      const args = object(input);
      const projectId = requiredString(args, "projectId");
      const runtime = await catalog.get(projectId);
      if (!runtime) throw new Error(`attached runtime not found: ${projectId}`);
      return runtime;
    },
    "factory.runtime.list": async () => catalog.list(),
    "factory.runtime.detach": async (input) => {
      const args = object(input);
      const projectId = requiredString(args, "projectId");
      const existed = Boolean(await catalog.get(projectId));
      await catalog.delete(projectId);
      return { projectId, detached: existed, runtimeDestroyed: false };
    },
  };
}
