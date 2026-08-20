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

/*
 * Line endings are normalised on read. Git checks these files out with CRLF on
 * Windows, and a guard that searched for a string containing "\n" silently
 * matched nothing there -- the suite passed on Linux and failed on the machine
 * that actually runs the bridge.
 */
const read = async (relative) =>
  (await readFile(new URL(relative, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const script = await read("../scripts/start-gemini-notebook-chatgpt-mcp.ps1");

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

import { READONLY_TOOLS, QUERY_EXTRA_TOOLS, MUTATING_NAME } from "../scripts/lib/chatgpt-tool-allowlist.mjs";

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
  const forbidden = MUTATING_NAME;
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

/*
 * The tunnel scripts handle an OpenAI runtime API key. They cannot be executed
 * in CI (no Windows, no PowerShell), so their security properties are asserted
 * statically instead of trusted.
 */

const tunnelScript = await read("../scripts/start-chatgpt-notebook-tunnel.ps1");
const setupScript = await read("../scripts/setup-chatgpt-notebook-mcp.ps1");

test("the runtime API key is never captured or stored in the clear", () => {
  assert.match(tunnelScript, /Read-Host\s+'Runtime API key'\s+-AsSecureString/,
    "the key must be read as a SecureString, never as plain text");
  assert.match(tunnelScript, /ConvertFrom-SecureString\s+-SecureString\s+\$Secure\s*\|\s*Set-Content/,
    "the key must be persisted DPAPI-encrypted, bound to this user and machine");
  // The decrypted value may exist in memory but must never be written anywhere.
  assert.doesNotMatch(tunnelScript, /Set-Content[^\n]*\$PlainKey/, "the decrypted key must never be written to a file");
  assert.doesNotMatch(tunnelScript, /Write-Host[^\n]*\$PlainKey/, "the decrypted key must never be printed");
  assert.doesNotMatch(tunnelScript, /Out-File[^\n]*\$PlainKey/);
});

test("the key reaches tunnel-client through the environment, not the command line", () => {
  // A process argument is visible to every other process on the machine.
  assert.match(tunnelScript, /\$env:CONTROL_PLANE_API_KEY\s*=\s*\$PlainKey/);
  assert.doesNotMatch(tunnelScript, /ArgumentList[^\n]*(ApiKey|API_KEY|\$PlainKey)/i,
    "the key must not be passed as a process argument");
  assert.match(tunnelScript, /\$env:CONTROL_PLANE_API_KEY\s*=\s*\$null/,
    "the key must be cleared from the environment afterwards");
});

test("the tunnel scripts carry no key material and no admin key usage", () => {
  for (const [name, source] of [["tunnel", tunnelScript], ["setup", setupScript]]) {
    assert.doesNotMatch(source, /sk-[A-Za-z0-9_-]{8}/, `${name}: no key material in the repo`);
    assert.doesNotMatch(source, /tunnel_[0-9a-f]{32}/, `${name}: no real tunnel id committed`);
    assert.doesNotMatch(source, /\$env:OPENAI_ADMIN_KEY\s*=/,
      `${name}: an admin key must never be handed to the running daemon`);
  }
});

test("secrets live only under the gitignored cache", () => {
  assert.match(tunnelScript, /\$CacheDir\s*=\s*Join-Path\s+\$RepoRoot\s+'\.research-cache\/chatgpt-tunnel'/);
  // The setup refuses to store anything if that path is not actually ignored.
  assert.match(setupScript, /\.research-cache is NOT gitignored - refusing to store secrets there/);
});

test("the tunnel refuses to expose a bridge that failed its own checks", () => {
  assert.match(
    tunnelScript,
    /Refusing to expose it through the tunnel/,
    "a failing allowlist check must stop the tunnel from starting",
  );
  assert.ok(
    tunnelScript.indexOf("check-chatgpt-notebook-mcp.mjs") < tunnelScript.indexOf("Starting tunnel-client"),
    "the bridge must be verified before the tunnel is started, not after",
  );
});

test("a missing tunnel-client does not cascade into false bridge failures", () => {
  /*
   * Observed on a real run: tunnel-client was absent, which gated the bridge
   * start, which made the health check and the MCP check fail too -- three
   * reported problems for one actual cause, and two of them misleading.
   *
   * tunnel-client is needed to reach ChatGPT, not to run the bridge, so it must
   * not be marked as blocking.
   */
  const blocking = [...setupScript.matchAll(/Write-Fail\s+(?:"[^"]*"|'[^']*')\s+-BlocksBridge/g)]
    .map((match) => match[0]);
  assert.ok(blocking.length >= 5, "the genuine prerequisites must be marked -BlocksBridge");
  for (const marked of blocking) {
    assert.doesNotMatch(marked, /tunnel/i, `tunnel failures must not block the bridge: ${marked}`);
  }

  // The gate reads the blocker list, never the full failure list.
  assert.match(setupScript, /elseif \(\$Script:BridgeBlockers\.Count -gt 0\)/);
  assert.doesNotMatch(
    setupScript,
    /elseif \(\$Script:Failures\.Count -gt 0\) \{ Write-Warn 'skipped: earlier steps failed' \}/,
    "the bridge must not be gated on unrelated failures",
  );

  // A check that never ran must report as skipped, not as failed.
  const skipGuards = [...setupScript.matchAll(/if \(-not \$BridgeRunning\) \{ Write-Skip/g)];
  assert.equal(skipGuards.length, 2, "both the health and the MCP step must skip when the bridge is down");
});


/*
 * The enforcing proxy exists because upstream gating turned out to be cosmetic.
 * A live run against the real notebooklm-mcp showed source_list_drive hidden
 * from tools/list and still executing when called by name; a stub reproducing
 * that behaviour let 6 of 6 destructive calls through directly and 0 of 6
 * through the proxy.
 */
const proxy = await read("../scripts/mcp-allowlist-proxy.mjs");

test("the proxy denies by default and never forwards a denied call", () => {
  assert.match(proxy, /if \(message\?\.method === "tools\/call"\)/);
  assert.match(proxy, /if \(!allowed\.has\(name\)\)/, "the check must be membership in the allowlist, not a denylist");
  // The rejection has to return before the upstream fetch, not after it.
  const check = proxy.indexOf("if (!allowed.has(name))");
  const forward = proxy.search(/const upstream = await fetch\(upstreamUrl, \{\s*\n\s*method: "POST"/);
  assert.ok(check > -1, "the allowlist membership check must exist");
  assert.ok(forward > check, "a denied tools/call must return before anything is forwarded");
});

test("the proxy refuses to start with a mutating tool allowlisted", () => {
  assert.match(proxy, /if \(MUTATING_NAME\.test\(tool\)\)/);
  assert.match(proxy, /process\.exit\(2\)/, "a mutating allowlist entry must abort startup, not warn");
});

test("the proxy binds to loopback only", () => {
  assert.match(proxy, /server\.listen\(listenPort, "127\.0\.0\.1"/);
  const executable = proxy.split(/\r?\n/).filter((line) => !/^\s*\*/.test(line) && !/console\./.test(line)).join("\n");
  assert.doesNotMatch(executable, /0\.0\.0\.0/);
});

test("the upstream MCP is moved off the port the tunnel reaches", () => {
  // If both listened on the same port the proxy could be bypassed entirely.
  assert.match(script, /\$UpstreamPort = \$Port \+ 1/);
  assert.match(script, /'--port', \$UpstreamPort\.ToString\(\)/,
    "notebooklm-mcp must bind the internal port, never the tunnelled one");
  assert.match(script, /--listen-port', \$Port\.ToString\(\)/,
    "the proxy must own the port ChatGPT reaches");
});

test("both processes are stopped together", () => {
  assert.match(script, /\$ProxyPidFile/);
  assert.match(script, /File = \$ProxyPidFile; Name = 'allowlist proxy'/);
  assert.match(script, /File = \$PidFile; Name = 'upstream MCP'/);
});

test("the stored runtime key survives a write/read roundtrip", () => {
  /*
   * Observed on a real run: the key was accepted, stored, and then failed to
   * load with "The input string ' ' was not in a correct format". Set-Content
   * appends CRLF, Get-Content -Raw reads it back, and ConvertTo-SecureString
   * rejects DPAPI ciphertext with a trailing line break -- so the tunnel could
   * never start, on the very first run, right after asking for the secret.
   */
  assert.match(
    tunnelScript,
    /ConvertFrom-SecureString[^\n]*\|\s*Set-Content[^\n]*-NoNewline/,
    "the ciphertext must be written without a trailing newline",
  );
  assert.match(
    tunnelScript,
    /\$StoredKey = \(Get-Content \$KeyFile -Raw\)\.Trim\(\)/,
    "and trimmed on read, so a file from an earlier version still loads",
  );

  // A key that cannot be decrypted must say what to do, not surface a raw
  // .NET format error.
  assert.match(tunnelScript, /-Reconfigure to enter it again/);
  assert.match(tunnelScript, /catch \{\s*\n\s*throw \(?"The stored runtime key could not be decrypted/);
});

test("every strict-format file read is whitespace-tolerant", () => {
  /*
   * Guards the class, not just the one instance: any Get-Content -Raw whose
   * value is then parsed strictly (a PID, ciphertext) has to be trimmed. JSON
   * reads are exempt -- ConvertFrom-Json tolerates surrounding whitespace --
   * and so are reads used as free text, like log tails.
   */
  for (const [name, source] of [["tunnel", tunnelScript], ["bridge", script]]) {
    const rawReads = [...source.matchAll(/Get-Content [^\n]*-Raw[^\n]*/g)].map((m) => m[0]);
    for (const read of rawReads) {
      const tolerant = /\.Trim\(\)/.test(read) || /ConvertFrom-Json/.test(read) || /\$StderrFile|\$ProxyErrFile/.test(read);
      assert.ok(tolerant, `${name}: strict read is not whitespace-tolerant: ${read}`);
    }
  }
});
