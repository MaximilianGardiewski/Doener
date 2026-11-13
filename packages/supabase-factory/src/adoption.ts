import type { FactoryToolHandler, FactoryToolName } from "./agent-api.ts";
import {
  buildFactoryRepositoryLock,
  renderFactoryRepositoryLock,
  renderFactoryRepositoryManifest,
} from "./repository-contract.ts";
import {
  FACTORY_API_VERSION,
  type ProjectEnvironment,
  type ProjectProfileName,
  type SupabaseFactoryManifest,
} from "./types.ts";

export type AdoptionAvailability = "available" | "unavailable" | "unknown";
export type SupabaseAdoptionProvider = "supabase-cloud" | "self-hosted";

export interface SupabaseAdoptionSourceInventory {
  provider: SupabaseAdoptionProvider;
  projectRef?: string;
  displayName?: string;
  region?: string;
  status?: string;
  postgresMajor: 15 | 17;
  databaseExport: AdoptionAvailability;
  authExport: AdoptionAvailability;
  storageExport: AdoptionAvailability;
  edgeFunctionsExport: AdoptionAvailability;
  edgeFunctionSlugs?: readonly string[];
}

export interface SupabaseAdoptionTarget {
  projectId: string;
  environment: ProjectEnvironment;
  profile: ProjectProfileName;
  displayName?: string;
}

export type AdoptionPhaseId =
  | "inventory"
  | "repository"
  | "database-export"
  | "auth-export"
  | "storage-export"
  | "functions-export"
  | "parallel-target"
  | "restore"
  | "verify"
  | "cutover";

export interface AdoptionPhase {
  id: AdoptionPhaseId;
  summary: string;
  mutatesSource: boolean;
  requiresProtectedSecrets: boolean;
}

export interface SupabaseAdoptionPlan {
  source: SupabaseAdoptionSourceInventory;
  target: SupabaseAdoptionTarget;
  phases: readonly AdoptionPhase[];
  blockers: readonly string[];
  warnings: readonly string[];
  readyForRepositoryPreparation: boolean;
  readyForDataTransfer: boolean;
  sourceMutationRequiredBeforeCutover: false;
  sourceDecommissionIncluded: false;
  secretsBelongInRepository: false;
}

const PHASES: readonly AdoptionPhase[] = [
  { id: "inventory", summary: "Capture secret-free source inventory and compatibility constraints.", mutatesSource: false, requiresProtectedSecrets: false },
  { id: "repository", summary: "Create canonical Factory project/lock files and preserve schema changes under supabase/migrations.", mutatesSource: false, requiresProtectedSecrets: false },
  { id: "database-export", summary: "Export PostgreSQL roles, schema and data as protected transfer artifacts.", mutatesSource: false, requiresProtectedSecrets: true },
  { id: "auth-export", summary: "Transfer Auth identities through a protected database-compatible path without exposing password hashes in GitHub or chat.", mutatesSource: false, requiresProtectedSecrets: true },
  { id: "storage-export", summary: "Transfer Storage metadata and object bytes with inventory/checksum verification.", mutatesSource: false, requiresProtectedSecrets: true },
  { id: "functions-export", summary: "Export/redeploy Edge Functions and recreate function secrets outside the repository.", mutatesSource: false, requiresProtectedSecrets: true },
  { id: "parallel-target", summary: "Provision a parallel Factory-managed self-hosted Supabase target.", mutatesSource: false, requiresProtectedSecrets: true },
  { id: "restore", summary: "Restore/import database, Auth, Storage and functions into the parallel target.", mutatesSource: false, requiresProtectedSecrets: true },
  { id: "verify", summary: "Run Factory health checks and application smoke tests against the parallel target.", mutatesSource: false, requiresProtectedSecrets: false },
  { id: "cutover", summary: "Switch application/DNS configuration only after explicit cutover intent and successful verification.", mutatesSource: false, requiresProtectedSecrets: true },
];

function unavailable(label: string, availability: AdoptionAvailability, blockers: string[], warnings: string[]): void {
  if (availability === "unavailable") blockers.push(`${label}_EXPORT_UNAVAILABLE`);
  if (availability === "unknown") warnings.push(`${label}_EXPORT_NOT_YET_CONFIRMED`);
}

function sourceReadable(status?: string): boolean {
  if (!status) return true;
  return !/(inactive|paused|stopped|unavailable)/i.test(status);
}

