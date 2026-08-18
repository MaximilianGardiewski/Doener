import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const decisionsText = await readFile(new URL("docs/projects/mcello/DECISIONS.md", root), "utf8");
const acceptance = await readFile(new URL("docs/projects/mcello/ACCEPTANCE.md", root), "utf8");
const evidence = await readFile(new URL("docs/projects/mcello/V1_EVIDENCE.md", root), "utf8");

const allowedStatuses = new Set([
  "IMPLEMENT_V1",
  "PREPARE_NOW_IMPLEMENT_LATER",
  "LATER_OPTION",
]);

function parseDecisionRows() {
  return decisionsText.split("\n")
    .filter((line) => /^\| D\d{3} \|/.test(line))
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      assert.equal(cells.length, 4, `malformed decision row: ${line}`);
      const [id, topic, decision, rawStatus] = cells;
      const status = rawStatus.replaceAll("`", "");
      assert.ok(allowedStatuses.has(status), `unsupported status for ${id}: ${status}`);
      return { id, topic, decision, status };
    });
}

function section(text, heading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const next = text.indexOf("\n## ", start + heading.length);
  return text.slice(start, next === -1 ? text.length : next);
}

const decisions = parseDecisionRows();
const coveredText = `${acceptance}\n${evidence}`;
const acceptancePrepared = section(acceptance, "## Prepared now");
const evidencePrepared = section(evidence, "## Prepared-now Grenzen");
const checkedAcceptance = acceptance.split("\n").filter((line) => line.startsWith("- [x] ")).join("\n");
const completedEvidenceRows = evidence.split("\n")
  .filter((line) => /^\| D\d{3}/.test(line) && /\| `(VERIFIED|PREPARED)` \|/.test(line))
  .join("\n");

test("D062 ledger contains exactly the sequential D001-D074 decision set", () => {
  assert.equal(decisions.length, 74, `expected 74 decision rows, got ${decisions.length}`);
  assert.equal(new Set(decisions.map(({ id }) => id)).size, 74, "decision IDs must be unique");
  assert.deepEqual(
    decisions.map(({ id }) => id),
    Array.from({ length: 74 }, (_, index) => `D${String(index + 1).padStart(3, "0")}`),
  );
});

test("every IMPLEMENT_V1 decision is explicitly represented in acceptance or evidence", () => {
  for (const { id, status, topic } of decisions) {
    if (status !== "IMPLEMENT_V1") continue;
    assert.match(coveredText, new RegExp(`\\b${id}\\b`), `${id} (${topic}) disappeared from V1 acceptance/evidence`);
  }
});

test("every PREPARE_NOW_IMPLEMENT_LATER boundary is explicitly tracked as prepared", () => {
  for (const { id, status } of decisions) {
    if (status !== "PREPARE_NOW_IMPLEMENT_LATER") continue;
    assert.match(acceptancePrepared, new RegExp(`\\b${id}\\b`), `${id} missing from Acceptance Prepared now`);
    assert.match(evidencePrepared, new RegExp(`\\b${id}\\b`), `${id} missing from Evidence Prepared-now Grenzen`);
  }
});

test("LATER_OPTION decisions cannot be silently promoted into completed V1", () => {
  for (const { id, status } of decisions) {
    if (status !== "LATER_OPTION") continue;
    assert.doesNotMatch(checkedAcceptance, new RegExp(`\\b${id}\\b`), `${id} is LATER_OPTION but checked in V1 acceptance`);
    assert.doesNotMatch(completedEvidenceRows, new RegExp(`\\b${id}\\b`), `${id} is LATER_OPTION but marked VERIFIED/PREPARED`);
  }
});

test("every decision reference used by acceptance/evidence exists in the canonical ledger", () => {
  const canonicalIds = new Set(decisions.map(({ id }) => id));
  const usedIds = new Set([...coveredText.matchAll(/\bD\d{3}\b/g)].map((match) => match[0]));
  for (const id of usedIds) assert.ok(canonicalIds.has(id), `unknown decision reference in acceptance/evidence: ${id}`);
});
