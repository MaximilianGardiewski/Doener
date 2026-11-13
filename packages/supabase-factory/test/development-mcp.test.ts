import assert from "node:assert/strict";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  SecretStoreBearerAuthenticator,
  createDevelopmentFactory,
} from "../src/index.ts";

test("real MCP v2 client bootstraps, checks and synchronizes a GitHub-authored Factory repository", async () => {
  const factory = createDevelopmentFactory();
  const token = await factory.secretStore.put("mcp/planner-token", "development-mcp-repository-token");
  const handler = factory.createMcpHandler({
    authenticator: new SecretStoreBearerAuthenticator({
      secretStore: factory.secretStore,
      bindings: [{ principal: { id: "chatgpt-planner", roles: ["planner"] }, token }],
    }),
    allowedHosts: ["factory.example.invalid"],
    allowedOrigins: ["https://chatgpt.com"],
  });

  const transport = new StreamableHTTPClientTransport(new URL("https://factory.example.invalid/mcp"), {
    fetch: async (input, init) => {
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      for (const [key, value] of new Headers(init?.headers).entries()) headers.set(key, value);
      headers.set("host", "factory.example.invalid");
      headers.set("authorization", "Bearer development-mcp-repository-token");
      return handler.fetch(new Request(input, { ...init, headers }));
    },
  });
  const client = new Client(
    { name: "chatgpt-factory-development-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = new Set(tools.tools.map((tool) => tool.name));
    for (const expected of [
      "factory.repository.bootstrap",
      "factory.repository.validate",
      "factory.repository.status",
      "factory.repository.sync",
      "factory.repository.plan",
    ]) assert.equal(names.has(expected), true, `missing MCP tool ${expected}`);

    const bootstrapCall = await client.callTool({
      name: "factory.repository.bootstrap",
      arguments: {
        projectId: "mcp-repo-app",
        environment: "development",
        displayName: "MCP Repo App",
      },
    });
    assert.equal(bootstrapCall.isError, undefined);
    const bootstrap = bootstrapCall.structuredContent as {
      projectJson: string;
      lockJson: string;
      deploymentTargetSelected: boolean;
    };
    assert.equal(bootstrap.deploymentTargetSelected, false);
    assert.match(bootstrap.projectJson, /mcp-repo-app/);

    const statusCall = await client.callTool({
      name: "factory.repository.status",
      arguments: { projectJson: bootstrap.projectJson },
    });
    assert.equal(statusCall.isError, undefined);
    const status = statusCall.structuredContent as {
      needsSync: boolean;
      writePaths: string[];
      deploymentTargetSelected: boolean;
    };
    assert.equal(status.needsSync, true);
    assert.deepEqual(status.writePaths, [".supabase-factory/lock.json"]);
    assert.equal(status.deploymentTargetSelected, false);

    const syncCall = await client.callTool({
      name: "factory.repository.sync",
      arguments: { projectJson: bootstrap.projectJson },
    });
    assert.equal(syncCall.isError, undefined);
    const sync = syncCall.structuredContent as {
      writes: Array<{ path: string; content: string }>;
      secretsBelongInRepository: boolean;
    };
    assert.equal(sync.secretsBelongInRepository, false);
    assert.equal(sync.writes.length, 1);
    assert.equal(sync.writes[0]?.path, ".supabase-factory/lock.json");

    const noOpCall = await client.callTool({
      name: "factory.repository.sync",
      arguments: {
        projectJson: bootstrap.projectJson,
        lockJson: sync.writes[0]!.content,
      },
    });
    assert.equal(noOpCall.isError, undefined);
    const noOp = noOpCall.structuredContent as { writes: unknown[]; status: { needsSync: boolean } };
    assert.deepEqual(noOp.writes, []);
    assert.equal(noOp.status.needsSync, false);

    const serialized = JSON.stringify([bootstrapCall, statusCall, syncCall, noOpCall]);
    for (const forbidden of ["SUPABASE_ACCESS_TOKEN", "POSTGRES_PASSWORD", "sbp_"]) {
      assert.equal(serialized.includes(forbidden), false, `MCP response leaked ${forbidden}`);
    }
  } finally {
    await client.close();
    await handler.close();
  }
});
