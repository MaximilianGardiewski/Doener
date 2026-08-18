import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const js = await readFile(new URL("apps/mcello/public/pizza-builder-v2.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/pizza-builder-v2.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const docs = await readFile(new URL("docs/projects/mcello/PIZZA_BUILDER_V2.md", root), "utf8");
const seed = JSON.parse(await readFile(new URL("data/mcello/menu-seed.provisional.json", root), "utf8"));

test("Pizza Builder activates only from the existing first-party pizza category", () => {
  assert.ok(seed.categories.some(([id]) => id === "pizza"));
  assert.match(js, /activeCategoryId\(\) === "pizza"/);
  assert.match(js, /dataset\.productBuilder = "pizza"/);
});

test("current Pizza layer count stays zero because first-party Pizza has no structured modifiers", () => {
  const pizzaItems = seed.items.filter(([, category]) => category === "pizza");
  assert.ok(pizzaItems.length > 0);
  assert.ok(pizzaItems.every((item) => Array.isArray(item[5]) && item[5].length === 0));
  assert.match(js, /dataset\.pizzaVisualLayers = "0"/);
  assert.match(docs, /zero ingredient visual layers/);
});

test("Pizza specialization is visual only and does not invent ingredient or commerce state", () => {
  assert.doesNotMatch(js, /price|localStorage|sessionStorage|fetch\s*\(|cart\s*=|availableNow|soldOut/i);
  assert.doesNotMatch(js + css, /salami|käse|tomate|sauce|zwiebel|champignon/i);
  assert.match(css, /data-product-builder="pizza"/);
  assert.match(css, /data-pizza-visual-layers="0"/);
});

test("Pizza Builder remains offline-capable while business data stays network-only", () => {
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /"\/pizza-builder-v2\.js"/);
  assert.match(sw, /"\/pizza-builder-v2\.css"/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});
