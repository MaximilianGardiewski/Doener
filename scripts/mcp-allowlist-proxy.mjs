#!/usr/bin/env node
/*
 * Enforcing MCP proxy for the ChatGPT bridge.
 *
 * Why this exists: notebooklm-mcp-cli's NOTEBOOKLM_DISABLED_GROUPS /
 * NOTEBOOKLM_ENABLED_TOOLS gating only *hides* tools from tools/list. Its own
 * source says so -- "no tool is unregistered, only hidden" -- and a live run
 * confirmed it: source_list_drive was absent from tools/list and still executed
 * when called by name. Every destructive tool in the catalogue was therefore
 * reachable by anything that could speak to the endpoint.
 *
 * So the upstream gating is treated as a display filter, not a boundary, and the
 * boundary lives here. ChatGPT talks to this proxy; only this proxy talks to the
 * upstream MCP, on a port that is never tunnelled.
 *
 *   ChatGPT -> tunnel-client -> 127.0.0.1:8000/mcp  (this proxy, enforcing)
 *                                      |
 *                                      v
 *                              127.0.0.1:8001/mcp  (notebooklm-mcp, internal)
 *
 * Deny by default: a tools/call for anything outside the allowlist is rejected
 * here and never forwarded, so an upstream release that adds a tool cannot widen
 * what ChatGPT can do.
 */
import { createServer } from "node:http";
import { toolsFor, MUTATING_NAME } from "./lib/chatgpt-tool-allowlist.mjs";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const listenPort = Number(arg("listen-port", 8000));
const upstreamUrl = arg("upstream", "http://127.0.0.1:8001/mcp");
const mode = arg("mode", "readonly");
const allowed = new Set(toolsFor(mode));

// A tool that is allowlisted but reads as mutating is a configuration mistake,
// and starting anyway would put it in front of ChatGPT. Refuse to start.
for (const tool of allowed) {
  if (MUTATING_NAME.test(tool)) {
    console.error(`refusing to start: allowlisted tool "${tool}" looks mutating`);
    process.exit(2);
  }
}

const DENIED = { code: -32601, message: "Tool not available through this bridge" };

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(payload);
}

/** Streamable HTTP answers either as plain JSON or as an SSE frame. */
function parseRpc(text, contentType) {
  if ((contentType || "").includes("text/event-stream")) {
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload) return { message: JSON.parse(payload), sse: true };
      }
    }
    return { message: null, sse: true };
  }
  return { message: JSON.parse(text), sse: false };
}

function reframe(message, sse) {
  const json = JSON.stringify(message);
  return sse ? `event: message\ndata: ${json}\n\n` : json;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${listenPort}`);

  if (url.pathname === "/health") {
    // Report the boundary the operator cares about, not just liveness.
    return send(res, 200, { status: "ok", role: "allowlist-proxy", mode, allowed: [...allowed], upstream: upstreamUrl });
  }

  if (url.pathname !== "/mcp") return send(res, 404, { error: "not found" });

  // The server->client stream and session teardown carry no tool call.
  if (req.method === "GET" || req.method === "DELETE") {
    try {
      const upstream = await fetch(upstreamUrl, { method: req.method, headers: forwardHeaders(req) });
      const body = await upstream.text();
      res.writeHead(upstream.status, passthroughHeaders(upstream));
      return res.end(body);
    } catch (error) {
      return send(res, 502, { error: `upstream unreachable: ${error.message}` });
    }
  }

  if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });

  let raw = "";
  req.on("data", (chunk) => { raw += chunk; });
  req.on("end", async () => {
    let message;
    try { message = JSON.parse(raw); }
    catch { return send(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }

    // ---- the enforcement point -------------------------------------------
    if (message?.method === "tools/call") {
      const name = message?.params?.name;
      if (!allowed.has(name)) {
        console.warn(`[proxy] DENIED tools/call ${JSON.stringify(name)}`);
        return send(res, 200, { jsonrpc: "2.0", id: message.id ?? null, error: { ...DENIED, data: { tool: name, mode } } });
      }
    }

    try {
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...forwardHeaders(req) },
        body: raw,
      });
      const text = await upstream.text();
      const contentType = upstream.headers.get("content-type") || "";

      // Filter tools/list too: defence in depth, and it keeps the advertised
      // set identical to the enforced set even if upstream gating changes.
      if (message?.method === "tools/list") {
        const { message: parsed, sse } = parseRpc(text, contentType);
        if (parsed?.result?.tools) {
          const before = parsed.result.tools.length;
          parsed.result.tools = parsed.result.tools.filter((tool) => allowed.has(tool.name));
          if (parsed.result.tools.length !== before) {
            console.warn(`[proxy] filtered ${before - parsed.result.tools.length} tool(s) out of tools/list`);
          }
          res.writeHead(upstream.status, passthroughHeaders(upstream));
          return res.end(reframe(parsed, sse));
        }
      }

      res.writeHead(upstream.status, passthroughHeaders(upstream));
      res.end(text);
    } catch (error) {
      send(res, 502, { jsonrpc: "2.0", id: message?.id ?? null, error: { code: -32603, message: `upstream unreachable: ${error.message}` } });
    }
  });
});

function forwardHeaders(req) {
  const out = {};
  // Session correlation must survive the hop; nothing else needs to.
  for (const name of ["mcp-session-id", "mcp-protocol-version", "last-event-id", "accept"]) {
    if (req.headers[name]) out[name] = req.headers[name];
  }
  return out;
}

function passthroughHeaders(upstream) {
  const out = {};
  for (const name of ["content-type", "mcp-session-id", "cache-control"]) {
    const value = upstream.headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

// Loopback only. This process is the one the tunnel reaches, so it must never
// be bound anywhere else.
server.listen(listenPort, "127.0.0.1", () => {
  console.log(`MCP allowlist proxy listening on http://127.0.0.1:${listenPort}/mcp`);
  console.log(`  mode:     ${mode}`);
  console.log(`  allowed:  ${[...allowed].join(", ")}`);
  console.log(`  upstream: ${upstreamUrl}`);
  console.log(`  every other tools/call is denied and never forwarded.`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { server.close(() => process.exit(0)); });
}
