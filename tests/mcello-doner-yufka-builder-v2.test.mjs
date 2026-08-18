import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const js = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const seed = JSON.parse(await readFile(new URL("data/mcello/menu-seed.provisional.json", root), "utf8"));
const presentation = JSON.parse(await readFile(new URL("data/mcello/builder-presentation.v1.json", root), "utf8"));
const docs = await readFile(new URL("docs/projects/mcello/DONER_YUFKA_PRESENTATION_BUILDER_V1.md", root), "utf8");

const ids = ["warm-013","warm-014","warm-015","warm-016","warm-017","warm-018"];

test("Döner/Yufka presentation remains scoped by exact local fixture product links", () => {
  const seeded = new Map(seed.items.map((item) => [item[0], item]));
  assert.deepEqual(presentation.donerYufka.productSourceIds, ids);
  for (const id of ids) assert.ok(seeded.has(id));
  assert.match(js, /presentationSauceGroup/);
  assert.match(js, /dataset\.productBuilder = "doner-yufka"/);
});

test("base provisional products stay modifier-empty while local presentation data contains only confirmed sauces", () => {
  const selected = seed.items.filter((item) => ids.includes(item[0]));
  assert.ok(selected.every((item) => Array.isArray(item[5]) && item[5].length === 0));
  assert.deepEqual(presentation.donerYufka.groups[0].options.map((option) => option.name), ["Curry", "Knoblauch", "Scharf"]);
  assert.match(js, /Curry.*Knoblauch.*Scharf/s);
});

test("assembly compositor reads real checked sauce inputs and does not own commerce state", () => {
  assert.match(js, /selectedPresentationSauces/);
  assert.match(js, /querySelector\("input"\)\?\.checked/);
  assert.match(js, /dataset\.assemblyVisualLayers = String\(selected\.size\)/);
  assert.match(js, /assemblyPreview = "schematic"/);
  assert.match(js, /data:image\/svg\+xml/);
  assert.doesNotMatch(js, /\.checked\s*=|localStorage|sessionStorage|fetch\s*\(|cart\s*=|configuredPrice|configurationValid/);
  assert.match(docs, /Curry/);
  assert.match(docs, /Knoblauch/);
  assert.match(docs, /Scharf/);
});

test("assembly specialization stays visually distinct from Pizza top-down", () => {
  assert.match(css, /data-product-builder="doner-yufka"/);
  assert.match(css, /perspective\(900px\)/);
  assert.match(css, /data-assembly-presentation="true"/);
  assert.doesNotMatch(css, /data-pizza-stage|top-down/);
  assert.doesNotMatch(js + css, /https:\/\//i);
  assert.doesNotMatch(js + css, /adobe|firefly|photoshop-api|short-url/i);
});

test("Döner/Yufka assets remain in the versioned offline shell while business data stays network-only", () => {
  assert.match(sw, /mcello-public-shell-v17/);
  assert.match(sw, /doner-yufka-builder-v2\.js/);
  assert.match(sw, /doner-yufka-builder-v2\.css/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});
