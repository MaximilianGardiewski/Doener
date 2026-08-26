import { createHash, timingSafeEqual } from "node:crypto";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  FACTORY_TOOL_DEFINITIONS,
  type FactoryAgentApi,
  type FactoryPrincipal,
  type FactoryToolName,
} from "./agent-api.ts";
import type { SecretRef, SecretStore } from "./secrets.ts";
import { FACTORY_API_VERSION } from "./types.ts";

const projectIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/);
const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const profileSchema = z.enum(["minimal", "webapp", "realtime", "full", "production-critical"]);
const environmentSchema = z.enum(["development", "staging", "production"]);
const serviceSchema = z.enum(["database", "auth", "rest", "gateway", "storage", "realtime", "functions", "studio", "analytics"]);
const smtpSchema = z.object({
  adminEmail: z.string().email(),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  senderName: z.string().min(1),
}).strict();

const manifestSchema = z.object({
  apiVersion: z.literal(FACTORY_API_VERSION),
  project: z.object({
    id: projectIdSchema,
    environment: environmentSchema,
    displayName: z.string().min(1).optional(),
  }).strict(),
  profile: profileSchema,
  supabase: z.object({
    release: z.string().regex(/^self-hosted\/v\d+\.\d+\.\d+$/).optional(),
    upstreamCommit: gitShaSchema.optional(),
    postgresMajor: z.union([z.literal(15), z.literal(17)]).optional(),
  }).strict().optional(),
  features: z.object({
    auth: z.boolean().optional(),
    rest: z.boolean().optional(),
    storage: z.boolean().optional(),
    realtime: z.boolean().optional(),
    functions: z.boolean().optional(),
    studio: z.enum(["disabled", "internal"]).optional(),
    analytics: z.boolean().optional(),
  }).strict().optional(),
  storage: z.object({
    backend: z.enum(["file", "s3"]).optional(),
    bucketPrefix: z.string().min(1).optional(),
    region: z.string().min(1).optional(),
  }).strict().optional(),
  auth: z.object({
    signupEnabled: z.boolean().optional(),
    anonymousUsers: z.boolean().optional(),
    jwtExpirySeconds: z.number().int().positive().max(604800).optional(),
    email: z.object({ enabled: z.boolean().optional(), autoConfirm: z.boolean().optional(), smtp: smtpSchema.optional() }).strict().optional(),
    phone: z.object({ enabled: z.boolean().optional(), autoConfirm: z.boolean().optional() }).strict().optional(),
  }).strict().optional(),
  backup: z.object({
    logical: z.enum(["off", "daily", "hourly"]).optional(),
    pitr: z.boolean().optional(),
    storageReplication: z.boolean().optional(),
    restoreDrill: z.enum(["off", "weekly", "monthly"]).optional(),
  }).strict().optional(),
  security: z.object({
    rlsRequired: z.boolean().optional(),
    databasePublic: z.boolean().optional(),
    studioPublic: z.boolean().optional(),
    requireHttps: z.boolean().optional(),
    allowLegacyApiKeys: z.boolean().optional(),
  }).strict().optional(),
}).strict();

const migrationSourceSchema = z.object({
  workdir: z.string().startsWith("/"),
  expectedGitCommit: gitShaSchema.optional(),
  allowDirtyTrackedFiles: z.boolean().optional(),
}).strict();

const attachedRuntimeSchema = z.object({
  projectId: projectIdSchema,
  publicUrl: z.string().url(),
  release: z.string().regex(/^self-hosted\/v\d+\.\d+\.\d+$/),
  upstreamCommit: gitShaSchema,
  postgresMajor: z.union([z.literal(15), z.literal(17)]),
  services: z.array(serviceSchema).min(1),
  allowHttp: z.boolean().optional(),
}).strict();

