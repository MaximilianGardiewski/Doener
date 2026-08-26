import { createHash } from "node:crypto";
import { resolveManifest } from "./manifest.ts";
import type { ResolvedFactoryManifest, SupabaseFactoryManifest } from "./types.ts";

export const FACTORY_REPOSITORY_MANIFEST_PATH = ".supabase-factory/project.json" as const;
export const FACTORY_REPOSITORY_LOCK_PATH = ".supabase-factory/lock.json" as const;

export interface FactoryRepositoryLock {
  version: 1;
  sourcePath: typeof FACTORY_REPOSITORY_MANIFEST_PATH;
  manifestSha256: string;
  resolved: ResolvedFactoryManifest;
  containsSecretValues: false;
  deploymentTargetSelected: false;
}

const SECRET_LIKE_KEY = /password|passwd|secret|token|private[-_.]?key|access[-_.]?key|service[-_.]?role/i;
const CLOUD_MANAGEMENT_VALUE = /\bsbp_[A-Za-z0-9_-]+\b|SUPABASE_ACCESS_TOKEN|supabase\s+(?:login|link)/i;

function walkForForbiddenRepositoryContent(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForForbiddenRepositoryContent(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && CLOUD_MANAGEMENT_VALUE.test(value)) {
      throw new Error(`repository manifest contains forbidden Cloud-management content at ${path}`);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_LIKE_KEY.test(key)) {
      throw new Error(`repository manifest must not contain secret-like field ${path}.${key}`);
    }
    walkForForbiddenRepositoryContent(nested, `${path}.${key}`);
  }
}

function canonicalManifest(manifest: SupabaseFactoryManifest): SupabaseFactoryManifest {
  resolveManifest(manifest);
  return {
    apiVersion: manifest.apiVersion,
    project: {
      id: manifest.project.id,
      environment: manifest.project.environment,
      ...(manifest.project.displayName ? { displayName: manifest.project.displayName } : {}),
    },
    profile: manifest.profile,
    ...(manifest.supabase ? { supabase: { ...manifest.supabase } } : {}),
    ...(manifest.features ? { features: { ...manifest.features } } : {}),
    ...(manifest.storage ? { storage: { ...manifest.storage } } : {}),
    ...(manifest.auth ? {
      auth: {
        ...manifest.auth,
        ...(manifest.auth.email ? {
          email: {
            ...manifest.auth.email,
            ...(manifest.auth.email.smtp ? { smtp: { ...manifest.auth.email.smtp } } : {}),
          },
        } : {}),
        ...(manifest.auth.phone ? { phone: { ...manifest.auth.phone } } : {}),
      },
    } : {}),
    ...(manifest.backup ? { backup: { ...manifest.backup } } : {}),
    ...(manifest.security ? { security: { ...manifest.security } } : {}),
  };
}

export function parseFactoryRepositoryManifest(source: string): SupabaseFactoryManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Factory repository manifest must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Factory repository manifest must be a JSON object");
  }
  walkForForbiddenRepositoryContent(parsed);
  const manifest = parsed as SupabaseFactoryManifest;
  resolveManifest(manifest);
  return canonicalManifest(manifest);
}

export function renderFactoryRepositoryManifest(manifest: SupabaseFactoryManifest): string {
  const canonical = canonicalManifest(manifest);
  walkForForbiddenRepositoryContent(canonical);
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

export function buildFactoryRepositoryLock(manifest: SupabaseFactoryManifest): FactoryRepositoryLock {
  const source = renderFactoryRepositoryManifest(manifest);
  return {
    version: 1,
    sourcePath: FACTORY_REPOSITORY_MANIFEST_PATH,
    manifestSha256: createHash("sha256").update(source, "utf8").digest("hex"),
    resolved: resolveManifest(manifest),
    containsSecretValues: false,
    deploymentTargetSelected: false,
  };
}

export function renderFactoryRepositoryLock(manifest: SupabaseFactoryManifest): string {
  return `${JSON.stringify(buildFactoryRepositoryLock(manifest), null, 2)}\n`;
}
