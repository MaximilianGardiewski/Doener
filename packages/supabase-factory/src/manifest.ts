import {
  FACTORY_API_VERSION,
  SUPABASE_BASELINE,
  type ProjectProfileName,
  type ResolvedFactoryManifest,
  type SupabaseFactoryManifest,
  type SupabaseService,
} from "./types.ts";

interface ProfileDefaults {
  services: readonly SupabaseService[];
  backup: ResolvedFactoryManifest["backup"];
}

const BASE_SERVICES = ["database", "auth", "rest", "gateway"] as const satisfies readonly SupabaseService[];

const PROFILES: Record<ProjectProfileName, ProfileDefaults> = {
  minimal: {
    services: BASE_SERVICES,
    backup: { logical: "daily", pitr: false, storageReplication: false, restoreDrill: "monthly" },
  },
  webapp: {
    services: [...BASE_SERVICES, "storage", "studio"],
    backup: { logical: "daily", pitr: false, storageReplication: true, restoreDrill: "monthly" },
  },
  realtime: {
    services: [...BASE_SERVICES, "storage", "realtime", "studio"],
    backup: { logical: "daily", pitr: false, storageReplication: true, restoreDrill: "monthly" },
  },
  full: {
    services: [...BASE_SERVICES, "storage", "realtime", "functions", "studio"],
    backup: { logical: "daily", pitr: false, storageReplication: true, restoreDrill: "monthly" },
  },
  "production-critical": {
    services: [...BASE_SERVICES, "storage", "realtime", "functions", "studio"],
    backup: { logical: "hourly", pitr: true, storageReplication: true, restoreDrill: "weekly" },
  },
};

const PROJECT_ID = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
const SELF_HOST_RELEASE = /^self-hosted\/v\d+\.\d+\.\d+$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

function withFeatureOverrides(
  profileServices: readonly SupabaseService[],
  features: SupabaseFactoryManifest["features"],
): SupabaseService[] {
  const services = new Set<SupabaseService>(profileServices);
  services.add("database");
  services.add("gateway");

  const toggles: Array<[keyof NonNullable<SupabaseFactoryManifest["features"]>, SupabaseService]> = [
    ["auth", "auth"],
    ["rest", "rest"],
    ["storage", "storage"],
    ["realtime", "realtime"],
    ["functions", "functions"],
    ["analytics", "analytics"],
  ];

  for (const [key, service] of toggles) {
    const enabled = features?.[key];
    if (enabled === true) services.add(service);
    if (enabled === false) services.delete(service);
  }

  if (features?.studio === "internal") services.add("studio");
  if (features?.studio === "disabled") services.delete("studio");

  return [...services].sort();
}

function resolveVersion(input: SupabaseFactoryManifest): ResolvedFactoryManifest["supabase"] {
  const release = input.supabase?.release ?? SUPABASE_BASELINE.release;
  if (!SELF_HOST_RELEASE.test(release)) {
    throw new Error("supabase.release must be an explicit self-hosted/vX.Y.Z release tag");
  }

  const usingBaseline = release === SUPABASE_BASELINE.release;
  const upstreamCommit = input.supabase?.upstreamCommit ?? (usingBaseline ? SUPABASE_BASELINE.upstreamCommit : undefined);
  if (!upstreamCommit || !COMMIT_SHA.test(upstreamCommit)) {
    throw new Error("a verified 40-character upstreamCommit is required for non-baseline Supabase releases");
  }

  const postgresMajor = input.supabase?.postgresMajor ?? SUPABASE_BASELINE.postgresMajor;
  if (postgresMajor === 15 && input.profile === "production-critical") {
    throw new Error("new production-critical projects must use PostgreSQL 17");
  }

  return { release, upstreamCommit, postgresMajor, gateway: "envoy" };
}

export function resolveManifest(input: SupabaseFactoryManifest): ResolvedFactoryManifest {
  if (input.apiVersion !== FACTORY_API_VERSION) {
    throw new Error(`Unsupported apiVersion: ${input.apiVersion}`);
  }

  const id = input.project.id.trim();
  if (!PROJECT_ID.test(id)) {
    throw new Error("project.id must be a DNS-safe lowercase slug between 3 and 64 characters");
  }

  const profile = PROFILES[input.profile];
  const services = withFeatureOverrides(profile.services, input.features);
  const storageEnabled = services.includes("storage");
  const production = input.project.environment === "production";
  const storageBackend = input.storage?.backend ?? (production && storageEnabled ? "s3" : "file");

  if (storageEnabled && !services.includes("rest")) {
    throw new Error("Storage requires REST in the official self-hosted Docker runtime");
  }
  if (services.includes("analytics")) {
    throw new Error("Analytics is not enabled in Docker Provider V1 until the project-scoped Vector routing overlay is available");
  }
  if (production && storageEnabled && storageBackend !== "s3") {
    throw new Error("production projects with Storage must use an S3-compatible backend");
  }

  if (input.security?.databasePublic === true) {
    throw new Error("public PostgreSQL exposure is forbidden by factory policy");
  }
  if (input.security?.studioPublic === true) {
    throw new Error("public Studio exposure is forbidden by factory policy");
  }

  return {
    apiVersion: FACTORY_API_VERSION,
    project: { ...input.project, id },
    profile: input.profile,
    supabase: resolveVersion(input),
    services,
    storage: {
      backend: storageBackend,
      bucketPrefix: input.storage?.bucketPrefix ?? id,
      region: input.storage?.region ?? "eu-central-1",
    },
    backup: {
      logical: input.backup?.logical ?? profile.backup.logical,
      pitr: input.backup?.pitr ?? profile.backup.pitr,
      storageReplication: input.backup?.storageReplication ?? profile.backup.storageReplication,
      restoreDrill: input.backup?.restoreDrill ?? profile.backup.restoreDrill,
    },
    security: {
      rlsRequired: input.security?.rlsRequired ?? true,
      databasePublic: false,
      studioPublic: false,
      requireHttps: input.security?.requireHttps ?? production,
      allowLegacyApiKeys: input.security?.allowLegacyApiKeys ?? false,
    },
  };
}
