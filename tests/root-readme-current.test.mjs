import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

test("root README identifies main and the current consolidation phase", () => {
  assert.match(readme, /\*\*`main` ist der kanonische Integrationsbranch\.\*\*/);
  assert.match(readme, /BusinessWebFactory braucht jetzt keine zweite Ausbauphase, sondern eine Konsolidierungsphase/);
  assert.doesNotMatch(readme, /Phase 0 \/ erster Slice/i);
  assert.doesNotMatch(readme, /nächste[rn]? Integrationsslice ersetzt\/erweitert .*Supabase/i);
});

test("root README exposes the real quality and database audit commands", () => {
  for (const command of [
    "npm run check",
    "npm run typecheck",
    "npm run audit:db",
    "npm run build:preview",
  ]) assert.match(readme, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("root README links the canonical Mcello and go-live evidence", () => {
  for (const target of [
    "docs/projects/mcello/DECISIONS.md",
    "docs/projects/mcello/ACCEPTANCE.md",
    "docs/projects/mcello/V1_EVIDENCE.md",
    "docs/projects/mcello/V1_DB_AUDIT.md",
    "Quellen/V1-GO-LIVE-INPUTS.md",
  ]) assert.match(readme, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
