import assert from "node:assert/strict";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  FactoryAgentApi,
  SecretStoreBearerAuthenticator,
  StaticRoleAuthorizationPolicy,
  createFactoryMcpHttpHandler,
  type FactoryAuditEntry,
  type FactoryAuditLog,
  type SecretRef,
  type SecretStore,
} from "../src/index.ts";

class MemorySecretStore implements SecretStore {
  readonly name = "memory";
  readonly values = new Map<string, string>();
  async put(key: string, value: string): Promise<SecretRef> { this.values.set(key, value); return { store: this.name, key }; }
  async get(ref: SecretRef): Promise<string> {
    const value = this.values.get(ref.key);
    if (value === undefined) throw new Error(`missing secret ${ref.key}`);
    return value;
  }
  async has(key: string): Promise<boolean> { return this.values.has(key); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

class MemoryAudit implements FactoryAuditLog {
  readonly entries: FactoryAuditEntry[] = [];
  async append(entry: FactoryAuditEntry): Promise<void> { this.entries.push(entry); }
}

async function fixture() {
  const secrets = new MemorySecretStore();
  const token = await secrets.put("mcp/viewer-token", "test-factory-mcp-token");
  const audit = new MemoryAudit();
  const api = new FactoryAgentApi({
    authorization: new StaticRoleAuthorizationPolicy(),
    audit,
    handlers: {
      "factory.project.list": async () => [{ id: "alpha-app", state: "HEALTHY", secretKeyConfigured: true }],
      "factory.health.check": async (input) => ({ projectId: (input as { projectId: string }).projectId, healthy: true }),
    },
  });
  const handler = createFactoryMcpHttpHandler({
    api,
    authenticator: new SecretStoreBearerAuthenticator({
      secretStore: secrets,
      bindings: [{ principal: { id: "chatgpt-viewer", roles: ["viewer"] }, token }],
    }),
    allowedHosts: ["factory.example.invalid"],
    allowedOrigins: ["https://chatgpt.com"],
  });
  return { handler, audit };
}

function request(url = "https://factory.example.invalid/mcp", headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      host: "factory.example.invalid",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover", params: {} }),
  });
}

test("MCP transport rejects missing bearer auth before protocol handling", async () => {
  const { handler } = await fixture();
  const response = await handler.fetch(request());
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") ?? "", /Bearer/);
  assert.match(await response.text(), /invalid_token/);
});

test("MCP transport rejects wrong Host and unapproved browser Origin", async () => {
  const { handler } = await fixture();
  const wrongHost = request("https://evil.example.invalid/mcp", {
    host: "evil.example.invalid",
    authorization: "Bearer test-factory-mcp-token",
  });
  assert.equal((await handler.fetch(wrongHost)).status, 403);

  const wrongOrigin = request(undefined, {
    authorization: "Bearer test-factory-mcp-token",
    origin: "https://evil.example.invalid",
  });
  assert.equal((await handler.fetch(wrongOrigin)).status, 403);
});

test("real MCP v2 client discovers only configured tools and calls through FactoryAgentApi", async () => {
  const { handler, audit } = await fixture();
  const transport = new StreamableHTTPClientTransport(new URL("https://factory.example.invalid/mcp"), {
    fetch: async (input, init) => {
      const baseHeaders = input instanceof Request ? input.headers : undefined;
      const headers = new Headers(baseHeaders);
      for (const [key, value] of new Headers(init?.headers).entries()) headers.set(key, value);
      headers.set("host", "factory.example.invalid");
      headers.set("authorization", "Bearer test-factory-mcp-token");
      const outgoing = new Request(input, { ...init, headers });
      return handler.fetch(outgoing);
    },
  });
  const client = new Client(
    { name: "factory-mcp-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["factory.health.check", "factory.project.list"]);
    const listTool = tools.tools.find((tool) => tool.name === "factory.project.list");
    assert.equal(listTool?.annotations?.readOnlyHint, true);
    assert.equal(listTool?.annotations?.destructiveHint, false);

    const result = await client.callTool({ name: "factory.project.list", arguments: {} });
    assert.equal(result.isError, undefined);
    const structured = result.structuredContent as { result?: Array<{ id: string }> } | undefined;
    assert.equal(structured?.result?.[0]?.id, "alpha-app");
    assert.equal(audit.entries.at(-1)?.principalId, "chatgpt-viewer");
    assert.equal(audit.entries.at(-1)?.tool, "factory.project.list");
  } finally {
    await client.close();
    await handler.close();
  }
});

test("MCP transport returns 404 outside the configured endpoint and 503 after close", async () => {
  const { handler } = await fixture();
  const outside = await handler.fetch(request("https://factory.example.invalid/not-mcp", {
    authorization: "Bearer test-factory-mcp-token",
  }));
  assert.equal(outside.status, 404);
  await handler.close();
  const closed = await handler.fetch(request(undefined, { authorization: "Bearer test-factory-mcp-token" }));
  assert.equal(closed.status, 503);
});
