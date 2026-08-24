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

test("Döner/Yufka presentation remains scoped by exact local fixture product links", () => {
  const seeded = new Map(seed.items.map((item) => [item[0], item]));
  assert.deepEqual(presentation.donerYufka.productSourceIds, ids);
  for (const id of ids) assert.ok(seeded.has(id));
  assert.match(js, /presentationGroupMap/);
  assert.match(js, /dataset\.productBuilder = "doner-yufka"/);
  assert.match(js, /Basis/);
  assert.match(js, /Gemüse/);
  assert.match(js, /Soße/);
});

test("local presentation adds basis and fresh assumptions without mutating provisional production seed", () => {
  const selected = seed.items.filter((item) => ids.includes(item[0]));
  assert.ok(selected.every((item) => Array.isArray(item[5]) && item[5].length === 0));
  assert.deepEqual(groupByName.get("Basis").options.map((option) => option.name), ["Fleisch", "Falafel"]);
  assert.deepEqual(groupByName.get("Gemüse").options.map((option) => option.name), ["Salat", "Tomate", "Gurke", "Zwiebel"]);
  assert.deepEqual(groupByName.get("Soße").options.map((option) => option.name), ["Curry", "Knoblauch", "Scharf"]);
  assert.match(presentation.notes.join("\n"), /presentation assumptions/i);
});

test("FoodStage mirrors actual checked modifier inputs and never owns commerce state", () => {
  assert.match(js, /querySelector\("input"\)/);
  assert.match(js, /input\?\.checked/);
  assert.match(js, /data-food-layer/);
  assert.match(js, /dataset\.assemblyVisualLayers/);
  assert.match(js, /Stilisierte Präsentationsillustration/);
  assert.doesNotMatch(js, /\.checked\s*=|localStorage|sessionStorage|fetch\s*\(|cart\s*=|configuredPrice|configurationValid/);
});

test("cartoon assembly has distinct ingredient layers and purposeful lightweight motion", () => {
  for (const ingredient of ["Fleisch", "Falafel", "Salat", "Tomate", "Gurke", "Zwiebel", "Curry", "Knoblauch", "Scharf"]) {
    assert.match(js, new RegExp(`data-food-layer=\\"${ingredient}\\"`));
  }
  assert.match(css, /mc-food-stage-v4/);
  assert.match(css, /transform/);
  assert.match(css, /opacity/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /Stilisierte|illustration/i);
  assert.doesNotMatch(js + css, /https:\/\//i);
  assert.doesNotMatch(js + css, /firefly|photoshop-api|short-url/i);
});

test("SauceDeck keeps one visual sauce plane and deterministically redistributes one to three sauces", () => {
  assert.match(js, /data-sauce-deck/);
  assert.match(js, /const SAUCE_LAYER_NAMES = Object\.freeze\(\["Curry", "Knoblauch", "Scharf"\]\)/);
  assert.match(js, /const SAUCE_LAYOUTS = Object\.freeze/);
  assert.match(js, /1: Object\.freeze\(\[\{ x: 0, y: 0, scaleX: 1/);
  assert.match(js, /2: Object\.freeze\(\[/);
  assert.match(js, /3: Object\.freeze\(\[/);
  assert.match(js, /function updateSauceDeck/);
  assert.match(js, /dataset\.sauceSlot/);
  assert.match(js, /dataset\.sauceCount/);
  assert.match(js, /dataset\.assemblySauceCount/);
  assert.match(js, /layer\.style\.transform = sauceTransform/);
  assert.doesNotMatch(js, /Math\.random/);
});

test("Döner/Yufka presentation code remains in refreshed offline shell while business data stays network-only", () => {
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /doner-yufka-builder-v2\.js/);
  assert.match(sw, /doner-yufka-builder-v2\.css/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});
