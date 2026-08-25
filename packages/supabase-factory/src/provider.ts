import type {
  LifecycleState,
  ObservedProjectState,
  ProvisioningPlan,
} from "./types.ts";

export interface ApplyOptions {
  approvedOperationIds?: readonly string[];
}

export interface ApplyResult {
  projectId: string;
  state: LifecycleState;
  publicUrl?: string;
  publishableKeyConfigured: boolean;
  secretKeyConfigured: boolean;
  databaseCredentialConfigured: boolean;
}

/**
 * Infrastructure providers are the only layer allowed to touch Docker, remote
 * hosts, DNS, object storage or a secret manager. They return status flags and
 * references only; secret values never cross this boundary into MCP/API output.
 */
export interface InfrastructureProvider {
  observe(projectId: string): Promise<ObservedProjectState>;
  apply(plan: ProvisioningPlan, options?: ApplyOptions): Promise<ApplyResult>;
}

export function assertApproved(plan: ProvisioningPlan, options: ApplyOptions = {}): void {
  const approved = new Set(options.approvedOperationIds ?? []);
  const blocked = plan.operations.filter((operation) => operation.requiresApproval && !approved.has(operation.id));
  if (blocked.length > 0) {
    throw new Error(`explicit approval required for operations: ${blocked.map((item) => item.id).join(", ")}`);
  }
}