export function planSupabaseAdoption(
  source: SupabaseAdoptionSourceInventory,
  target: SupabaseAdoptionTarget,
): SupabaseAdoptionPlan {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!sourceReadable(source.status)) blockers.push("SOURCE_NOT_READABLE");
  unavailable("DATABASE", source.databaseExport, blockers, warnings);
  unavailable("AUTH", source.authExport, blockers, warnings);
  unavailable("STORAGE", source.storageExport, blockers, warnings);

  const hasFunctions = (source.edgeFunctionSlugs?.length ?? 0) > 0;
  if (hasFunctions) unavailable("EDGE_FUNCTIONS", source.edgeFunctionsExport, blockers, warnings);
  else if (source.edgeFunctionsExport === "unknown") warnings.push("EDGE_FUNCTION_INVENTORY_NOT_YET_CONFIRMED");

  if (source.postgresMajor !== 17) warnings.push(`SOURCE_POSTGRES_${source.postgresMajor}_REQUIRES_PG17_COMPATIBILITY_PLAN`);
  if (!source.projectRef && source.provider === "supabase-cloud") warnings.push("SOURCE_PROJECT_REF_NOT_RECORDED");

  return {
    source: structuredClone(source),
    target: structuredClone(target),
    phases: PHASES,
    blockers,
    warnings,
    readyForRepositoryPreparation: true,
    readyForDataTransfer: blockers.length === 0,
    sourceMutationRequiredBeforeCutover: false,
    sourceDecommissionIncluded: false,
    secretsBelongInRepository: false,
  };
}

export function prepareSupabaseAdoption(
  source: SupabaseAdoptionSourceInventory,
  target: SupabaseAdoptionTarget,
) {
  const manifest: SupabaseFactoryManifest = {
    apiVersion: FACTORY_API_VERSION,
    project: {
      id: target.projectId,
      environment: target.environment,
      ...(target.displayName ? { displayName: target.displayName } : {}),
    },
    profile: target.profile,
  };
  const projectJson = renderFactoryRepositoryManifest(manifest);
  const lock = buildFactoryRepositoryLock(manifest);
  const plan = planSupabaseAdoption(source, target);

  return {
    plan,
    files: [
      { path: ".supabase-factory/project.json", content: projectJson },
      { path: ".supabase-factory/lock.json", content: renderFactoryRepositoryLock(manifest) },
    ] as const,
    migrationDirectory: "supabase/migrations/",
    lock,
    sourceMutationPerformed: false,
    runtimeProvisioned: false,
    secretsBelongInRepository: false,
  } as const;
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("input must be an object");
  return input as Record<string, unknown>;
}

function parseSource(value: unknown): SupabaseAdoptionSourceInventory {
  const input = object(value);
  const availability = (key: string): AdoptionAvailability => {
    const candidate = input[key];
    if (candidate === "available" || candidate === "unavailable" || candidate === "unknown") return candidate;
    throw new Error(`${key} must be available, unavailable or unknown`);
  };
  const provider = input.provider;
  if (provider !== "supabase-cloud" && provider !== "self-hosted") throw new Error("provider must be supabase-cloud or self-hosted");
  const postgresMajor = input.postgresMajor;
  if (postgresMajor !== 15 && postgresMajor !== 17) throw new Error("postgresMajor must be 15 or 17");
  const edgeFunctionSlugs = input.edgeFunctionSlugs;
  if (edgeFunctionSlugs !== undefined && (!Array.isArray(edgeFunctionSlugs) || edgeFunctionSlugs.some((item) => typeof item !== "string" || !item))) {
    throw new Error("edgeFunctionSlugs must be an array of non-empty strings");
  }
  const optional = (key: string): string | undefined => {
    const candidate = input[key];
    if (candidate === undefined) return undefined;
    if (typeof candidate !== "string" || !candidate.trim()) throw new Error(`${key} must be a non-empty string`);
    return candidate.trim();
  };
  return {
    provider,
    postgresMajor,
    databaseExport: availability("databaseExport"),
    authExport: availability("authExport"),
    storageExport: availability("storageExport"),
    edgeFunctionsExport: availability("edgeFunctionsExport"),
    ...(optional("projectRef") ? { projectRef: optional("projectRef") } : {}),
    ...(optional("displayName") ? { displayName: optional("displayName") } : {}),
    ...(optional("region") ? { region: optional("region") } : {}),
    ...(optional("status") ? { status: optional("status") } : {}),
    ...(edgeFunctionSlugs ? { edgeFunctionSlugs: edgeFunctionSlugs as string[] } : {}),
  };
}

function parseTarget(value: unknown): SupabaseAdoptionTarget {
  const input = object(value);
  const projectId = input.projectId;
  if (typeof projectId !== "string" || !/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/.test(projectId)) throw new Error("target.projectId is invalid");
  const environment = input.environment;
  if (environment !== "development" && environment !== "staging" && environment !== "production") throw new Error("target.environment is invalid");
  const profile = input.profile;
  if (profile !== "minimal" && profile !== "webapp" && profile !== "realtime" && profile !== "full" && profile !== "production-critical") throw new Error("target.profile is invalid");
  const displayName = input.displayName;
  if (displayName !== undefined && (typeof displayName !== "string" || !displayName.trim())) throw new Error("target.displayName must be a non-empty string");
  return { projectId, environment, profile, ...(typeof displayName === "string" ? { displayName: displayName.trim() } : {}) };
}

export function createAdoptionToolHandlers(): Readonly<Partial<Record<FactoryToolName, FactoryToolHandler>>> {
  return {
    "factory.adopt.plan": async (input) => {
      const args = object(input);
      return planSupabaseAdoption(parseSource(args.source), parseTarget(args.target));
    },
    "factory.adopt.prepare": async (input) => {
      const args = object(input);
      return prepareSupabaseAdoption(parseSource(args.source), parseTarget(args.target));
    },
  };
}
