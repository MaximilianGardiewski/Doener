import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FACTORY_TOOL_DEFINITIONS,
  FactoryAgentApi,
  FileFactoryAuditLog,
  StaticRoleAuthorizationPolicy,
  type FactoryAuditEntry,
  type FactoryAuditLog,
} from "../src/index.ts";

class MemoryAuditLog implements FactoryAuditLog {
  readonly entries: FactoryAuditEntry[] = [];
  async append(entry: FactoryAuditEntry): Promise<void> { this.entries.push(entry); }
}

test("agent API authorizes per tool and extracts project ID without logging arguments", async () => {
  const audit = new MemoryAuditLog();
  let called = 0;
  const api = new FactoryAgentApi({
    authorization: new StaticRoleAuthorizationPolicy(),
    audit,
    handlers: {
      "factory.project.get": async (input) => {
        called += 1;
        return { projectId: (input as { projectId: string }).projectId, secretKeyConfigured: true };
      },
    },
    now: () => new Date("2026-08-26T04:45:00.000Z"),
  });

  const result = await api.invoke({
    principal: { id: "chatgpt-session", roles: ["viewer"] },
    tool: "factory.project.get",
    arguments: { projectId: "safe-app", accidentalSecret: "must-never-enter-audit" },
    requestId: "request-12345678",
  }) as { projectId: string };
  assert.equal(result.projectId, "safe-app");
  assert.equal(called, 1);
  assert.deepEqual(audit.entries, [{
    version: 1,
    timestamp: "2026-08-26T04:45:00.000Z",
    requestId: "request-12345678",
    principalId: "chatgpt-session",
    tool: "factory.project.get",
    projectId: "safe-app",
    mutating: false,
    destructive: false,
    outcome: "success",
  }]);
  assert.equal(JSON.stringify(audit.entries).includes("must-never-enter-audit"), false);
});

test("agent API denies unauthorized mutation before invoking the handler", async () => {
  const audit = new MemoryAuditLog();
  let called = false;
  const api = new FactoryAgentApi({
    authorization: new StaticRoleAuthorizationPolicy(),
    audit,
    handlers: {
      "factory.backup.create": async () => { called = true; return {}; },
    },
  });
  await assert.rejects(() => api.invoke({
    principal: { id: "readonly-agent", roles: ["viewer"] },
    tool: "factory.backup.create",
    arguments: { projectId: "prod-app" },
    requestId: "request-denied-001",
  }), /authorization denied/);
  assert.equal(called, false);
  assert.equal(audit.entries[0]?.outcome, "denied");
  assert.equal(audit.entries[0]?.errorCode, "NOT_AUTHORIZED");
});

test("handler errors are flattened so secret-bearing internal errors do not reach agent or audit", async () => {
  const audit = new MemoryAuditLog();
  const api = new FactoryAgentApi({
    authorization: new StaticRoleAuthorizationPolicy(),
    audit,
    handlers: {
      "factory.migrations.apply": async () => { throw new Error("postgres password=extremely-secret-value"); },
    },
  });
  await assert.rejects(() => api.invoke({
    principal: { id: "deploy-agent", roles: ["operator"] },
    tool: "factory.migrations.apply",
    arguments: { projectId: "prod-app" },
    requestId: "request-failed-001",
  }), (error: Error) => {
    assert.match(error.message, /tool execution failed/);
    assert.equal(error.message.includes("extremely-secret-value"), false);
    return true;
  });
  assert.equal(JSON.stringify(audit.entries).includes("extremely-secret-value"), false);
  assert.equal(audit.entries[0]?.errorCode, "HANDLER_ERROR");
});

test("destructive tools are explicitly marked for transport/UI approval handling", () => {
  const destructive = FACTORY_TOOL_DEFINITIONS.filter((tool) => tool.destructive).map((tool) => tool.name).sort();
  assert.deepEqual(destructive, ["factory.project.destroy", "factory.restore.apply"]);
  assert.ok(FACTORY_TOOL_DEFINITIONS.find((tool) => tool.name === "factory.pg17.apply")?.mutating);
});

test("file audit log is JSONL mode 0600 and contains only supplied audit metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "sbf-audit-"));
  const path = join(root, "audit", "factory.jsonl");
  try {
    const log = new FileFactoryAuditLog(path);
    await log.append({
      version: 1,
      timestamp: "2026-08-26T04:46:00.000Z",
      requestId: "request-audit-001",
      principalId: "admin-agent",
      tool: "factory.health.check",
      projectId: "prod-app",
      mutating: false,
      destructive: false,
      outcome: "success",
    });
    const raw = await readFile(path, "utf8");
    assert.match(raw, /factory\.health\.check/);
    assert.equal(raw.trim().split("\n").length, 1);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
