/*
 * Deterministic routing for `/gemini-notebook-research`.
 *
 * The skill used to mean one thing: "delegate a research question". The MCP
 * behind it exposes twelve read-only operations, and picking the wrong one is
 * expensive -- a `notebook_query` where `source_get_content` was wanted burns a
 * model call and returns a paraphrase instead of the actual text.
 *
 * Everything here is pure and side-effect free. The agent performs the MCP
 * calls; this module decides *which* call, resolves titles to ids, decides when
 * a query must go down the async path, and interprets what comes back. Keeping
 * it as data rather than prose is what lets the tests pin the behaviour.
 */

import { NOTEBOOK_READONLY_TOOLS, MUTATING_NAME, isReadOnlyTool } from "./chatgpt-tool-allowlist.mjs";

export { NOTEBOOK_READONLY_TOOLS, isReadOnlyTool };

/* ------------------------------------------------------------------ guard - */

/**
 * The one chokepoint. Anything the router is about to emit passes through here,
 * so a routing rule cannot introduce a write tool even by typo.
 */
export function assertReadOnly(tool) {
  if (!NOTEBOOK_READONLY_TOOLS.includes(tool)) {
    throw new Error(`refused: ${tool} is not on the Gemini Notebook read-only surface`);
  }
  if (MUTATING_NAME.test(tool)) {
    throw new Error(`refused: ${tool} looks mutating`);
  }
  return tool;
}

/* --------------------------------------------------------------- matching - */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Folds a title down to something two humans typing the same notebook name
 * would agree on: no case, no diacritics, no punctuation, single spaces.
 */
export function normalizeTitle(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const labelOf = (item) => item?.title ?? item?.name ?? item?.label ?? "";
const idOf = (item) => item?.id ?? item?.notebook_id ?? item?.source_id ?? item?.conversation_id ?? "";

/**
 * Resolves a user-typed needle against a list of notebooks, sources or
 * conversations. Ambiguity is reported, not guessed: the caller shows the
 * candidates and asks. A single plausible hit never asks.
 *
 * @returns {{status: "resolved"|"ambiguous"|"not_found", item?: object,
 *            candidates: object[], matchedBy?: string}}
 */
export function resolveEntity(needle, items) {
  const list = Array.isArray(items) ? items : [];
  const raw = String(needle ?? "").trim();
  if (!raw) return { status: "not_found", candidates: [], reason: "empty query" };

  if (UUID.test(raw)) {
    const byId = list.filter((item) => String(idOf(item)).toLowerCase() === raw.toLowerCase());
    return byId.length === 1
      ? { status: "resolved", item: byId[0], candidates: byId, matchedBy: "id" }
      : { status: "not_found", candidates: [], reason: "no entity with that id" };
  }

  /* Ids are not always UUIDs upstream, so try a literal id match before titles. */
  const literalId = list.filter((item) => String(idOf(item)) === raw);
  if (literalId.length === 1) {
    return { status: "resolved", item: literalId[0], candidates: literalId, matchedBy: "id" };
  }

  const needleNorm = normalizeTitle(raw);
  const passes = [
    ["title-exact", (item) => labelOf(item) === raw],
    ["title-caseless", (item) => labelOf(item).toLowerCase() === raw.toLowerCase()],
    ["title-normalized", (item) => normalizeTitle(labelOf(item)) === needleNorm],
    ["title-contains", (item) => needleNorm.length >= 3 && normalizeTitle(labelOf(item)).includes(needleNorm)],
    [
      "title-tokens",
      (item) => {
        const tokens = needleNorm.split(" ").filter((token) => token.length >= 3);
        if (tokens.length === 0) return false;
        const hay = normalizeTitle(labelOf(item));
        return tokens.every((token) => hay.includes(token));
      },
    ],
  ];

  for (const [matchedBy, predicate] of passes) {
    const hits = list.filter(predicate);
    if (hits.length === 1) return { status: "resolved", item: hits[0], candidates: hits, matchedBy };
    /*
     * Two notebooks can legitimately share a normalized title. Stopping at the
     * first ambiguous pass rather than falling through to a looser one keeps the
     * question honest -- a looser pass would not disambiguate, only widen.
     */
    if (hits.length > 1) return { status: "ambiguous", candidates: hits, matchedBy };
  }

  /*
   * Last pass, deliberately loose: a hint pulled out of prose carries noise the
   * strict passes reject outright. Scoring by how many needle tokens the title
   * actually contains recovers "Mcelleo sein Hurensohn Design ausfuehrlich"
   * without inventing a match for something unrelated. It is reported as low
   * confidence so the caller names the notebook it picked.
   */
  const tokens = needleNorm.split(" ").filter((token) => token.length >= 3);
  if (tokens.length >= 2) {
    const scored = list
      .map((item) => {
        const hay = normalizeTitle(labelOf(item));
        return { item, score: tokens.filter((token) => hay.includes(token)).length };
      })
      .filter((entry) => entry.score >= 2)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const best = scored.filter((entry) => entry.score === scored[0].score);
      if (best.length === 1) {
        return {
          status: "resolved",
          item: best[0].item,
          candidates: best.map((entry) => entry.item),
          matchedBy: "title-overlap",
          confidence: "low",
        };
      }
      return { status: "ambiguous", candidates: best.map((entry) => entry.item), matchedBy: "title-overlap" };
    }
  }

  return { status: "not_found", candidates: [], reason: "no title matched" };
}