const schemas: Partial<Record<FactoryToolName, z.ZodType<Record<string, unknown>>>> = {
  "factory.repository.bootstrap": z.object({
    projectId: projectIdSchema,
    environment: environmentSchema,
    displayName: z.string().min(1).optional(),
    profile: profileSchema.optional(),
  }).strict(),
  "factory.repository.validate": z.object({ projectJson: z.string().min(2) }).strict(),
  "factory.repository.plan": z.object({ projectJson: z.string().min(2) }).strict(),
  "factory.runtime.attach": attachedRuntimeSchema,
  "factory.runtime.get": z.object({ projectId: projectIdSchema }).strict(),
  "factory.runtime.list": z.object({}).strict(),
  "factory.runtime.detach": z.object({ projectId: projectIdSchema }).strict(),
  "factory.project.plan": z.object({ manifest: manifestSchema }).strict(),
  "factory.project.create": z.object({ manifest: manifestSchema, approvedOperationIds: z.array(z.string().min(1)).optional() }).strict(),
  "factory.project.get": z.object({ projectId: projectIdSchema }).strict(),
  "factory.project.list": z.object({}).strict(),
  "factory.project.reconcile": z.object({ manifest: manifestSchema, approvedOperationIds: z.array(z.string().min(1)).optional() }).strict(),
  "factory.project.destroy": z.object({ projectId: projectIdSchema, approval: z.string().min(1) }).strict(),
  "factory.migrations.plan": z.object({ projectId: projectIdSchema, source: migrationSourceSchema }).strict(),
  "factory.migrations.apply": z.object({ projectId: projectIdSchema, source: migrationSourceSchema, approval: z.literal("APPLY_MIGRATIONS") }).strict(),
  "factory.backup.create": z.object({ projectId: projectIdSchema }).strict(),
  "factory.backup.verify": z.object({ projectId: projectIdSchema, backupId: z.string().min(1) }).strict(),
  "factory.restore.drill": z.object({ projectId: projectIdSchema, backupId: z.string().min(1) }).strict(),
  "factory.restore.apply": z.object({ projectId: projectIdSchema, backupId: z.string().min(1), approval: z.string().min(1) }).strict(),
  "factory.keys.rotate": z.object({ projectId: projectIdSchema, approval: z.string().min(1) }).strict(),
  "factory.upgrade.plan": z.object({ projectId: projectIdSchema, target: manifestSchema }).strict(),
  "factory.upgrade.apply": z.object({ projectId: projectIdSchema, target: manifestSchema, approval: z.literal("APPLY_SUPABASE_UPGRADE") }).strict(),
  "factory.pg17.plan": z.object({ projectId: projectIdSchema, target: manifestSchema }).strict(),
  "factory.pg17.apply": z.object({ projectId: projectIdSchema, target: manifestSchema, approval: z.literal("APPLY_POSTGRES_17_UPGRADE") }).strict(),
  "factory.health.check": z.object({ projectId: projectIdSchema }).strict(),
  "factory.audit.get": z.object({ projectId: projectIdSchema.optional(), limit: z.number().int().min(1).max(1000).optional() }).strict(),
};

export type FactoryMcpAuthenticationResult =
  | { principal: FactoryPrincipal }
  | { response: Response };

export interface FactoryMcpAuthenticator {
  authenticate(request: Request): Promise<FactoryMcpAuthenticationResult>;
}

export interface SecretStoreBearerBinding {
  principal: FactoryPrincipal;
  token: SecretRef;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Private/internal authentication option for ChatGPT/Codex or another trusted
 * client that can attach an Authorization header. Tokens stay in SecretStore;
 * comparison uses fixed-length SHA-256 digests and timingSafeEqual.
 *
 * Public/interactive deployments can replace this authenticator with an OAuth
 * resource-server adapter without changing the MCP tool or FactoryAgentApi layer.
 */
export class SecretStoreBearerAuthenticator implements FactoryMcpAuthenticator {
  readonly secretStore: SecretStore;
  readonly bindings: readonly SecretStoreBearerBinding[];
  readonly realm: string;

  constructor(options: { secretStore: SecretStore; bindings: readonly SecretStoreBearerBinding[]; realm?: string }) {
    if (options.bindings.length === 0) throw new Error("at least one Factory MCP bearer binding is required");
    this.secretStore = options.secretStore;
    this.bindings = options.bindings;
    this.realm = options.realm ?? "supabase-factory";
  }

  async authenticate(request: Request): Promise<FactoryMcpAuthenticationResult> {
    const header = request.headers.get("authorization") ?? "";
    const match = header.match(/^Bearer\s+([^\s]+)$/i);
    if (match) {
      const candidate = digest(match[1]);
      for (const binding of this.bindings) {
        const expected = digest(await this.secretStore.get(binding.token));
        if (timingSafeEqual(candidate, expected)) return { principal: binding.principal };
      }
    }
    return {
      response: new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": `Bearer realm="${this.realm}", error="invalid_token"`,
        },
      }),
    };
  }
}

