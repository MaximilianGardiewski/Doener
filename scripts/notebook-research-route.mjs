#!/usr/bin/env node
/*
 * Deterministic front end for `/gemini-notebook-research`.
 *
 * The skill runs this before delegating, so the tool choice, the title that has
 * to be resolved and the sync/async decision are settled by code rather than
 * re-derived from prose on every invocation. It performs no MCP calls and needs
 * neither the binary nor a Google session.
 *
 *   node scripts/notebook-research-route.mjs "Welche Quellen liegen in XYZ?"
 *   node scripts/notebook-research-route.mjs --diagnose
 *   node scripts/notebook-research-route.mjs --json "list"
 */

import { access, constants } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { planRequest, diagnoseAvailability, NOTEBOOK_READONLY_TOOLS } from "./lib/notebook-research-router.mjs";

const run = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const exists = async (relative) => {
  try {
    await access(join(repoRoot, relative), constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

async function binaryOnPath(name) {
  try {
    /* `command -v` is a shell builtin; `which`/`where` is what works via execFile. */
    await run(process.platform === "win32" ? "where" : "which", [name]);
    return true;
  } catch {
    return false;
  }
}

async function diagnose() {
  return diagnoseAvailability({
    skillEntrypointExists: await exists(".claude/skills/gemini-notebook-research/SKILL.md"),
    agentDefinitionExists: await exists(".claude/agents/research-director.md"),
    binaryOnPath: await binaryOnPath("notebooklm-mcp"),
    /*
     * Only the running session knows whether the tools are actually exposed, so
     * this stays optimistic here and is corrected by the agent's own first call.
     */
    toolsVisible: true,
  });
}

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const wantsDiagnose = argv.includes("--diagnose");
const request = argv.filter((arg) => !arg.startsWith("--")).join(" ").trim();

if (wantsDiagnose) {
  const result = await diagnose();
  console.log(asJson ? JSON.stringify(result, null, 2) : `${result.ok ? "OK" : `BLOCKED (${result.layer})`}: ${result.message}${result.remedy ? `\n  → ${result.remedy}` : ""}`);
  process.exit(result.ok ? 0 : 1);
}

if (!request) {
  console.error("usage: node scripts/notebook-research-route.mjs [--json] [--diagnose] \"<request>\"");
  process.exit(2);
}

const plan = planRequest(request);

if (asJson) {
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.log(`intent:   ${plan.intent}`);
  console.log(`tool:     ${plan.tool}`);
  if (plan.notebookQuery) console.log(`notebook: ${plan.notebookQuery}`);
  if (plan.entityQuery) console.log(`entity:   ${plan.entityQuery}`);
  if (plan.question) console.log(`question: ${plan.question}`);
  if (plan.format) console.log(`format:   ${plan.format}`);
  if (plan.async) console.log(`async:    ${plan.async.async} (${plan.async.reason})`);
  if (plan.conversation) console.log(`convo:    ${plan.conversation.conversationId ?? "new"} (${plan.conversation.reason})`);
  console.log("steps:");
  for (const [index, step] of plan.steps.entries()) {
    console.log(`  ${index + 1}. ${step.tool}${step.resolve ? ` → resolve ${JSON.stringify(step.resolve)}` : ""}  # ${step.why}`);
  }
  console.log(`read-only surface: ${NOTEBOOK_READONLY_TOOLS.length} tools, nothing else is reachable`);
}