/** Convenience wrapper so call sites read as what they resolve. */
export const resolveNotebook = resolveEntity;
export const resolveSource = resolveEntity;
export const resolveConversation = resolveEntity;

/* ------------------------------------------------------- intent routing --- */

const stripLead = (text) => String(text ?? "").trim().replace(/^\/gemini-notebook-research\s*/i, "").trim();

/**
 * Pulls quoted segments out of a request. `ask "Notebook" "Question"` and
 * natural language like `Stelle X die Frage: "..."` both end up here, which is
 * why the CLI-ish forms need no separate parser.
 */
export function quotedParts(text) {
  return [...String(text ?? "").matchAll(/[""«»„"']([^""«»„"']{2,})[""«»„"']/g)].map((m) => m[1].trim());
}

/*
 * Ordered. The first rule that matches wins, so the specific ones (a named
 * single source, an export) sit above the general ones (ask the notebook).
 */
const RULES = [
  {
    intent: "health",
    tool: "server_info",
    test: (t) =>
      /\b(health|status|diagnos|version|update|auth|login|anmeld|bridge|server[_\s-]?info|capabilit)/i.test(t),
  },
  {
    intent: "list-notebooks",
    tool: "notebook_list",
    test: (t) =>
      /^(list|notebooks?|liste)\b/i.test(t) ||
      /\b(liste?|list|zeig(e)?|show|welche)\b[^?]{0,40}\bnotebooks?\b/i.test(t) ||
      /\bnotebooks?\b[^?]{0,20}\b(auflisten|anzeigen)\b/i.test(t),
  },
  {
    intent: "export-chat",
    tool: "chat_export",
    test: (t) => /\b(export|exportier)/i.test(t) && /\b(chat|conversation|unterhaltung|verlauf|transcript)/i.test(t),
  },
  {
    intent: "list-chats",
    tool: "chat_list",
    test: (t) =>
      /^chats\b/i.test(t) ||
      (/\b(chats?|conversations?|unterhaltungen)\b/i.test(t) &&
        /\b(welche|which|list|liste|gibt es|vorhanden|alle|all)\b/i.test(t)),
  },
  {
    intent: "read-chat",
    tool: "chat_get",
    test: (t) => /\b(chat|conversation|unterhaltung|transcript|verlauf)\b/i.test(t),
  },
  {
    intent: "source-content",
    tool: "source_get_content",
    test: (t) =>
      /^source\b/i.test(t) ||
      (/\b(quelle|source|dokument|document|pdf|transkript|transcript)\b/i.test(t) &&
        /\b(inhalt|content|text|volltext|full text|roh|raw|original|wortlaut|lies|read)\b/i.test(t)),
  },
  {
    intent: "source-describe",
    tool: "source_describe",
    test: (t) =>
      /\b(quelle|source)\b/i.test(t) &&
      /\b(beschreib|describe|zusammenfass|summar|worum|keywords?|metadat)/i.test(t),
  },
  {
    intent: "notebook-sources",
    tool: "notebook_get",
    test: (t) =>
      /^(sources?|quellen)\b/i.test(t) ||
      (/\b(quellen|sources)\b/i.test(t) &&
        /\b(welche|which|list|liste|zeig|show|gibt es|liegen|enthält|enthalten|wie viele|how many)\b/i.test(t)),
  },
  {
    intent: "notebook-overview",
    tool: "notebook_describe",
    test: (t) =>
      /^describe\b/i.test(t) ||
      /\b(worum geht|worum handelt|overview|überblick|ueberblick|describe|beschreib|thema|themen|topics|what is .* about)\b/i.test(t),
  },
  {
    intent: "ask",
    tool: "notebook_query",
    test: () => true,
  },
];

