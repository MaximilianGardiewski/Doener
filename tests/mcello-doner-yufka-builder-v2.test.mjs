import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const js = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const seed = JSON.parse(await readFile(new URL("data/mcello/menu-seed.provisional.json", root), "utf8"));
const presentation = JSON.parse(await readFile(new URL("data/mcello/builder-presentation.v1.json", root), "utf8"));

const ids = ["warm-013","warm-014","warm-015","warm-016","warm-017","warm-018"];
const groupByName = new Map(presentation.donerYufka.groups.map((group) => [group.name, group]));
const imageLayers = ["upper-pide","lower-pide","veal","tomato","cucumber","red-onion","iceberg-lettuce","garlic-sauce","spicy-sauce"];

test("Pide FoodStage is scoped to Fladenbrot variants, not Yufka", () => {
  const seeded = new Map(seed.items.map((item) => [item[0], item]));
  assert.deepEqual(presentation.donerYufka.productSourceIds, ids);
  for (const id of ids) assert.ok(seeded.has(id));
  assert.match(js, /new Set\(\["warm-013", "warm-014", "warm-015"\]\)/);
  assert.doesNotMatch(js, /warm-016|warm-017|warm-018/);
  assert.match(js, /presentationGroupMap/);
  assert.match(js, /dataset\.productBuilder = "doner-yufka"/);
});

test("local presentation groups remain assumptions and do not mutate the provisional menu seed", () => {
  const selected = seed.items.filter((item) => ids.includes(item[0]));
  assert.ok(selected.every((item) => Array.isArray(item[5]) && item[5].length === 0));
  assert.deepEqual(groupByName.get("Basis").options.map((option) => option.name), ["Fleisch", "Falafel"]);
  assert.deepEqual(groupByName.get("Gemüse").options.map((option) => option.name), ["Salat", "Tomate", "Gurke", "Zwiebel"]);
  assert.deepEqual(groupByName.get("Soße").options.map((option) => option.name), ["Curry", "Knoblauch", "Scharf"]);
  assert.match(presentation.notes.join("\n"), /presentation assumptions/i);
});

test("FoodStage mirrors checked modifier inputs and never owns commerce state", () => {
  assert.match(js, /querySelector\("input"\)/);
  assert.match(js, /input\?\.checked/);
  assert.match(js, /data-food-layer/);
  assert.match(js, /data-food-callout-for/);
  assert.match(css, /mc-food-stage-v4__callout/);
  assert.match(js, /dataset\.assemblyVisualLayers/);
  assert.match(js, /KI-Konzeptvisualisierung/);
  assert.doesNotMatch(js, /\.checked\s*=|localStorage|sessionStorage|fetch\s*\(|cart\s*=|configuredPrice|configurationValid/);
});

test("cinematic layer stack uses all nine local WebP assets and reduced-motion support", () => {
  for (const layer of imageLayers) assert.match(js, new RegExp('id: "' + layer + '"'));
  assert.match(css, /mix-blend-mode:\s*screen/);
  assert.match(css, /data-builder-orientation="portrait"/);
  assert.match(css, /visibility:\s*visible\s*!important/);
  assert.match(css, /pointer-events:\s*auto\s*!important/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(sw, /mcello-public-shell-v36/);
  for (const file of ["upper-pide.webp","lower-pide.webp","veal-doner.webp","tomato.webp","cucumber.webp","red-onion.webp","iceberg-lettuce.webp","garlic-sauce.webp","spicy-sauce.webp"]) {
    assert.ok(sw.includes("/media/concept/doner-v2/" + file));
  }
  assert.doesNotMatch(js + css, /Stilisierte Präsentationsillustration|https:\/\//i);
});

test("the existing adapter remains the single active FoodStage implementation", () => {
  assert.match(sw, /doner-yufka-builder-v2\.js/);
  assert.match(sw, /doner-yufka-builder-v2\.css/);
  assert.doesNotMatch(sw, /doner-yufka-cinematic-stage/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});
