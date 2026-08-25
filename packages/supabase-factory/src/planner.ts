import { resolveManifest } from "./manifest.ts";
import type {
  ObservedProjectState,
  PlanOperation,
  ProvisioningPlan,
  ResolvedFactoryManifest,
  SupabaseFactoryManifest,
  SupabaseService,
} from "./types.ts";

function op(
  id: string,
  kind: PlanOperation["kind"],
  summary: string,
  dependsOn: readonly string[] = [],
  requiresApproval = false,
): PlanOperation {
  return { id, kind, summary, dependsOn, requiresApproval };
}

function sameServices(a: readonly SupabaseService[] = [], b: readonly SupabaseService[] = []): boolean {
  return [...a].sort().join("\0") === [...b].sort().join("\0");
}

function createOperations(desired: ResolvedFactoryManifest): PlanOperation[] {
  const operations: PlanOperation[] = [
    op("allocate", "allocate-project", `Allocate isolated runtime for ${desired.project.id}`),
    op(
      "checkout",
      "checkout-supabase-release",
      `Pin official Supabase ${desired.supabase.release}@${desired.supabase.upstreamCommit.slice(0, 12)} with PostgreSQL ${desired.supabase.postgresMajor}`,
      ["allocate"],
    ),
    op("secrets", "generate-project-secrets", "Generate project-owned API, JWT, database and dashboard secrets", ["checkout"]),
    op("network", "configure-network", "Configure private project network plus HTTPS gateway boundary", ["checkout"]),
  ];

  if (desired.services.includes("storage")) {
    operations.push(
      op(
        "storage",
        "configure-storage",
        `Configure ${desired.storage.backend} Storage backend using project-scoped credentials`,
        ["secrets", "network"],
      ),
    );
  }

  operations.push(
    op(
      "runtime",
      "configure-runtime",
      "Render project-specific Supabase environment without Supabase Cloud project binding",
      desired.services.includes("storage") ? ["storage"] : ["secrets", "network"],
    ),
    op("start", "start-services", `Start only required services: ${desired.services.join(", ")}`, ["runtime"]),
    op("verify", "verify-health", "Verify gateway, Auth, Storage and runtime health contracts before application schema deployment", ["start"]),
  );

  if (desired.backup.logical !== "off" || desired.backup.pitr || desired.backup.storageReplication) {
    operations.push(
      op(
        "backup-policy",
        "configure-backup",
        "Configure project backup policy; actual backups and restore drills remain explicit lifecycle operations",
        ["verify"],
      ),
    );
  }

  return operations;
}

function reconcileOperations(desired: ResolvedFactoryManifest, observed: ObservedProjectState): PlanOperation[] {
  const operations: PlanOperation[] = [];

  if (observed.postgresMajor !== undefined && observed.postgresMajor !== desired.supabase.postgresMajor) {
    operations.push(
      op(
        "upgrade-postgres",
        "upgrade-project",
        `Plan PostgreSQL ${observed.postgresMajor} -> ${desired.supabase.postgresMajor} compatibility-gated upgrade`,
        [],
        true,
      ),
    );
  }

  const releaseDrift = observed.release !== undefined && observed.release !== desired.supabase.release;
  const commitDrift = observed.upstreamCommit !== undefined && observed.upstreamCommit !== desired.supabase.upstreamCommit;
  if (releaseDrift || commitDrift) {
    operations.push(
      op(
        "upgrade-supabase",
        "upgrade-project",
        `Plan Supabase ${observed.release ?? "unknown"}@${observed.upstreamCommit?.slice(0, 12) ?? "unknown"} -> ${desired.supabase.release}@${desired.supabase.upstreamCommit.slice(0, 12)} staged upgrade`,
        operations.map((item) => item.id),
        true,
      ),
    );
  }

  if (!sameServices(observed.services, desired.services)) {
    operations.push(
      op(
        "services",
        "reconcile-services",
        `Reconcile enabled services to: ${desired.services.join(", ")}`,
        operations.map((item) => item.id),
      ),
    );
  }

  if (observed.healthy === false) {
    operations.push(
      op("health", "verify-health", "Re-run health contracts and surface degraded components", operations.map((item) => item.id)),
    );
  }

  return operations;
}

export function planProject(input: SupabaseFactoryManifest, observed: ObservedProjectState = { exists: false }): ProvisioningPlan {
  const desired = resolveManifest(input);
  const operations = observed.exists ? reconcileOperations(desired, observed) : createOperations(desired);

  return {
    projectId: desired.project.id,
    desired,
    operations,
    cloudManagementCredentialsRequired: false,
    exposesSecretValues: false,
  };
}
