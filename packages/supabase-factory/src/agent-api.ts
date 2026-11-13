import { appendFile, chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type FactoryPermission =
  | "read"
  | "plan"
  | "provision"
  | "migrate"
  | "backup"
  | "restore"
  | "upgrade"
  | "destroy"
  | "admin";

export type FactoryToolName =
  | "factory.repository.bootstrap"
  | "factory.repository.validate"
  | "factory.repository.status"
  | "factory.repository.sync"
  | "factory.repository.plan"
  | "factory.adopt.plan"
  | "factory.adopt.prepare"
  | "factory.runtime.attach"
  | "factory.runtime.get"
  | "factory.runtime.list"
  | "factory.runtime.detach"
  | "factory.project.plan"
  | "factory.project.create"
  | "factory.project.get"
  | "factory.project.list"
  | "factory.project.reconcile"
  | "factory.project.destroy"
  | "factory.migrations.plan"
  | "factory.migrations.apply"
  | "factory.backup.create"
  | "factory.backup.verify"
  | "factory.restore.drill"
  | "factory.restore.apply"
  | "factory.keys.rotate"
  | "factory.upgrade.plan"
  | "factory.upgrade.apply"
  | "factory.pg17.plan"
  | "factory.pg17.apply"
  | "factory.health.check"
  | "factory.audit.get";

export interface FactoryPrincipal {
  id: string;
  roles: readonly string[];
}

export interface FactoryToolDefinition {
  name: FactoryToolName;
  description: string;
  permission: FactoryPermission;
  mutating: boolean;
  destructive: boolean;
}

export const FACTORY_TOOL_DEFINITIONS: readonly FactoryToolDefinition[] = [
  { name: "factory.repository.bootstrap", description: "Generate secret-free .supabase-factory project and lock files for a repository without selecting a deployment target.", permission: "plan", mutating: false, destructive: false },
  { name: "factory.repository.validate", description: "Validate and canonicalize a repository project.json and derive its deterministic deployment-neutral lock.", permission: "plan", mutating: false, destructive: false },
  { name: "factory.repository.status", description: "Compare project.json and the current lock without returning secret data; report whether GitHub files are canonical and synchronized.", permission: "plan", mutating: false, destructive: false },
  { name: "factory.repository.sync", description: "Return only the secret-free repository file writes needed to canonicalize project.json and refresh its deterministic lock. Factory does not write GitHub directly.", permission: "plan", mutating: false, destructive: false },
  { name: "factory.repository.plan", description: "Validate repository project.json and return the Factory provisioning plan plus deterministic lock without applying changes.", permission: "plan", mutating: false, destructive: false },
  { name: "factory.adopt.plan", description: "Plan a staged migration from an existing Supabase Cloud or self-hosted project into Factory management using only secret-free source inventory.", permission: "plan", mutating: false, destructive: false },
  { name: "factory.adopt.prepare", description: "Generate the secret-free Factory repository files and transfer checklist for an existing Supabase adoption without mutating the source or provisioning a runtime.", permission: "plan", mutating: false, destructive: false },
  { name: "factory.runtime.attach", description: "Attach a secret-free descriptor for an already-running self-hosted Supabase development runtime. The runtime itself is not mutated.", permission: "provision", mutating: true, destructive: false },
  { name: "factory.runtime.get", description: "Read one attached self-hosted development runtime descriptor without exposing credentials.", permission: "read", mutating: false, destructive: false },
  { name: "factory.runtime.list", description: "List attached self-hosted development runtime descriptors without exposing credentials.", permission: "read", mutating: false, destructive: false },
  { name: "factory.runtime.detach", description: "Remove only Factory's attachment reference to a development runtime. The runtime is not stopped or destroyed.", permission: "provision", mutating: true, destructive: false },
  { name: "factory.project.plan", description: "Plan desired self-hosted Supabase project state without applying changes.", permission: "plan", mutating: false, destructive: false },
  { name: "factory.project.create", description: "Create or converge an isolated self-hosted Supabase project.", permission: "provision", mutating: true, destructive: false },
  { name: "factory.project.get", description: "Read one secret-free Factory project record.", permission: "read", mutating: false, destructive: false },
  { name: "factory.project.list", description: "List secret-free Factory project records.", permission: "read", mutating: false, destructive: false },
  { name: "factory.project.reconcile", description: "Reconcile Factory-managed project infrastructure to desired state.", permission: "provision", mutating: true, destructive: false },
  { name: "factory.project.destroy", description: "Destroy a Factory project after explicit destructive approval.", permission: "destroy", mutating: true, destructive: true },
  { name: "factory.migrations.plan", description: "Dry-run project database migrations over a direct self-hosted DB connection.", permission: "migrate", mutating: false, destructive: false },
  { name: "factory.migrations.apply", description: "Apply migrations after an immediate fresh dry-run and explicit approval.", permission: "migrate", mutating: true, destructive: false },
  { name: "factory.backup.create", description: "Create and verify a complete encrypted project backup.", permission: "backup", mutating: true, destructive: false },
  { name: "factory.backup.verify", description: "Re-verify an encrypted backup artifact and its required storage/PITR references.", permission: "backup", mutating: false, destructive: false },
  { name: "factory.restore.drill", description: "Restore a backup into a disposable isolated target and destroy it after verification.", permission: "restore", mutating: true, destructive: false },
  { name: "factory.restore.apply", description: "Restore a project from a verified backup after explicit destructive approval.", permission: "restore", mutating: true, destructive: true },
  { name: "factory.keys.rotate", description: "Rotate project runtime/API signing credentials through the controlled key lifecycle.", permission: "admin", mutating: true, destructive: false },
  { name: "factory.upgrade.plan", description: "Preview an incremental self-hosted Supabase release update.", permission: "upgrade", mutating: false, destructive: false },
  { name: "factory.upgrade.apply", description: "Apply a Supabase release update only after verified backup and explicit approval.", permission: "upgrade", mutating: true, destructive: false },
  { name: "factory.pg17.plan", description: "Preflight a PostgreSQL 15 to 17 migration including disk and extension gates.", permission: "upgrade", mutating: false, destructive: false },
  { name: "factory.pg17.apply", description: "Run the guarded PostgreSQL 15 to 17 upgrade with rollback preservation.", permission: "upgrade", mutating: true, destructive: false },
  { name: "factory.health.check", description: "Verify the configured self-hosted runtime and Auth/REST key enforcement.", permission: "read", mutating: false, destructive: false },
  { name: "factory.audit.get", description: "Read Factory lifecycle audit metadata. Audit entries never contain secret values.", permission: "admin", mutating: false, destructive: false },
] as const;

const DEFINITION_BY_NAME = new Map(FACTORY_TOOL_DEFINITIONS.map((definition) => [definition.name, definition]));

export interface FactoryAuthorizationPolicy {
  assertAllowed(principal: FactoryPrincipal, permission: FactoryPermission, projectId?: string): Promise<void>;
}

export class StaticRoleAuthorizationPolicy implements FactoryAuthorizationPolicy {
  readonly rolePermissions: Readonly<Record<string, readonly FactoryPermission[]>>;

  constructor(rolePermissions: Readonly<Record<string, readonly FactoryPermission[]>> = {
    viewer: ["read"],
    planner: ["read", "plan"],
    operator: ["read", "plan", "provision", "migrate", "backup"],
    administrator: ["admin"],
  }) {
    this.rolePermissions = rolePermissions;
  }

  async assertAllowed(principal: FactoryPrincipal, permission: FactoryPermission): Promise<void> {
    const granted = new Set<FactoryPermission>();
    for (const role of principal.roles) for (const item of this.rolePermissions[role] ?? []) granted.add(item);
    if (granted.has("admin") || granted.has(permission)) return;
    throw new Error(`principal ${principal.id} is not authorized for Factory permission ${permission}`);
  }
}

export interface FactoryAuditEntry {
  version: 1;
  timestamp: string;
  requestId: string;
  principalId: string;
  tool: FactoryToolName;
  projectId?: string;
  mutating: boolean;
  destructive: boolean;
  outcome: "success" | "denied" | "failed";
  errorCode?: "NOT_AUTHORIZED" | "TOOL_NOT_CONFIGURED" | "HANDLER_ERROR";
}

export interface FactoryAuditLog {
  append(entry: FactoryAuditEntry): Promise<void>;
}

/** Ephemeral audit adapter for tests/CI/development; no filesystem required. */
export class MemoryFactoryAuditLog implements FactoryAuditLog {
  readonly #entries: FactoryAuditEntry[] = [];

  async append(entry: FactoryAuditEntry): Promise<void> {
    this.#entries.push(structuredClone(entry));
  }

  list(): readonly FactoryAuditEntry[] {
    return this.#entries.map((entry) => structuredClone(entry));
  }
}

export class FileFactoryAuditLog implements FactoryAuditLog {
  readonly path: string;
  constructor(path: string) {
    if (!path.startsWith("/")) throw new Error("Factory audit log path must be absolute");
    this.path = path;
  }
  async append(entry: FactoryAuditEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await appendFile(this.path, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(this.path, 0o600);
  }
}

export interface FactoryToolContext {
  principal: FactoryPrincipal;
  requestId: string;
  tool: FactoryToolName;
}

export type FactoryToolHandler = (input: unknown, context: FactoryToolContext) => Promise<unknown>;

function projectIdFromInput(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const record = input as Record<string, unknown>;
  if (typeof record.projectId === "string" && record.projectId) return record.projectId;
  const project = record.project;
  if (project && typeof project === "object" && typeof (project as Record<string, unknown>).id === "string") {
    return (project as Record<string, unknown>).id as string;
  }
  const target = record.target;
  if (target && typeof target === "object" && typeof (target as Record<string, unknown>).projectId === "string") {
    return (target as Record<string, unknown>).projectId as string;
  }
  const manifest = record.manifest;
  if (manifest && typeof manifest === "object") {
    const nestedProject = (manifest as Record<string, unknown>).project;
    if (nestedProject && typeof nestedProject === "object" && typeof (nestedProject as Record<string, unknown>).id === "string") {
      return (nestedProject as Record<string, unknown>).id as string;
    }
  }
  return undefined;
}

function requestId(value?: string): string {
  if (value && /^[a-zA-Z0-9._:-]{8,128}$/.test(value)) return value;
  return `sbf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Transport-neutral agent boundary. MCP, HTTP or CLI adapters call invoke();
 * handlers remain private service wiring. The facade never logs tool input or
 * output, so SecretRefs and accidental handler data cannot leak into audit logs.
 */
export class FactoryAgentApi {
  readonly authorization: FactoryAuthorizationPolicy;
  readonly audit: FactoryAuditLog;
  readonly handlers: Readonly<Partial<Record<FactoryToolName, FactoryToolHandler>>>;
  readonly now: () => Date;

  constructor(options: {
    authorization: FactoryAuthorizationPolicy;
    audit: FactoryAuditLog;
    handlers: Readonly<Partial<Record<FactoryToolName, FactoryToolHandler>>>;
    now?: () => Date;
  }) {
    this.authorization = options.authorization;
    this.audit = options.audit;
    this.handlers = options.handlers;
    this.now = options.now ?? (() => new Date());
  }

  definitions(): readonly FactoryToolDefinition[] {
    return FACTORY_TOOL_DEFINITIONS;
  }

  async invoke(input: {
    principal: FactoryPrincipal;
    tool: FactoryToolName;
    arguments?: unknown;
    requestId?: string;
  }): Promise<unknown> {
    const definition = DEFINITION_BY_NAME.get(input.tool);
    if (!definition) throw new Error(`unknown Factory tool: ${input.tool}`);
    const id = requestId(input.requestId);
    const projectId = projectIdFromInput(input.arguments);
    const base = {
      version: 1 as const,
      timestamp: this.now().toISOString(),
      requestId: id,
      principalId: input.principal.id,
      tool: input.tool,
      ...(projectId ? { projectId } : {}),
      mutating: definition.mutating,
      destructive: definition.destructive,
    };

    try {
      await this.authorization.assertAllowed(input.principal, definition.permission, projectId);
    } catch {
      await this.audit.append({ ...base, outcome: "denied", errorCode: "NOT_AUTHORIZED" });
      throw new Error(`Factory authorization denied for ${input.tool}`);
    }

    const handler = this.handlers[input.tool];
    if (!handler) {
      await this.audit.append({ ...base, outcome: "failed", errorCode: "TOOL_NOT_CONFIGURED" });
      throw new Error(`Factory tool is not configured: ${input.tool}`);
    }

    try {
      const result = await handler(input.arguments, { principal: input.principal, requestId: id, tool: input.tool });
      await this.audit.append({ ...base, outcome: "success" });
      return result;
    } catch {
      await this.audit.append({ ...base, outcome: "failed", errorCode: "HANDLER_ERROR" });
      throw new Error(`Factory tool execution failed: ${input.tool}`);
    }
  }
}