/**
 * Classifies a natural-language or shorthand request into exactly one read-only
 * MCP entrypoint, plus what still has to be resolved before the call.
 *
 * @returns {{intent: string, tool: string, needs: string[], notebookQuery: string|null,
 *            entityQuery: string|null, question: string|null, format: string|null,
 *            newConversation: boolean, rest: string}}
 */
export function routeIntent(input) {
  const text = stripLead(input);
  const rule = RULES.find((candidate) => candidate.test(text)) ?? RULES[RULES.length - 1];
  const tool = assertReadOnly(rule.tool);
  const quotes = quotedParts(text);

  const needs = [];
  if (tool !== "notebook_list" && tool !== "server_info") needs.push("notebook");
  if (tool === "source_describe" || tool === "source_get_content") needs.push("source");
  if (tool === "chat_get" || tool === "chat_export") needs.push("conversation");

  let notebookQuery = null;
  let entityQuery = null;
  let question = null;

  if (tool === "notebook_query") {
    /*
     * `ask "Notebook" "Question"` gives both. A single quote is the question --
     * `Stelle X die Frage: "..."` -- so the notebook has to come from the prose.
     */
    question = (quotes.length >= 2 ? quotes[1] : quotes[0]) ?? text;
    notebookQuery = quotes.length >= 2 ? quotes[0] : extractNotebookHint(text);
  } else if (needs.includes("notebook")) {
    notebookQuery = (needs.includes("source") || needs.includes("conversation") ? quotes[1] : quotes[0])
      ?? extractNotebookHint(text);
  }

  if (needs.includes("source") || needs.includes("conversation")) {
    entityQuery = quotes[0] ?? extractEntityHint(text);
  }

  return {
    intent: rule.intent,
    tool,
    needs,
    notebookQuery: notebookQuery || null,
    entityQuery: entityQuery || null,
    question: question || null,
    format: detectFormat(text),
    newConversation: /\b(neue[rs]?\s+(chat|conversation|unterhaltung)|new conversation|frisch|von vorne|start over)\b/i.test(text),
    rest: text,
  };
}

/** `md` / `json`, only where the MCP actually offers a choice. */
function detectFormat(text) {
  if (/\bjson\b/i.test(text)) return "json";
  if (/\b(markdown|\.?md)\b/i.test(text)) return "md";
  return null;
}

/*
 * Words that end a name. Without them "von XYZ ausführlich und vergleiche die
 * Aussagen" is captured whole, and the resolver -- which requires every token to
 * appear in the title -- then matches nothing at all.
 */
const NAME_STOPWORDS = new Set([
  "ausführlich", "ausfuehrlich", "detailliert", "genau", "bitte", "und", "sowie", "dann",
  "damit", "als", "mit", "ohne", "die", "der", "das", "dem", "den", "frage", "fragen",
  "question", "and", "with", "please", "in", "depth", "vergleiche", "analysiere", "zusammen",
]);

/** Cuts a captured phrase at the first stopword and caps its length. */
function trimName(value) {
  const tokens = String(value ?? "").trim().split(/\s+/);
  const kept = [];
  for (const token of tokens) {
    if (NAME_STOPWORDS.has(token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))) break;
    kept.push(token);
    if (kept.length >= 10) break;
  }
  return kept.join(" ").replace(/[\s.,:;!?-]+$/u, "").trim() || null;
}

/**
 * Last resort when the user quoted nothing. Ordered: the German "stelle X die
 * Frage" shape first, then a preposition that normally introduces a notebook
 * name, then a bare "Notebook X".
 */
function extractNotebookHint(text) {
  const value = String(text ?? "");
  const patterns = [
    /\bstelle\s+(?:dem\s+|der\s+|das\s+)?(?:notebook\s+)?(.+?)\s+(?:die\s+)?frage\b/i,
    /\b(?:aus|in|von|im|from|of|für|for)\s+(?:dem\s+|der\s+|das\s+|den\s+|the\s+)?(?:notebook\s+)?([^,.?!:;]{2,80})/i,
    /\bnotebooks?\s+([^,.?!:;]{2,80})/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const name = match ? trimName(match[1]) : null;
    if (name) return name;
  }
  return null;
}

