import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/*
 * The ChatGPT bridge hands a third party a live connection to our Gemini
 * Notebook account. The only thing standing between ChatGPT and a destructive
 * upstream tool is the allowlist in the start script, so it is worth asserting
 * rather than trusting.
 *
 * These tests read the script as text on purpose: they must hold without a
 * Windows host, without `notebooklm-mcp-cli` installed and without a Google
 * session, so they run anywhere `npm run test:schema` runs.
 */

const script = await readFile(
  new URL("../scripts/start-gemini-notebook-chatgpt-mcp.ps1", import.meta.url),
  "utf8",
);

/** Pulls a PowerShell array literal like `@( 'a', 'b' )` starting at a marker. */
function arrayAfter(marker) {
  const start = script.indexOf(marker);
  assert.notEqual(start, -1, `marker not found in start script: ${marker}`);
  const open = script.indexOf("@(", start);
  assert.notEqual(open, -1, `no array literal after: ${marker}`);
  const close = script.indexOf(")", open);
  assert.notEqual(close, -1, `unterminated array literal after: ${marker}`);
  return [...script.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

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

test("the default profile exposes exactly the read-only tools", () => {
  const allowed = arrayAfter("$AllowedTools = @(");
  assert.deepEqual(
    allowed.slice().sort(),
    READONLY_TOOLS.slice().sort(),
    "the readonly profile must not drift; add a tool here only deliberately",
  );
});

test("query mode adds only query and chat-read tools", () => {
  const extra = arrayAfter("if ($Mode -eq 'query')");
  assert.deepEqual(extra.slice().sort(), QUERY_EXTRA_TOOLS.slice().sort());
});

test("no exposed tool can mutate, delete or share anything", () => {
  /*
   * Pattern-based rather than a second hardcoded list: a future upstream tool
   * named e.g. `source_delete` must fail this even though nobody thought to
   * add it to a denylist. `notebook_query_start` is a read query, not a write,
   * so "start" is deliberately not a forbidden verb.
   */
  const forbidden = /(delete|remove|destroy|create|add|update|edit|write|upload|rename|move|share|invite|publish|import|generate|studio|sync|switch|logout|login)/i;
  const exposed = [...arrayAfter("$AllowedTools = @("), ...arrayAfter("if ($Mode -eq 'query')")];
  for (const tool of exposed) {
    assert.equal(forbidden.test(tool), false, `tool exposed to ChatGPT looks mutating: ${tool}`);
  }
});

test("the allowlist is fail-closed: every upstream group is disabled first", () => {
  const groups = arrayAfter("$env:NOTEBOOKLM_DISABLED_GROUPS = @(");
  /*
   * Exact set equality, not "contains". Upstream resolves a group name with
   * TOOL_GROUPS.get(group, set()), so a name that no longer exists disables
   * nothing and reports no error -- a rename upstream would silently reopen a
   * whole group. A stale entry here must therefore fail, not just a missing one.
   *
   * Verified against the extracted notebooklm-mcp-cli 0.9.13 wheel:
   * 14 groups covering all 43 registered tools. Re-diff this list on upgrade.
   */
  const UPSTREAM_GROUPS = [
    "notebooks_read", "notebooks_manage", "sources_read", "sources_manage",
    "chat", "query_multi", "organization", "automation", "notes",
    "auth", "server", "sharing", "research", "studio",
  ];
  assert.deepEqual(groups.slice().sort(), UPSTREAM_GROUPS.slice().sort());
  assert.ok(
    script.indexOf("NOTEBOOKLM_DISABLED_GROUPS") < script.indexOf("$AllowedTools = @("),
    "groups must be disabled before the allowlist is applied",
  );
});

test("the bridge stays on loopback", () => {
  assert.match(script, /'--host',\s*'127\.0\.0\.1'/, "the MCP must bind to loopback");
  /*
   * Checked against executable lines only. The script legitimately prints
   * "do not replace 127.0.0.1 with 0.0.0.0" as a warning, and asserting on the
   * raw file text would fail on that advice while proving nothing about the bind.
   */
  const executable = script
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line) && !/^\s*Write-Host\b/.test(line))
    .join("\n");
  assert.doesNotMatch(executable, /0\.0\.0\.0/, "the bridge must never bind to all interfaces");
  // Setting this upstream escape hatch here would defeat the loopback boundary.
  assert.doesNotMatch(
    script,
    /\$env:NOTEBOOKLM_ALLOW_EXTERNAL_BIND\s*=/,
    "the external-bind escape hatch must never be set by this script",
  );
});

test("the transport and endpoint ChatGPT relies on are pinned", () => {
  assert.match(script, /'--transport',\s*'http'/, "ChatGPT needs Streamable HTTP, not stdio");
  assert.match(script, /\$McpPath\s*=\s*'\/mcp'/);
  assert.match(script, /\$HealthUrl\s*=\s*"http:\/\/127\.0\.0\.1:\$Port\/health"/);
});

test("the script carries no secrets", () => {
  assert.doesNotMatch(script, /sk-[A-Za-z0-9]/, "no OpenAI key material in the repo");
  assert.doesNotMatch(script, /API_KEY\s*=\s*'[^']+'/, "no inline API key assignment");
});
