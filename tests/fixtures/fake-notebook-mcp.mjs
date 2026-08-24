#!/usr/bin/env node
/*
 * A stub Gemini Notebook MCP over stdio.
 *
 * It exists so the read-only smoke harness can be tested for real -- protocol
 * framing, title resolution, async polling -- on a machine that has no
 * `notebooklm-mcp`, no Google session and no notebooks.
 *
 * It deliberately advertises write tools it will happily execute. That is the
 * point: the harness must never call one, and the test asserts on the audit log
 * this stub writes to $FAKE_MCP_AUDIT rather than trusting the harness.
 */

import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const AUDIT = process.env.FAKE_MCP_AUDIT || "";
const audit = (name) => {
  if (AUDIT) appendFileSync(AUDIT, `${name}\n`);
};

const NOTEBOOKS = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Mcelleo sein Hurensohn Design", source_count: 42 },
  { id: "22222222-2222-4222-8222-222222222222", title: "Doener — Project Research", source_count: 7 },
  { id: "33333333-3333-4333-8333-333333333333", title: "Doener Project Research", source_count: 3 },
];

const SOURCES = [
  { id: "s-1", title: "Builder Responsive V3", type: "pasted" },
  { id: "s-2", title: "WCAG 2.2 Target Size", type: "web" },
];

const READ_TOOLS = [
  "server_info", "notebook_list", "notebook_get", "notebook_describe",
  "source_describe", "source_get_content", "notebook_query",
  "notebook_query_start", "notebook_query_status", "chat_list", "chat_get", "chat_export",
];
/* Present on purpose, so "the harness never calls one" is a real assertion. */
const WRITE_TOOLS = ["notebook_create", "notebook_delete", "source_add", "source_delete", "research_import"];

let pollsLeft = Number(process.env.FAKE_MCP_POLLS ?? 2);

function handle(name, args) {
  audit(name);
  switch (name) {
    case "server_info":
      return {
        version: "0.9.14",
        latest_version: "0.9.20",
        update_available: true,
        update_command: "uv tool install --force notebooklm-mcp-cli==0.9.20",
        auth_status: "configured",
        capabilities: [...READ_TOOLS, ...WRITE_TOOLS],
      };
    case "notebook_list":
      return { notebooks: NOTEBOOKS };
    case "notebook_get":
      return { id: args?.notebook_id, sources: SOURCES };
    case "notebook_describe":
      return { summary: "Design- und Motion-Entscheidungen für Mcello.", topics: ["Motion", "A11y"] };
    case "source_describe":
      return { summary: "Landscape-only Builder auf Touch-Geräten.", keywords: ["responsive", "landscape"] };
    case "source_get_content":
      return { content: "BUILDER_RESPONSIVE_V3: touch devices are landscape-only." };
    case "notebook_query":
      return { answer: "Die wichtigsten Erkenntnisse: Motion bleibt progressive enhancement.", conversation_id: "c-1" };
    case "notebook_query_start":
      return { job_id: "job-1", status: "pending" };
    case "notebook_query_status":
      if (pollsLeft-- > 0) return { job_id: "job-1", status: "running" };
      return { job_id: "job-1", status: "completed", answer: "Fertige Analyse.", conversation_id: "c-1" };
    case "chat_list":
      return { conversations: [{ conversation_id: "c-1", title: "Erste Fragerunde" }] };
    case "chat_get":
      return { conversation_id: "c-1", messages: [{ role: "user", text: "Hi" }] };
    case "chat_export":
      return { format: args?.format ?? "md", content: "# Chat\n\n- Hi" };
    default:
      if (WRITE_TOOLS.includes(name)) return { mutated: true, tool: name };
      throw new Error(`unknown tool: ${name}`);
  }
}

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

createInterface({ input: process.stdin }).on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (message.id === undefined) return; // notification

  try {
    if (message.method === "initialize") {
      send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fake-notebook-mcp", version: "1" } } });
      return;
    }
    if (message.method === "tools/list") {
      send({ jsonrpc: "2.0", id: message.id, result: { tools: [...READ_TOOLS, ...WRITE_TOOLS].map((name) => ({ name })) } });
      return;
    }
    if (message.method === "tools/call") {
      const payload = handle(message.params?.name, message.params?.arguments ?? {});
      send({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } });
      return;
    }
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `unknown method: ${message.method}` } });
  } catch (error) {
    send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error.message } });
  }
});