/** The same idea for a named source or conversation: "die Quelle ABC aus XYZ". */
function extractEntityHint(text) {
  const value = String(text ?? "");
  const patterns = [
    /\b(?:quelle|source|dokument|document)\s+(?:namens\s+|called\s+)?([^,.?!:;]{2,80}?)(?:\s+(?:aus|in|von|from|of)\b|$)/i,
    /\b(?:chat|conversation|unterhaltung)\s+([^,.?!:;]{2,80}?)(?:\s+(?:aus|in|von|from|of)\b|$)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const name = match ? trimName(match[1]) : null;
    if (name) return name;
  }
  return null;
}

/* --------------------------------------------------------- async queries --- */

/** Above this many sources a query is treated as heavy enough for the async path. */
export const HEAVY_SOURCE_COUNT = 25;
/** Above this many characters the question itself is treated as heavy. */
export const HEAVY_QUESTION_LENGTH = 280;

const HEAVY_INTENT =
  /\b(analysier|analyz|analys|vergleich|compar|ausführlich|ausfuehrlich|detailliert|in depth|comprehensive|synthes|systematisch|alle quellen|all sources|jede quelle|every source|gegenüberstell)/i;

/**
 * Decides between `notebook_query` and `notebook_query_start` + polling.
 *
 * The synchronous call has a fixed upstream timeout. Sending an 80-source
 * comparison through it does not fail faster -- it fails after two minutes with
 * nothing to show, which is the error this exists to avoid.
 */
export function shouldUseAsyncQuery({
  sourceCount = 0,
  selectedSourceIds = null,
  question = "",
  asyncAvailable = true,
} = {}) {
  if (!asyncAvailable) {
    return { async: false, reason: "notebook_query_start is not exposed by this server" };
  }

  const effective = Array.isArray(selectedSourceIds) && selectedSourceIds.length > 0
    ? selectedSourceIds.length
    : Number(sourceCount) || 0;

  if (effective >= HEAVY_SOURCE_COUNT) {
    return { async: true, reason: `${effective} sources in scope (>= ${HEAVY_SOURCE_COUNT})` };
  }
  if (String(question).length >= HEAVY_QUESTION_LENGTH) {
    return { async: true, reason: "question is long enough to imply a long answer" };
  }
  if (HEAVY_INTENT.test(String(question))) {
    return { async: true, reason: "question asks for analysis or comparison across sources" };
  }
  return { async: false, reason: `${effective} sources, focused question` };
}

/* Terminal-state vocabulary differs between upstream versions; normalise once. */
const COMPLETED = new Set(["completed", "complete", "done", "succeeded", "success", "finished", "ok"]);
const FAILED = new Set(["error", "failed", "failure", "cancelled", "canceled", "aborted", "timeout"]);
const PENDING = new Set(["pending", "queued", "waiting", "accepted", "created"]);
const RUNNING = new Set(["running", "in_progress", "inprogress", "processing", "working", "started"]);

/** Default poll budget for an async query, in milliseconds. */
export const ASYNC_QUERY_BUDGET_MS = 15 * 60 * 1000;

/**
 * Interprets one `notebook_query_status` payload.
 *
 * @returns {{state: "completed"|"error"|"running"|"pending"|"timeout"|"unknown",
 *            answer: string|null, error: string|null, done: boolean,
 *            nextPollMs: number|null, conversationId: string|null}}
 */
export function interpretQueryStatus(payload, { elapsedMs = 0, budgetMs = ASYNC_QUERY_BUDGET_MS, attempt = 0 } = {}) {
  const raw = String(payload?.status ?? payload?.state ?? "").toLowerCase().trim();
  const conversationId = payload?.conversation_id ?? payload?.conversationId ?? null;
  const answer = payload?.answer ?? payload?.result ?? payload?.response ?? payload?.text ?? null;
  const error = payload?.error ?? payload?.error_message ?? payload?.message ?? null;

  if (COMPLETED.has(raw)) {
    return { state: "completed", answer, error: null, done: true, nextPollMs: null, conversationId };
  }
  if (FAILED.has(raw)) {
    return {
      state: "error",
      answer: null,
      error: error || `upstream reported ${raw || "an error"}`,
      done: true,
      nextPollMs: null,
      conversationId,
    };
  }

  const live = RUNNING.has(raw) ? "running" : PENDING.has(raw) ? "pending" : "unknown";
  if (elapsedMs >= budgetMs) {
    return {
      state: "timeout",
      answer: null,
      error: `no terminal state after ${Math.round(budgetMs / 1000)}s`,
      done: true,
      nextPollMs: null,
      conversationId,
    };
  }
  return { state: live, answer: null, error: null, done: false, nextPollMs: nextPollDelayMs(attempt), conversationId };
}

