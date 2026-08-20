#!/usr/bin/env node
/*
 * Smoke-tests the running ChatGPT <-> Gemini Notebook bridge over its real
 * Streamable HTTP endpoint: health, MCP initialize, tools/list, and -- most
 * importantly -- that the advertised tool set is exactly the allowlist the
 * start script configured.
 *
 * Deliberately Node rather than PowerShell: the allowlist is the security
 * boundary, so its check has to be runnable and testable everywhere, not only
 * on the one Windows box that happens to host the bridge.
 *
 * Usage:
 *   node scripts/check-chatgpt-notebook-mcp.mjs [--url http://127.0.0.1:8000/mcp] [--mode readonly|query]
 */

const READONLY_TOOLS = [
  "server_info",
  "notebook_list",
  "notebook_get",
  "notebook_describe",
  "source_describe",
  "source_get_content",
];

const QUERY_EXTRA_TOOLS = [
  "notebook_query",
  "notebook_query_start",
  "notebook_query_status",
  "chat_list",
  "chat_get",
  "chat_export",
];

// Same pattern as tests/chatgpt-notebook-mcp-allowlist.test.mjs: catches an
// upstream tool that nobody thought to denylist.
const MUTATING = /(delete|remove|destroy|create|add|update|edit|write|upload|rename|move|share|invite|publish|import|generate|studio|sync|switch|logout|login)/i;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const mcpUrl = arg("url", process.env.MCP_SERVER_URL || "http://127.0.0.1:8000/mcp");
const mode = arg("mode", "readonly");
const healthUrl = new URL("/health", mcpUrl).toString();
const expected = mode === "query" ? [...READONLY_TOOLS, ...QUERY_EXTRA_TOOLS] : READONLY_TOOLS;

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

/** Streamable HTTP may answer a POST as plain JSON or as an SSE stream. */
async function readRpc(response) {
  const body = await response.text();
  const type = response.headers.get("content-type") || "";
  if (type.includes("text/event-stream")) {
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload) return JSON.parse(payload);
    }
    throw new Error("event-stream carried no data frame");
  }
  return JSON.parse(body);
}

let sessionId = null;
async function rpc(method, params, { notification = false } = {}) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const body = notification
    ? { jsonrpc: "2.0", method, params }
    : { jsonrpc: "2.0", id: Date.now(), method, params };

  const response = await fetch(mcpUrl, { method: "POST", headers, body: JSON.stringify(body) });
  const captured = response.headers.get("mcp-session-id");
  if (captured) sessionId = captured;
  if (notification) return null;
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`);
  const rpcResponse = await readRpc(response);
  if (rpcResponse.error) throw new Error(`${method}: ${rpcResponse.error.message ?? JSON.stringify(rpcResponse.error)}`);
  return rpcResponse.result;
}

console.log(`Checking ChatGPT Gemini Notebook bridge`);
console.log(`  MCP:    ${mcpUrl}`);
console.log(`  Health: ${healthUrl}`);
console.log(`  Mode:   ${mode}\n`);

try {
  const health = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  record("health endpoint responds", health.ok, `HTTP ${health.status}`);
} catch (error) {
  record("health endpoint responds", false, error.message);
}

let serverName = "";
try {
  const initialized = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "doener-bridge-check", version: "1.0.0" },
  });
  serverName = initialized?.serverInfo?.name ?? "unknown";
  record("MCP initialize", true, `server: ${serverName}`);
  await rpc("notifications/initialized", {}, { notification: true });
} catch (error) {
  record("MCP initialize", false, error.message);
}

let advertised = null;
try {
  const list = await rpc("tools/list", {});
  advertised = (list?.tools ?? []).map((tool) => tool.name).sort();
  record("tools/list", true, `${advertised.length} tool(s)`);
} catch (error) {
  record("tools/list", false, error.message);
}

if (advertised) {
  const wanted = expected.slice().sort();
  const unexpected = advertised.filter((tool) => !wanted.includes(tool));
  const missing = wanted.filter((tool) => !advertised.includes(tool));

  record(
    "no tool beyond the allowlist is exposed",
    unexpected.length === 0,
    unexpected.length ? `UNEXPECTED: ${unexpected.join(", ")}` : "",
  );
  record(
    "every allowlisted tool is present",
    missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : "",
  );

  const mutating = advertised.filter((tool) => MUTATING.test(tool));
  record(
    "no mutating tool reaches ChatGPT",
    mutating.length === 0,
    mutating.length ? `MUTATING: ${mutating.join(", ")}` : "",
  );
  console.log(`\n  exposed: ${advertised.join(", ")}`);
}

/*
 * The upstream gating docstring says "no tool is unregistered, only hidden", so
 * tools/list being clean does not prove a hidden tool cannot be invoked. That
 * claim is not verifiable from the source alone, so probe it instead.
 *
 * source_list_drive is chosen deliberately: it is hidden by our allowlist, and
 * it is read-only, so the probe cannot damage anything whichever way it goes.
 * Never probe with a destructive tool.
 */
if (advertised) {
  const HIDDEN_READONLY_PROBE = "source_list_drive";
  try {
    await rpc("tools/call", { name: HIDDEN_READONLY_PROBE, arguments: {} });
    record(
      "hidden tools cannot be invoked",
      false,
      `${HIDDEN_READONLY_PROBE} is hidden from tools/list but still executed — the allowlist only hides, it does not block`,
    );
  } catch (error) {
    // An error is the expected, safe outcome. Anything that reads as
    // unknown/disabled/not-found means the server refused to dispatch.
    const refused = /unknown|not found|not_found|disabled|no such tool|invalid|method not found/i.test(error.message);
    record(
      "hidden tools cannot be invoked",
      refused,
      refused ? `${HIDDEN_READONLY_PROBE} refused: ${error.message}` : `unclear refusal: ${error.message}`,
    );
  }
}

const failed = results.filter((result) => !result.ok);
console.log("");
if (failed.length) {
  console.error(`${failed.length} of ${results.length} checks FAILED.`);
  if (!advertised) {
    console.error("Is the bridge running?  npm run research:chatgpt:bg");
  }
  process.exit(1);
}
console.log(`All ${results.length} checks passed. Bridge is safe to expose through the tunnel.`);
