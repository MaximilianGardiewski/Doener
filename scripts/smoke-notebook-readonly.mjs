#!/usr/bin/env node
/*
 * Read-only smoke test against the real Gemini Notebook MCP.
 *
 * Speaks the actual stdio JSON-RPC protocol, not a mock: it initializes, reads
 * `tools/list`, resolves a notebook by title and asks it one question. Every
 * outbound call goes through `assertReadOnly`, so this harness cannot mutate a
 * notebook even if it is pointed at a server that offers write tools.
 *
 * Without `notebooklm-mcp` on PATH it reports SKIPPED and exits 0 -- a remote
 * container has neither the binary nor the Google session, and pretending
 * otherwise would be worse than saying so.
 *
 *   node scripts/smoke-notebook-readonly.mjs
 *   node scripts/smoke-notebook-readonly.mjs --notebook "Doener — Project Research"
 */

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createInterface } from "node:readline";

import {
  assertReadOnly,
  resolveNotebook,
  formatNotebookList,
  formatCandidates,
  interpretServerInfo,
  interpretQueryStatus,
  shouldUseAsyncQuery,
  nextPollDelayMs,
  NOTEBOOK_READONLY_TOOLS,
} from "./lib/notebook-research-router.mjs";

const run = promisify(execFile);
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const NOTEBOOK = argValue("--notebook", "Mcelleo sein Hurensohn Design");
const QUESTION = argValue("--question", "Fasse die wichtigsten Erkenntnisse zusammen.");
const COMMAND = argValue("--command", "notebooklm-mcp");

/**
 * Resolves a command to the absolute path PATH would pick.
 *
 * `where` returns every hit, one per line; the first is the one that would run.
 * Resolving rather than just testing matters on Windows: `uv tool install` can
 * leave a `.cmd` shim, and Node's spawn without a shell fails on those with
 * ENOENT -- which would break this script on exactly the machine it is for.
 */
async function resolveCommand(name) {
  /* An explicit path (from --command) needs no lookup. */
  if (name.includes("/") || name.includes("\\")) return { path: name, shell: false };
  try {
    const { stdout } = await run(process.platform === "win32" ? "where" : "which", [name]);
    const first = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
    if (!first) return null;
    return { path: first, shell: /\.(cmd|bat)$/i.test(first) };
  } catch {
    return null;
  }
}

const resolved = await resolveCommand(COMMAND);

if (!resolved) {
  console.log(`SKIPPED: ${COMMAND} is not on PATH — no local Gemini Notebook MCP to smoke-test.`);
  console.log("         Run this on the machine that holds the Google session (npm run setup:research).");
  process.exit(0);
}

/* ------------------------------------------------------- stdio JSON-RPC --- */

const child = spawn(resolved.path, [], { stdio: ["pipe", "pipe", "pipe"], shell: resolved.shell });
const pending = new Map();
let nextId = 1;

createInterface({ input: child.stdout }).on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
});

child.stderr.on("data", (chunk) => process.stderr.write(`[mcp] ${chunk}`));

/* Without this a spawn failure is an uncaught exception instead of a report. */
child.on("error", (error) => {
  console.log(`FAIL  could not start ${resolved.path} — ${error.message}`);
  process.exit(1);
});

function request(method, params, timeoutMs = 180000) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
  });
}

/** The only way this harness reaches a tool. Nothing off the surface gets sent. */
async function call(tool, args = {}) {
  assertReadOnly(tool);
  const result = await request("tools/call", { name: tool, arguments: args });
  const text = result?.content?.map((part) => part?.text).filter(Boolean).join("\n") ?? "";
  try {
    return { data: JSON.parse(text), text };
  } catch {
    return { data: null, text };
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const listOf = (payload) =>
  Array.isArray(payload) ? payload : payload?.notebooks ?? payload?.items ?? payload?.results ?? [];

let failures = 0;
const step = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

try {
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "doener-readonly-smoke", version: "1" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const tools = (await request("tools/list", {}))?.tools ?? [];
  const names = tools.map((tool) => tool?.name).filter(Boolean);
  const missing = NOTEBOOK_READONLY_TOOLS.filter((tool) => !names.includes(tool));
  step("tools/list reachable", names.length > 0, `${names.length} tools upstream`);
  step(
    "every read-only tool this integration routes to exists upstream",
    missing.length === 0,
    missing.length ? `missing: ${missing.join(", ")}` : "12/12",
  );

  const info = interpretServerInfo((await call("server_info")).data ?? {});
  step("server_info", true, `version ${info.installed ?? "?"}, auth ${info.auth.state}`);
  if (info.updateHint) console.log(`      ${info.updateHint}`);
  if (info.withheld.length) console.log(`      upstream offers but this integration never routes to: ${info.withheld.join(", ")}`);

  const notebooks = listOf((await call("notebook_list")).data);
  step("notebook_list", notebooks.length > 0, `${notebooks.length} notebooks`);
  console.log(formatNotebookList(notebooks).split("\n").map((line) => `      ${line}`).join("\n"));

  const match = resolveNotebook(NOTEBOOK, notebooks);
  step(`resolve ${JSON.stringify(NOTEBOOK)}`, match.status === "resolved", match.status === "ambiguous" ? `ambiguous:\n${formatCandidates(match.candidates)}` : match.matchedBy ?? match.reason);

  if (match.status === "resolved") {
    const notebookId = match.item.id ?? match.item.notebook_id;
    const detail = (await call("notebook_get", { notebook_id: notebookId })).data;
    const sources = listOf(detail?.sources ?? detail);
    step("notebook_get", true, `${sources.length} sources`);

    await call("notebook_describe", { notebook_id: notebookId });
    step("notebook_describe", true);

    const decision = shouldUseAsyncQuery({ sourceCount: sources.length, question: QUESTION });
    console.log(`      query path: ${decision.async ? "async" : "sync"} (${decision.reason})`);

    if (!decision.async) {
      const answer = (await call("notebook_query", { notebook_id: notebookId, question: QUESTION })).text;
      step("notebook_query", answer.length > 0, `${answer.length} chars`);
    } else {
      const started = (await call("notebook_query_start", { notebook_id: notebookId, question: QUESTION })).data;
      const jobId = started?.job_id ?? started?.id ?? started?.query_id;
      step("notebook_query_start", Boolean(jobId), `job ${jobId ?? "(none)"}`);
      const began = Date.now();
      for (let attempt = 0; jobId; attempt += 1) {
        await sleep(nextPollDelayMs(attempt));
        const status = interpretQueryStatus((await call("notebook_query_status", { job_id: jobId })).data, {
          elapsedMs: Date.now() - began,
          attempt,
        });
        if (status.done) {
          step("notebook_query_status reached a terminal state", status.state === "completed", status.state);
          break;
        }
      }
    }
  }
} catch (error) {
  step("smoke run", false, error.message);
} finally {
  child.kill();
}

console.log(failures === 0 ? "\nRead-only smoke test passed. No mutating call was made." : `\n${failures} step(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