/** Fibonacci-ish backoff, capped, so a slow query is not polled hundreds of times. */
export function nextPollDelayMs(attempt = 0) {
  const ladder = [2000, 3000, 5000, 8000, 13000];
  return ladder[Math.min(Math.max(0, attempt), ladder.length - 1)];
}

/* ------------------------------------------------------ conversation reuse - */

/**
 * A follow-up continues the previous conversation; anything else starts fresh.
 * The user can always force a new one, and there is nothing to continue if the
 * last query never returned an id.
 */
export function planConversation({ lastConversationId = null, isFollowUp = false, forceNew = false } = {}) {
  if (forceNew) return { conversationId: null, reason: "user asked for a new conversation" };
  if (isFollowUp && lastConversationId) {
    return { conversationId: lastConversationId, reason: "follow-up on the previous answer" };
  }
  return { conversationId: null, reason: lastConversationId ? "new topic" : "no previous conversation" };
}

/** Heuristic for "this refers back to what you just told me". */
export function looksLikeFollowUp(text) {
  return /\b(davon|daraus|und welche|welche davon|dazu|darunter|derer|und was|and which|of those|from those|follow.?up|weiter|vertiefe|genauer)\b/i.test(
    String(text ?? ""),
  );
}

/* ------------------------------------------------------------ server_info - */

const AUTH_STATES = {
  configured: { ok: true, summary: "Angemeldet und verifiziert.", remedy: null },
  stale: {
    ok: false,
    summary: "Die Google-Session ist abgelaufen.",
    remedy: "nlm login",
  },
  unverified: {
    ok: true,
    summary: "Zugangsdaten vorhanden, aber nicht gegen Gemini Notebook geprüft.",
    remedy: "nlm login --check",
  },
  not_configured: {
    ok: false,
    summary: "Es ist noch keine Google-Session hinterlegt.",
    remedy: "nlm login",
  },
  error: {
    ok: false,
    summary: "Der Auth-Status konnte nicht ermittelt werden.",
    remedy: "nlm doctor",
  },
};

/**
 * Turns a `server_info` payload into something worth saying out loud.
 *
 * Auth states are kept apart on purpose: reporting "Login kaputt" for an
 * unverified-but-present session sends the user through a browser login they do
 * not need.
 */
export function interpretServerInfo(info) {
  const installed = info?.version ?? info?.installed_version ?? null;
  const latest = info?.latest_version ?? info?.available_version ?? null;
  const updateAvailable = Boolean(info?.update_available ?? (installed && latest && installed !== latest));
  const updateCommand = info?.update_command ?? null;

  const rawAuth = String(info?.auth_status ?? info?.auth?.status ?? info?.auth ?? "").toLowerCase().trim();
  const known = Object.prototype.hasOwnProperty.call(AUTH_STATES, rawAuth);
  const auth = known
    ? { state: rawAuth, ...AUTH_STATES[rawAuth] }
    : { state: "unknown", ok: false, summary: `Unbekannter Auth-Status: ${rawAuth || "(leer)"}`, remedy: "nlm doctor" };

  const capabilities = info?.capabilities ?? info?.mcp_capabilities ?? [];
  const toolNames = Array.isArray(capabilities)
    ? capabilities.map((entry) => (typeof entry === "string" ? entry : entry?.name)).filter(Boolean)
    : [];

  return {
    installed,
    latest,
    updateAvailable,
    updateCommand,
    updateHint:
      updateAvailable && updateCommand
        ? `Update verfügbar (${installed ?? "?"} → ${latest ?? "?"}): ${updateCommand}`
        : updateAvailable
          ? `Update verfügbar (${installed ?? "?"} → ${latest ?? "?"}).`
          : null,
    auth,
    capabilities: toolNames,
    /* Anything upstream offers beyond the read-only surface stays visible but unreachable. */
    reachable: toolNames.filter((name) => NOTEBOOK_READONLY_TOOLS.includes(name)),
    withheld: toolNames.filter((name) => !NOTEBOOK_READONLY_TOOLS.includes(name)),
  };
}

/* ---------------------------------------------------------- availability --- */

/**
 * Names the layer that is actually missing instead of concluding "the tool does
 * not exist". A remote session without the binary is the common case and is not
 * a configuration bug.
 */
