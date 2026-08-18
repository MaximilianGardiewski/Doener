import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const js = await readFile(new URL("apps/mcello/public/pizza-builder-v2.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/pizza-builder-v2.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const seed = JSON.parse(await readFile(new URL("data/mcello/menu-seed.provisional.json", root), "utf8"));
const presentation = JSON.parse(await readFile(new URL("data/mcello/builder-presentation.v1.json", root), "utf8"));
const docs = await readFile(new URL("docs/projects/mcello/PIZZA_PRESENTATION_BUILDER_V1.md", root), "utf8");

test("Pizza Builder activation follows the visible first-party Pizza category and structured presentation group", () => {
  assert.ok(seed.categories.some(([id]) => id === "pizza"));
  assert.match(js, /activeCategorySlug\(\) === "pizza"/);
  assert.match(js, /presentationToppingGroup/);
  assert.match(js, /dataset\.productBuilder = "pizza"/);
});

test("base provisional Pizza remains modifier-empty while localhost presentation data supplies exactly five supported Pizza Mcello ingredients", () => {
  const pizzaItems = seed.items.filter(([, category]) => category === "pizza");
  assert.ok(pizzaItems.length > 0);
  assert.ok(pizzaItems.every((item) => Array.isArray(item[5]) && item[5].length === 0));
  assert.equal(presentation.pizza.productSourceId, "pizza-076");
  assert.equal(seed.items.find((item) => item[0] === "pizza-076")?.[2], "Pizza Mcello");
  assert.deepEqual(presentation.pizza.groups[0].options.map((option) => option.name), ["Kebab Fleisch", "Tomaten", "Broccoli", "Käse", "Zwiebeln"]);
  assert.match(js, /Kebab Fleisch.*Tomaten.*Broccoli.*Käse.*Zwiebeln/s);
});

test("Pizza presentation compositor derives visual layer count from existing checked inputs without owning selections", () => {
  assert.match(js, /selectedPresentationIngredients/);
  assert.match(js, /querySelector\("input"\)\?\.checked/);
  assert.match(js, /dataset\.pizzaVisualLayers = String\(selected\.size\)/);
  assert.match(js, /data:image\/svg\+xml/);
  assert.match(js, /pizzaPreview = "schematic"/);
  assert.doesNotMatch(js, /\.checked\s*=|localStorage|sessionStorage|fetch\s*\(|cart\s*=|configuredPrice|configurationValid/);
  assert.match(docs, /schematic/i);
  assert.match(docs, /normal Mcello modifier inputs/);
});

test("Pizza presentation is visually specialized and never loads remote concept media", () => {
  assert.match(css, /data-product-builder="pizza"/);
  assert.match(css, /data-pizza-presentation="true"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(js + css, /https:\/\//i);
  assert.doesNotMatch(js + css, /adobe|firefly|photoshop-api|short-url/i);
});

test("Pizza Builder remains offline-capable while business data stays network-only", () => {
  assert.match(sw, /mcello-public-shell-v16/);
  assert.match(sw, /"\/pizza-builder-v2\.js"/);
  assert.match(sw, /"\/pizza-builder-v2\.css"/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});
