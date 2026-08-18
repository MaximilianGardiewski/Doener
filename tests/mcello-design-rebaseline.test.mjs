import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [decisions, acceptance, designAcceptance, masterplan, journeys, roadmap] = await Promise.all([
  read("docs/projects/mcello/DECISIONS.md"),
  read("docs/projects/mcello/ACCEPTANCE.md"),
  read("docs/projects/mcello/DESIGN_ACCEPTANCE.md"),
  read("docs/projects/mcello/DESIGN_MASTERPLAN.md"),
  read("docs/projects/mcello/USER_JOURNEYS.md"),
  read("Quellen/ROADMAP.md"),
]);

const combined = [acceptance, designAcceptance, masterplan, journeys, roadmap].join("\n");

test("design rebaseline keeps D065-D070 explicit and tracked", () => {
  for (let number = 65; number <= 70; number += 1) {
    const id = `D${String(number).padStart(3, "0")}`;
    assert.match(decisions, new RegExp(`\\| ${id} \\|`), `${id} missing from canonical decisions`);
    assert.match(combined, new RegExp(`\\b${id}\\b`), `${id} missing from design scope/acceptance/roadmap`);
  }
});

test("interactive builder remains a visual layer over existing domain authority", () => {
  assert.match(masterplan, /FoodStage/);
  assert.match(masterplan, /server-\/DB-autoritative Preise, Verfügbarkeit, Capacity, Ordering- und KDS-Invarianten bleiben autoritativ/);
  assert.match(decisions, /existing domain\/server pricing, availability and modifier rules remain authoritative/);
  assert.match(designAcceptance, /dupliziert keine Preisautorität/);
});

test("builder is tap-first and drag-and-drop is optional only", () => {
  assert.match(decisions, /Tap is always sufficient/);
  assert.match(masterplan, /Tap ist immer primär/);
  assert.match(masterplan, /Drag & Drop nur optionales Progressive Enhancement/);
  assert.match(designAcceptance, /Tap funktioniert vollständig ohne Drag & Drop/);
});

test("Mcello Originals start from the real standard recipe", () => {
  assert.match(decisions, /Genau so/);
  assert.match(decisions, /Anpassen/);
  assert.match(decisions, /standard configuration/);
  assert.match(journeys, /Builder startet vorbefüllt/);
});

test("visual integrity forbids fake documentary Mcello reality", () => {
  assert.match(decisions, /must not imply that generated food imagery is documentary Mcello reality/);
  assert.match(masterplan, /Keine erfundenen realen Mcello-Gerichte/);
  assert.match(designAcceptance, /Konzept-\/AI-Material ist sichtbar von echten Mcello-Assets getrennt/);
});

test("visual gates complement rather than replace technical evidence", () => {
  for (const gate of ["Gate A", "Gate B", "Gate C", "Gate D", "Gate E", "Gate F", "Gate G", "Gate H"]) {
    assert.match(masterplan, new RegExp(gate));
    assert.match(designAcceptance, new RegExp(gate));
  }
  assert.match(masterplan, /Ein technischer Test ersetzt kein visuelles Gate/);
});

test("design tools stay optional and outputs return to governed sources", () => {
  assert.match(decisions, /none may become a mandatory Mcello runtime\/deployment dependency/);
  assert.match(designAcceptance, /keine Runtime-Pflicht/);
  assert.match(masterplan, /keine neue zwingende SaaS-\/Runtime-Abhängigkeit/);
});