export function diagnoseAvailability({
  skillEntrypointExists = true,
  agentDefinitionExists = true,
  binaryOnPath = true,
  toolsVisible = true,
} = {}) {
  if (!skillEntrypointExists) {
    return {
      ok: false,
      layer: "skill",
      message: ".claude/skills/gemini-notebook-research/SKILL.md fehlt in diesem Checkout.",
      remedy: "git pull, dann Claude Code neu starten",
    };
  }
  if (!agentDefinitionExists) {
    return {
      ok: false,
      layer: "agent",
      message: ".claude/agents/research-director.md fehlt in diesem Checkout.",
      remedy: "git pull, dann Claude Code neu starten",
    };
  }
  if (!binaryOnPath) {
    return {
      ok: false,
      layer: "binary",
      message:
        "notebooklm-mcp ist auf dieser Maschine nicht installiert. Der MCP läuft per stdio und braucht dieselbe Maschine wie die Claude-Code-Session.",
      remedy: "npm run setup:research (lokal, nicht in einer Remote-Session)",
    };
  }
  if (!toolsVisible) {
    return {
      ok: false,
      layer: "session",
      message:
        "Binary und Definitionen sind vorhanden, die Session exponiert die MCP-Tools aber nicht. Nach einem Pull, der die Dateien erst angelegt hat, ist ein Neustart nötig.",
      remedy: "Claude Code neu starten, dann research-director direkt mit notebook_list testen",
    };
  }
  return { ok: true, layer: null, message: "Read-only Gemini Notebook MCP erreichbar.", remedy: null };
}

/* ----------------------------------------------------------- presentation - */

/** Notebook list as lines a human reads, ids only when asked for. */
export function formatNotebookList(notebooks, { showIds = false } = {}) {
  const list = Array.isArray(notebooks) ? notebooks : [];
  if (list.length === 0) return "Keine Notebooks gefunden.";
  return list
    .map((notebook) => {
      const count = notebook?.source_count ?? notebook?.sourceCount ?? notebook?.sources?.length;
      const sources = Number.isFinite(count) ? ` — ${count} ${count === 1 ? "Quelle" : "Quellen"}` : "";
      const id = showIds && idOf(notebook) ? `  [${idOf(notebook)}]` : "";
      return `- ${labelOf(notebook) || "(ohne Titel)"}${sources}${id}`;
    })
    .join("\n");
}

/** The candidate list shown before asking which notebook was meant. */
export function formatCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((item, index) => `${index + 1}. ${labelOf(item) || idOf(item)}`)
    .join("\n");
}

/**
 * Builds the full plan for one request: which tool, what still has to be
 * resolved, and how. This is what the CLI prints and what the skill follows.
 */
export function planRequest(input, context = {}) {
  const route = routeIntent(input);
  const plan = {
    ...route,
    steps: [],
    readOnly: true,
  };

  if (route.needs.includes("notebook")) {
    plan.steps.push({
      tool: assertReadOnly("notebook_list"),
      why: "Titel auf Notebook-ID auflösen",
      resolve: route.notebookQuery,
    });
  }
  if (route.needs.includes("source")) {
    plan.steps.push({
      tool: assertReadOnly("notebook_get"),
      why: "Quellen des Notebooks laden, um die genannte Quelle aufzulösen",
      resolve: route.entityQuery,
    });
  }
  if (route.needs.includes("conversation")) {
    plan.steps.push({
      tool: assertReadOnly("chat_list"),
      why: "Conversation auflösen",
      resolve: route.entityQuery,
    });
  }

  if (route.tool === "notebook_query") {
    const decision = shouldUseAsyncQuery({ ...context, question: route.question ?? "" });
    plan.async = decision;
    plan.steps.push(
      decision.async
        ? { tool: assertReadOnly("notebook_query_start"), why: decision.reason }
        : { tool: assertReadOnly("notebook_query"), why: decision.reason },
    );
    if (decision.async) {
      plan.steps.push({ tool: assertReadOnly("notebook_query_status"), why: "bis completed oder error pollen" });
    }
    const conversation = planConversation({
      lastConversationId: context.lastConversationId ?? null,
      isFollowUp: looksLikeFollowUp(input),
      forceNew: route.newConversation,
    });
    plan.conversation = conversation;
  } else {
    plan.steps.push({ tool: route.tool, why: "beantwortet die Anfrage direkt" });
  }

  for (const step of plan.steps) assertReadOnly(step.tool);
  return plan;
}
