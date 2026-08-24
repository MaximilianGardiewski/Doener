/*
 * One definition of what ChatGPT may reach, shared by the enforcing proxy, the
 * smoke test and the static guards. Duplicating it in three places is how an
 * allowlist quietly drifts apart.
 */

export const READONLY_TOOLS = [
  "server_info",
  "notebook_list",
  "notebook_get",
  "notebook_describe",
  "source_describe",
  "source_get_content",
];

export const QUERY_EXTRA_TOOLS = [
  "notebook_query",
  "notebook_query_start",
  "notebook_query_status",
  "chat_list",
  "chat_get",
  "chat_export",
];

/*
 * Catches an upstream tool nobody thought to denylist. "start" is deliberately
 * absent: notebook_query_start is a read query, not a write.
 */
export const MUTATING_NAME = /(delete|remove|destroy|create|add|update|edit|write|upload|rename|move|share|invite|publish|import|generate|studio|sync|switch|logout|login)/i;

export function toolsFor(mode) {
  if (mode === "query") return [...READONLY_TOOLS, ...QUERY_EXTRA_TOOLS];
  if (mode === "readonly") return [...READONLY_TOOLS];
  throw new Error(`unknown mode: ${mode}`);
}

/*
 * The complete read-only surface of the Gemini Notebook MCP, in one place.
 *
 * This is the same set as `toolsFor("query")`, named for the second consumer:
 * the `/gemini-notebook-research` router, which is read-only by construction and
 * has no notion of the ChatGPT proxy's readonly/query profiles. Keeping it here
 * rather than in the router is the point -- one list, two consumers, no drift.
 */
export const NOTEBOOK_READONLY_TOOLS = Object.freeze([...READONLY_TOOLS, ...QUERY_EXTRA_TOOLS]);

/*
 * Names the verb screen above cannot catch, measured against notebooklm-mcp-cli
 * 0.9.14 (48 tools registered, 12 allowed here).
 *
 * `batch` and `pipeline` are the important entries: they execute other tools, so
 * the dangerous name never appears in the call and no name-based screen can see
 * it. They are the reason the positive allowlist -- not the regex -- is the real
 * control. The rest are writes whose verbs simply are not in MUTATING_NAME
 * ("save", "refresh", "configure"), or whose name collides with a legitimate one
 * ("note" is a substring of "notebook", so it cannot go in the regex at all).
 */
export const HIGH_RISK_TOOLS = Object.freeze([
  "batch",
  "pipeline",
  "save_auth_tokens",
  "refresh_auth",
  "chat_configure",
  "collection_set_emoji",
  "note",
  "tag",
  "label",
  "download_artifact",
  "download_all_artifacts",
  "export_artifact",
]);

/** True only for a tool on the read-only surface that also survives both screens. */
export function isReadOnlyTool(tool) {
  return (
    NOTEBOOK_READONLY_TOOLS.includes(tool)
    && !MUTATING_NAME.test(tool)
    && !HIGH_RISK_TOOLS.includes(tool)
  );
}
