import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const data = JSON.parse(await readFile(new URL("data/mcello/builder-presentation.v1.json", root), "utf8"));
const js = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

const doner = data.products.find((product) => product.categoryName === "Döner");
const yufka = data.products.find((product) => product.categoryName === "Yufka");

test("Döner/Yufka presentation remains scoped by exact local fixture product links", () => {
  assert.ok(doner?.productId);
  assert.ok(yufka?.productId);
  assert.equal(doner?.presentation?.kind, "doner-yufka");
  assert.equal(yufka?.presentation?.kind, "doner-yufka");
  assert.match(js, /productId/);
  assert.match(js, /presentation\.kind !== "doner-yufka"/);
});

test("local presentation adds basis and fresh assumptions without mutating provisional production seed", () => {
  for (const product of [doner, yufka]) {
    const basis = product?.modifierGroups.find((group) => group.name === "Basis");
    const veg = product?.modifierGroups.find((group) => group.name === "Gemüse");
    const sauce = product?.modifierGroups.find((group) => group.name === "Soße");
    assert.deepEqual(basis?.options.map((option) => [option.name, option.defaultSelected]), [["Fleisch", true], ["Falafel", false]]);
    assert.deepEqual(veg?.options.map((option) => [option.name, option.defaultSelected]), [["Salat", true], ["Tomate", true], ["Gurke", true], ["Zwiebel", true]]);
    assert.deepEqual(sauce?.options.map((option) => option.name), ["Curry", "Knoblauch", "Scharf"]);
  }
});

test("FoodStage mirrors actual checked modifier inputs and never owns commerce state", () => {
  assert.match(js, /#modifierGroups input:checked/);
  assert.match(js, /syncFoodStage/);
  assert.match(js, /MutationObserver/);
  assert.doesNotMatch(js, /fetch\s*\(|localStorage|basePrice|configuredPrice|unitPrice/);
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

test("Döner/Yufka presentation code remains in refreshed offline shell while business data stays network-only", () => {
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /doner-yufka-builder-v2\.js/);
  assert.match(sw, /doner-yufka-builder-v2\.css/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});