function safeStructuredContent(value: unknown): Record<string, unknown> {
  const normalized = value === undefined ? null : JSON.parse(JSON.stringify(value)) as unknown;
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) return normalized as Record<string, unknown>;
  return { result: normalized };
}

function toolSchema(name: FactoryToolName): z.ZodType<Record<string, unknown>> {
  return schemas[name] ?? z.record(z.string(), z.unknown());
}

function buildServer(api: FactoryAgentApi, principal: FactoryPrincipal): McpServer {
  const server = new McpServer(
    { name: "supabase-factory", version: "0.1.0" },
    {
      instructions: "Coordinate GitHub-authored, isolated self-hosted Supabase projects. Prefer factory.repository.bootstrap/validate/plan for repository workflows. Read/plan before mutation. Never request or expose secret values. Runtime attach/detach changes only Factory's development inventory; deployment infrastructure remains adapter-owned. Destructive lifecycle operations remain approval-gated.",
    },
  );

  for (const definition of FACTORY_TOOL_DEFINITIONS) {
    if (!api.handlers[definition.name]) continue;
    server.registerTool(
      definition.name,
      {
        title: definition.name,
        description: definition.description,
        inputSchema: toolSchema(definition.name),
        annotations: {
          readOnlyHint: !definition.mutating,
          destructiveHint: definition.destructive,
          idempotentHint: !definition.mutating,
          openWorldHint: false,
        },
      },
      async (args, ctx) => {
        try {
          const result = await api.invoke({
            principal,
            tool: definition.name,
            arguments: args,
            requestId: String(ctx.mcpReq.id),
          });
          const structuredContent = safeStructuredContent(result);
          return {
            content: [{ type: "text", text: JSON.stringify(structuredContent) }],
            structuredContent,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Factory tool call failed";
          return { content: [{ type: "text", text: message }], isError: true };
        }
      },
    );
  }
  return server;
}

function hostOnly(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end >= 0 ? trimmed.slice(0, end + 1) : undefined;
  }
  return trimmed.split(":", 1)[0];
}

function normalizedSet(values: readonly string[] = []): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export interface FactoryMcpHttpHandler {
  fetch(request: Request): Promise<Response>;
  close(): Promise<void>;
}

/**
 * MCP 2026-07-28-compatible stateless HTTP adapter. The actual SDK handler is
 * built after authentication so each request is closed over exactly one
 * FactoryPrincipal. `responseMode: json` keeps the adapter stateless and avoids
 * keeping authorization state inside long-lived SSE sessions.
 */
export function createFactoryMcpHttpHandler(options: {
  api: FactoryAgentApi;
  authenticator: FactoryMcpAuthenticator;
  path?: string;
  allowedHosts: readonly string[];
  allowedOrigins?: readonly string[];
}): FactoryMcpHttpHandler {
  const path = options.path ?? "/mcp";
  if (!path.startsWith("/")) throw new Error("Factory MCP path must start with '/'");
  const allowedHosts = normalizedSet(options.allowedHosts);
  const allowedOrigins = normalizedSet(options.allowedOrigins);
  if (allowedHosts.size === 0) throw new Error("Factory MCP requires at least one allowed Host");
  let closed = false;

  return {
    async fetch(request: Request): Promise<Response> {
      if (closed) return new Response("Factory MCP handler is closed", { status: 503 });
      const url = new URL(request.url);
      if (url.pathname !== path) return new Response("Not Found", { status: 404 });

      const host = hostOnly(request.headers.get("host"));
      if (!host || !allowedHosts.has(host)) return new Response("Forbidden Host", { status: 403 });

      const origin = request.headers.get("origin");
      if (origin && allowedOrigins.size > 0) {
        let normalizedOrigin: string;
        try { normalizedOrigin = new URL(origin).origin.toLowerCase(); } catch { return new Response("Forbidden Origin", { status: 403 }); }
        if (!allowedOrigins.has(normalizedOrigin)) return new Response("Forbidden Origin", { status: 403 });
      } else if (origin && allowedOrigins.size === 0) {
        return new Response("Forbidden Origin", { status: 403 });
      }

      const auth = await options.authenticator.authenticate(request);
      if ("response" in auth) return auth.response;

      const handler = createMcpHandler(() => buildServer(options.api, auth.principal), {
        responseMode: "json",
        legacy: "stateless",
      });
      try {
        return await handler.fetch(request);
      } finally {
        await handler.close();
      }
    },
    async close(): Promise<void> { closed = true; },
  };
}
