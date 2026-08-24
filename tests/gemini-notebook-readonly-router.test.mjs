import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import {
  assertReadOnly,
  diagnoseAvailability,
  formatCandidates,
  formatNotebookList,
  interpretQueryStatus,
  interpretServerInfo,
  isReadOnlyTool,
  looksLikeFollowUp,
  nextPollDelayMs,
  normalizeTitle,
  planConversation,
  planRequest,
  resolveNotebook,
  routeIntent,
  shouldUseAsyncQuery,
  HEAVY_SOURCE_COUNT,
  NOTEBOOK_READONLY_TOOLS,
} from "../scripts/lib/notebook-research-router.mjs";
import { MUTATING_NAME, toolsFor } from "../scripts/lib/chatgpt-tool-allowlist.mjs";

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/* Same CRLF tolerance as the allowlist suite: these files are edited on Windows. */
const read = async (relative) =>
  (await readFile(new URL(relative, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const NOTEBOOKS = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Mcelleo sein Hurensohn Design", source_count: 42 },
  { id: "22222222-2222-4222-8222-222222222222", title: "Doener — Project Research", source_count: 7 },
  { id: "33333333-3333-4333-8333-333333333333", title: "Doener Project Research", source_count: 3 },
];

/* ------------------------------------------------------------ 1. routing - */

test("a request to list notebooks routes to notebook_list", () => {
  for (const input of ["list", "notebooks", "Liste meine Notebooks", "Welche Notebooks habe ich?"]) {
    assert.equal(routeIntent(input).tool, "notebook_list", input);
  }
});

test("notebook_list needs nothing resolved first", () => {
  assert.deepEqual(routeIntent("list").needs, []);
});

/* --------------------------------------------------- 2. title -> id path - */

test("a title question resolves through notebook_list before querying", () => {
  const plan = planRequest('Stelle Mcelleo sein Hurensohn Design die Frage: "Fasse die wichtigsten Erkenntnisse zusammen."');
  assert.equal(plan.tool, "notebook_query");
  assert.equal(plan.notebookQuery, "Mcelleo sein Hurensohn Design");
  assert.equal(plan.question, "Fasse die wichtigsten Erkenntnisse zusammen.");
  assert.equal(plan.steps[0].tool, "notebook_list", "the id has to be resolved before the query");
});

test("notebook resolution accepts id, exact, caseless, normalized and substring", () => {
  const cases = [
    ["11111111-1111-4111-8111-111111111111", "id"],
    ["Mcelleo sein Hurensohn Design", "title-exact"],
    ["mcelleo SEIN hurensohn design", "title-caseless"],
    ["Mcelleo, sein Hurensohn Design!", "title-normalized"],
    ["Hurensohn", "title-contains"],
  ];
  for (const [needle, matchedBy] of cases) {
    const result = resolveNotebook(needle, NOTEBOOKS);
    assert.equal(result.status, "resolved", needle);
    assert.equal(result.item.id, NOTEBOOKS[0].id, needle);
    assert.equal(result.matchedBy, matchedBy, needle);
  }
});

test("a title hint carrying prose noise still resolves, but reports low confidence", () => {
  const result = resolveNotebook("Hurensohn Design ausfuehrlich vergleichen", NOTEBOOKS);
  assert.equal(result.status, "resolved");
  assert.equal(result.item.id, NOTEBOOKS[0].id);
  assert.equal(result.confidence, "low", "a loose match must be declared, not presented as certain");
});

test("normalizeTitle folds case, diacritics and punctuation", () => {
  assert.equal(normalizeTitle("Döner — Prójekt, Reseärch!"), "doner projekt research");
});

/* ------------------------------------------------- 16. ambiguous titles - */

test("several plausible notebooks are reported as ambiguous, never guessed", () => {
  /* Two titles that differ only in punctuation collapse at the normalized pass. */
  const result = resolveNotebook("doener, project research!", NOTEBOOKS);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidates.length, 2);
  assert.match(formatCandidates(result.candidates), /Doener — Project Research/);
});

test("an exact title still wins over its punctuation twin", () => {
  const result = resolveNotebook("Doener Project Research", NOTEBOOKS);
  assert.equal(result.status, "resolved");
  assert.equal(result.matchedBy, "title-exact");
  assert.equal(result.item.id, NOTEBOOKS[2].id);
});

test("a needle that matches nothing is not_found rather than a fallback notebook", () => {
  const result = resolveNotebook("Völlig anderes Notebook", NOTEBOOKS);
  assert.equal(result.status, "not_found");
  assert.deepEqual(result.candidates, []);
});

test("an unknown UUID does not fall through to title matching", () => {
  assert.equal(resolveNotebook("99999999-9999-4999-8999-999999999999", NOTEBOOKS).status, "not_found");
});

/* ------------------------------------------------ 3./4. get and describe - */

test("asking which sources a notebook holds routes to notebook_get", () => {
  for (const input of ['Welche Quellen liegen in "Doener — Project Research"?', 'sources "Doener — Project Research"']) {
    assert.equal(routeIntent(input).tool, "notebook_get", input);
  }
});

test("asking what a notebook is about routes to notebook_describe, not a query", () => {
  for (const input of ["Worum geht es im Notebook Mcello Design?", 'describe "Mcello Design"']) {
    assert.equal(routeIntent(input).tool, "notebook_describe", input);
  }
});

/* -------------------------------------------------------- 5./6. queries - */

test("a knowledge question routes to notebook_query", () => {
  const plan = planRequest('ask "Mcello Design" "Was ist zu Motion entschieden?"');
  assert.equal(plan.tool, "notebook_query");
  assert.equal(plan.notebookQuery, "Mcello Design");
  assert.equal(plan.question, "Was ist zu Motion entschieden?");
  assert.equal(plan.steps.at(-1).tool, "notebook_query");
});

test("a follow-up continues the previous conversation", () => {
  assert.equal(looksLikeFollowUp("Welche davon betreffen konkret Mcello?"), true);
  const plan = planConversation({ lastConversationId: "c-1", isFollowUp: true });
  assert.equal(plan.conversationId, "c-1");
});

test("a new topic starts a new conversation even when one is open", () => {
  assert.equal(planConversation({ lastConversationId: "c-1", isFollowUp: false }).conversationId, null);
});

test("the user can always force a new conversation", () => {
  assert.equal(planConversation({ lastConversationId: "c-1", isFollowUp: true, forceNew: true }).conversationId, null);
  assert.equal(routeIntent("Starte eine neue Conversation und frag nach Motion").newConversation, true);
});

test("planRequest carries the conversation id into a follow-up query", () => {
  const plan = planRequest("Und welche davon betreffen konkret Mcello?", { lastConversationId: "c-9" });
  assert.equal(plan.tool, "notebook_query");
  assert.equal(plan.conversation.conversationId, "c-9");
});

/* ----------------------------------------------------- 7. async queries - */

test("a source-heavy notebook goes down the async path", () => {
  const decision = shouldUseAsyncQuery({ sourceCount: 80, question: "Fasse zusammen." });
  assert.equal(decision.async, true);
  assert.match(decision.reason, /80 sources/);
});

test("an analysis question goes async even on a small notebook", () => {
  assert.equal(
    shouldUseAsyncQuery({ sourceCount: 4, question: "Analysiere und vergleiche die wichtigsten Aussagen" }).async,
    true,
  );
});

test("a focused question on a small notebook stays synchronous", () => {
  assert.equal(shouldUseAsyncQuery({ sourceCount: 3, question: "Was ist die Hausfarbe?" }).async, false);
});

test("a narrow source selection overrides a large notebook", () => {
  const decision = shouldUseAsyncQuery({ sourceCount: 80, selectedSourceIds: ["s-1"], question: "Was steht drin?" });
  assert.equal(decision.async, false, "one selected source is not a heavy query");
});

test("the async path is not proposed when the server does not offer it", () => {
  const decision = shouldUseAsyncQuery({ sourceCount: 200, question: "Vergleiche alles", asyncAvailable: false });
  assert.equal(decision.async, false);
  assert.match(decision.reason, /not exposed/);
});

test("the heavy threshold is a boundary, not an approximation", () => {
  assert.equal(shouldUseAsyncQuery({ sourceCount: HEAVY_SOURCE_COUNT, question: "x" }).async, true);
  assert.equal(shouldUseAsyncQuery({ sourceCount: HEAVY_SOURCE_COUNT - 1, question: "x" }).async, false);
});

test("a heavy request plans start plus status polling", () => {
  const plan = planRequest("Analysiere alle 80 Quellen von Mcello Design ausführlich und vergleiche die Aussagen");
  const tools = plan.steps.map((step) => step.tool);
  assert.deepEqual(tools, ["notebook_list", "notebook_query_start", "notebook_query_status"]);
});

test("query status: pending and running keep polling with backoff", () => {
  for (const status of ["pending", "queued", "running", "in_progress"]) {
    const state = interpretQueryStatus({ status }, { attempt: 0 });
    assert.equal(state.done, false, status);
    assert.equal(state.nextPollMs, 2000, status);
  }
  assert.equal(interpretQueryStatus({ status: "running" }, { attempt: 3 }).nextPollMs, 8000);
  assert.equal(nextPollDelayMs(99), 13000, "backoff is capped");
});

test("query status: completed returns the answer and stops", () => {
  const state = interpretQueryStatus({ status: "completed", answer: "Fertig.", conversation_id: "c-1" });
  assert.equal(state.state, "completed");
  assert.equal(state.done, true);
  assert.equal(state.answer, "Fertig.");
  assert.equal(state.conversationId, "c-1");
});

test("query status: an error is terminal and keeps the upstream message", () => {
  const state = interpretQueryStatus({ status: "failed", error: "source index unavailable" });
  assert.equal(state.state, "error");
  assert.equal(state.done, true);
  assert.equal(state.error, "source index unavailable");
});

test("query status: polling stops at the budget instead of looping forever", () => {
  const state = interpretQueryStatus({ status: "running" }, { elapsedMs: 60_000, budgetMs: 30_000 });
  assert.equal(state.state, "timeout");
  assert.equal(state.done, true);
});

/* ---------------------------------------------------------- 8./9./10. chats */

test("chat operations route apart from each other", () => {
  assert.equal(routeIntent('Welche Chats gibt es in "Mcello Design"?').tool, "chat_list");
  assert.equal(routeIntent('Zeige den letzten Chat aus "Mcello Design"').tool, "chat_get");
  assert.equal(routeIntent("Exportiere den Chat als Markdown").tool, "chat_export");
});

test("an export format is picked up when the user names one", () => {
  assert.equal(routeIntent("Exportiere den Chat als Markdown").format, "md");
  assert.equal(routeIntent("Exportiere den Chat als JSON").format, "json");
  assert.equal(routeIntent("Exportiere den Chat").format, null);
});

/* ------------------------------------------------------ 11./12. sources - */

test("asking for a source's text prefers source_get_content over a query", () => {
  const plan = planRequest("Zeig mir den Inhalt der Quelle Builder Responsive V3 aus Mcello Design");
  assert.equal(plan.tool, "source_get_content");
  assert.equal(plan.entityQuery, "Builder Responsive V3");
  assert.equal(plan.notebookQuery, "Mcello Design");
  assert.deepEqual(plan.steps.map((step) => step.tool), ["notebook_list", "notebook_get", "source_get_content"]);
});

test("asking for a source summary routes to source_describe", () => {
  assert.equal(routeIntent("Beschreibe die Quelle Builder Responsive V3 aus Mcello Design").tool, "source_describe");
});

/* ------------------------------------------------ 13./14./15. server_info */

test("health and diagnostic requests route to server_info", () => {
  for (const input of ["health", "Wie ist der Auth-Status?", "Welche Version läuft?"]) {
    assert.equal(routeIntent(input).tool, "server_info", input);
  }
});

test("an available update is reported with the command the server returned", () => {
  const info = interpretServerInfo({
    version: "0.9.14",
    latest_version: "0.9.20",
    update_available: true,
    update_command: "uv tool install --force notebooklm-mcp-cli==0.9.20",
    auth_status: "configured",
  });
  assert.equal(info.updateAvailable, true);
  assert.match(info.updateHint, /0\.9\.14 → 0\.9\.20/);
  assert.match(info.updateHint, /uv tool install --force notebooklm-mcp-cli==0\.9\.20/);
});

test("no update available produces no update hint", () => {
  const info = interpretServerInfo({ version: "0.9.20", latest_version: "0.9.20", auth_status: "configured" });
  assert.equal(info.updateAvailable, false);
  assert.equal(info.updateHint, null);
});

test("auth states stay distinct instead of collapsing into 'login broken'", () => {
  const expected = {
    configured: { ok: true, remedy: null },
    unverified: { ok: true, remedy: "nlm login --check" },
    stale: { ok: false, remedy: "nlm login" },
    not_configured: { ok: false, remedy: "nlm login" },
    error: { ok: false, remedy: "nlm doctor" },
  };
  const seen = new Set();
  for (const [state, want] of Object.entries(expected)) {
    const auth = interpretServerInfo({ auth_status: state }).auth;
    assert.equal(auth.state, state);
    assert.equal(auth.ok, want.ok, state);
    assert.equal(auth.remedy, want.remedy, state);
    seen.add(auth.summary);
  }
  assert.equal(seen.size, Object.keys(expected).length, "each auth state needs its own message");
});

test("an unknown auth state is reported as unknown, not as configured", () => {
  const auth = interpretServerInfo({ auth_status: "wat" }).auth;
  assert.equal(auth.state, "unknown");
  assert.equal(auth.ok, false);
});

test("capabilities the integration will never route to are listed as withheld", () => {
  const info = interpretServerInfo({
    auth_status: "configured",
    capabilities: ["notebook_list", "notebook_create", "source_add"],
  });
  assert.deepEqual(info.reachable, ["notebook_list"]);
  assert.deepEqual(info.withheld, ["notebook_create", "source_add"]);
});

/* ------------------------------------------------- 17. MCP not available - */

test("an unavailable MCP names the layer that is missing, in order", () => {
  const cases = [
    [{ skillEntrypointExists: false, agentDefinitionExists: false, binaryOnPath: false }, "skill"],
    [{ agentDefinitionExists: false, binaryOnPath: false }, "agent"],
    [{ binaryOnPath: false }, "binary"],
    [{ toolsVisible: false }, "session"],
  ];
  for (const [input, layer] of cases) {
    const result = diagnoseAvailability(input);
    assert.equal(result.ok, false, layer);
    assert.equal(result.layer, layer);
    assert.ok(result.remedy, `${layer} needs a remedy`);
  }
  assert.equal(diagnoseAvailability({}).ok, true);
});

test("the CLI diagnoses this checkout rather than assuming the tool is gone", async () => {
  const { stdout } = await run(process.execPath, [
    join(repoRoot, "scripts/notebook-research-route.mjs"),
    "--diagnose",
    "--json",
  ]).catch((error) => error);
  const result = JSON.parse(stdout);
  assert.ok(["skill", "agent", "binary", "session", null].includes(result.layer));
  /* The repository files must be present; only the binary may legitimately be missing. */
  assert.notEqual(result.layer, "skill");
  assert.notEqual(result.layer, "agent");
});

/* -------------------------------------------- 18. read-only is enforced - */

test("the router's surface is exactly the shared read-only allowlist", () => {
  assert.deepEqual(NOTEBOOK_READONLY_TOOLS.slice().sort(), toolsFor("query").slice().sort());
  assert.equal(NOTEBOOK_READONLY_TOOLS.length, 12);
});

test("assertReadOnly refuses every known write tool", () => {
  const writes = [
    "notebook_create", "notebook_delete", "source_add", "source_delete", "source_sync_drive",
    "research_import", "research_start", "notebook_share", "studio_generate", "settings_update",
  ];
  for (const tool of writes) {
    assert.throws(() => assertReadOnly(tool), /refused/, tool);
    assert.equal(isReadOnlyTool(tool), false, tool);
  }
});

test("no tool the router can ever emit looks mutating", () => {
  for (const tool of NOTEBOOK_READONLY_TOOLS) {
    assert.equal(MUTATING_NAME.test(tool), false, tool);
    assert.doesNotThrow(() => assertReadOnly(tool), tool);
  }
});

test("every step of every planned request is read-only", () => {
  const requests = [
    "list", "health", 'sources "X"', 'describe "X"', 'ask "X" "Y"', 'chats "X"',
    "Zeige den letzten Chat aus X", "Exportiere den Chat als JSON",
    "Zeig mir den Inhalt der Quelle A aus X", "Beschreibe die Quelle A aus X",
    "Analysiere alle 80 Quellen von X ausführlich und vergleiche sie",
    "Lösche das Notebook X", "Füge eine Quelle zu X hinzu", "Importiere die Ergebnisse als Quelle",
  ];
  for (const request of requests) {
    const plan = planRequest(request);
    assert.equal(plan.readOnly, true, request);
    for (const step of plan.steps) {
      assert.ok(NOTEBOOK_READONLY_TOOLS.includes(step.tool), `${request} -> ${step.tool}`);
    }
  }
});

test("a request phrased as a mutation cannot produce a mutating call", () => {
  /*
   * The router has no write branch at all, so "delete notebook X" degrades to a
   * read. That is the intended failure mode: harmless, and the agent then says
   * it cannot do it.
   */
  for (const request of ["Lösche das Notebook X", "Erstelle ein neues Notebook", "Füge diese URL als Quelle hinzu"]) {
    const plan = planRequest(request);
    for (const step of plan.steps) assert.doesNotThrow(() => assertReadOnly(step.tool), request);
  }
});

test("the research-director agent is wired to the read-only surface and nothing else", async () => {
  const agent = await read("../.claude/agents/research-director.md");
  const exposed = [...agent.matchAll(/mcp__gemini-notebook-mcp__([a-z_]+)/g)].map((match) => match[1]);
  const unique = [...new Set(exposed)];
  assert.ok(unique.length > 0, "the agent must still declare its MCP tools");
  assert.deepEqual(
    unique.slice().sort(),
    NOTEBOOK_READONLY_TOOLS.slice().sort(),
    "research-director must expose exactly the read-only surface",
  );
});

test("the agent definition mentions no write tool anywhere, not even in prose", async () => {
  const agent = await read("../.claude/agents/research-director.md");
  for (const tool of ["notebook_create", "source_add", "research_import", "source_sync_drive", "research_start"]) {
    assert.equal(agent.includes(tool), false, `research-director still references ${tool}`);
  }
});

/* ------------------------------------------------- docs stay in sync ----- */

test("the skill entrypoint documents every routable tool", async () => {
  const skill = await read("../.claude/skills/gemini-notebook-research/SKILL.md");
  for (const tool of NOTEBOOK_READONLY_TOOLS) {
    assert.ok(skill.includes(tool), `the skill does not document ${tool}`);
  }
});

test("the skill entrypoint promises no write capability", async () => {
  const skill = await read("../.claude/skills/gemini-notebook-research/SKILL.md");
  const claims = skill.match(/`(notebook|source|chat|research|studio)_[a-z_]+`/g) ?? [];
  for (const claim of claims) {
    const tool = claim.replaceAll("`", "");
    assert.ok(NOTEBOOK_READONLY_TOOLS.includes(tool), `the skill names a non-read-only tool: ${tool}`);
  }
});

test("the bridge documentation covers the read-only surface", async () => {
  const doc = await read("../docs/integrations/GEMINI_NOTEBOOK_BRIDGE.md");
  for (const tool of NOTEBOOK_READONLY_TOOLS) {
    assert.ok(doc.includes(tool), `the bridge doc does not mention ${tool}`);
  }
});

/* ------------------------------ live protocol proof against a stub server - */

test("the smoke harness drives a real MCP session and calls no write tool", async () => {
  const audit = join(mkdtempSync(join(tmpdir(), "notebook-smoke-")), "audit.log");
  const { stdout } = await run(
    process.execPath,
    [
      join(repoRoot, "scripts/smoke-notebook-readonly.mjs"),
      "--command",
      join(repoRoot, "tests/fixtures/fake-notebook-mcp.mjs"),
      "--notebook",
      "Mcelleo sein Hurensohn Design",
    ],
    { env: { ...process.env, FAKE_MCP_AUDIT: audit } },
  );

  assert.match(stdout, /No mutating call was made/);
  assert.equal(/^FAIL/m.test(stdout), false, stdout);

  /*
   * Asserted from the server's own audit log rather than the harness's output:
   * the stub advertises five write tools and would execute them.
   */
  const called = [...new Set(readFileSync(audit, "utf8").split("\n").filter(Boolean))];
  assert.ok(called.includes("notebook_list"));
  assert.ok(called.includes("notebook_query"));
  for (const tool of called) {
    assert.ok(NOTEBOOK_READONLY_TOOLS.includes(tool), `a non-read-only tool crossed the wire: ${tool}`);
  }
});

test("the async path completes against a server that stays busy for several polls", async () => {
  const audit = join(mkdtempSync(join(tmpdir(), "notebook-async-")), "audit.log");
  const { stdout } = await run(
    process.execPath,
    [
      join(repoRoot, "scripts/smoke-notebook-readonly.mjs"),
      "--command",
      join(repoRoot, "tests/fixtures/fake-notebook-mcp.mjs"),
      "--notebook",
      "Mcelleo sein Hurensohn Design",
      "--question",
      "Analysiere alle Quellen ausführlich und vergleiche die wichtigsten Aussagen",
    ],
    { env: { ...process.env, FAKE_MCP_AUDIT: audit, FAKE_MCP_POLLS: "2" } },
  );

  assert.match(stdout, /notebook_query_start/);
  assert.match(stdout, /terminal state.*completed/);
  const called = readFileSync(audit, "utf8").split("\n").filter(Boolean);
  assert.ok(called.filter((tool) => tool === "notebook_query_status").length >= 3, "it must actually poll");
  assert.equal(called.includes("notebook_query"), false, "the sync call must not also fire");
});

test("the smoke harness resolves a bare command through PATH before spawning", async () => {
  /*
   * The production invocation passes no --command, so the binary is found on
   * PATH. Resolving it to an absolute path first is what keeps this working on
   * Windows, where `uv tool install` can leave a .cmd shim that Node's spawn
   * cannot start directly. Exercised here with a PATH entry named exactly like
   * the real binary.
   */
  const bin = mkdtempSync(join(tmpdir(), "notebook-path-"));
  copyFileSync(join(repoRoot, "tests/fixtures/fake-notebook-mcp.mjs"), join(bin, "notebooklm-mcp"));
  chmodSync(join(bin, "notebooklm-mcp"), 0o755);

  const { stdout } = await run(
    process.execPath,
    [join(repoRoot, "scripts/smoke-notebook-readonly.mjs"), "--notebook", "Doener — Project Research"],
    { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } },
  );
  assert.match(stdout, /No mutating call was made/);
  assert.equal(/^SKIPPED/.test(stdout), false, "a binary on PATH must not be reported as missing");
});

test("the smoke harness skips cleanly when there is no local MCP", async () => {
  const { stdout } = await run(process.execPath, [
    join(repoRoot, "scripts/smoke-notebook-readonly.mjs"),
    "--command",
    "definitely-not-installed-notebooklm-mcp",
  ]);
  assert.match(stdout, /^SKIPPED/);
});

/* ------------------------------------------------------------ formatting - */

test("the notebook list is rendered for humans, with ids only on request", () => {
  const plain = formatNotebookList(NOTEBOOKS);
  assert.match(plain, /- Mcelleo sein Hurensohn Design — 42 Quellen/);
  assert.equal(plain.includes("11111111"), false, "ids are noise unless asked for");
  assert.match(formatNotebookList(NOTEBOOKS, { showIds: true }), /\[11111111-1111-4111-8111-111111111111\]/);
  assert.equal(formatNotebookList([]), "Keine Notebooks gefunden.");
});

test("the fixture MCP is not picked up as a test file", () => {
  assert.equal(existsSync(join(repoRoot, "tests/fixtures/fake-notebook-mcp.mjs")), true);
  assert.equal(join(repoRoot, "tests/fixtures/fake-notebook-mcp.mjs").endsWith(".test.mjs"), false);
});
