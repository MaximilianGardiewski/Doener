import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import {
  ATOMIC_INGREDIENT_VISUALS,
  DONER_MEAT_VISUAL,
  FLATBREAD_VISUAL,
  TOMATO_VISUAL,
  atomicInstanceCount,
  atomicInstancePlan,
  atomicProductFormContribution,
  tomatoInstanceContribution,
  tomatoInstanceCount,
  tomatoInstancePlan,
} from "../apps/mcello/public/ingredient-visuals.js";
import { shouldRemoveAtomicExit } from "../apps/mcello/public/atomic-ingredient-renderer.js";

const root = new URL("../", import.meta.url);
const renderer = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.js", root), "utf8");
const atomicRenderer = await readFile(new URL("apps/mcello/public/atomic-ingredient-renderer.js", root), "utf8");
const rendererCss = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.css", root), "utf8");
const motion = await readFile(new URL("apps/mcello/public/motion.js", root), "utf8");
const commerce = await readFile(new URL("apps/mcello/public/motion/commerce.js", root), "utf8");
const motionCss = await readFile(new URL("apps/mcello/public/motion.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("ingredient.tomato.slice has deterministic normal and extra instance plans", () => {
  assert.equal(TOMATO_VISUAL.assetId, "ingredient.tomato.slice");
  assert.equal(TOMATO_VISUAL.assetUrl, "/media/ingredients/ingredient.tomato.slice.png");
  assert.equal(tomatoInstanceContribution("Tomate"), 3);
  assert.equal(tomatoInstanceContribution("Extra Tomate"), 2);
  assert.equal(tomatoInstanceContribution("Getrocknete Tomaten"), 0);
  assert.equal(tomatoInstanceCount(["Tomate"]), 3);
  assert.equal(tomatoInstanceCount(["Tomate", "Extra Tomate"]), 5);

  const normal = tomatoInstancePlan([], 3);
  const extra = tomatoInstancePlan(normal.desiredKeys, 5);
  assert.deepEqual(extra.desiredKeys.slice(0, 3), normal.desiredKeys);
  assert.deepEqual(extra.addedKeys, ["ingredient.tomato.slice:3", "ingredient.tomato.slice:4"]);
  assert.deepEqual(extra.removedKeys, []);

  const removed = tomatoInstancePlan(extra.desiredKeys, 3);
  assert.deepEqual(removed.desiredKeys, normal.desiredKeys);
  assert.deepEqual(removed.addedKeys, []);
  assert.deepEqual(removed.removedKeys, ["ingredient.tomato.slice:3", "ingredient.tomato.slice:4"]);
  assert.deepEqual(tomatoInstancePlan([], 5), tomatoInstancePlan([], 5));
  assert.deepEqual(atomicInstancePlan(TOMATO_VISUAL, [], 5), tomatoInstancePlan([], 5));
  assert.equal(atomicInstanceCount(TOMATO_VISUAL, ["Tomate", "Extra Tomate"]), 5);
});

test("the existing FoodStage instantiates one canonical PNG instead of a finished tomato layer", () => {
  assert.match(atomicRenderer, /createElementNS\(SVG_NS, "image"\)/);
  assert.match(atomicRenderer, /image\.setAttribute\("href", visual\.assetUrl\)/);
  assert.match(renderer, /data-atomic-ingredient-host="ingredient\.tomato\.slice"/);
  assert.match(atomicRenderer, /wrapper\.dataset\.ingredientInstanceKey/);
  assert.doesNotMatch(renderer, /mc-food-layer--tomate"[^\n]*<ellipse/);
  assert.doesNotMatch(renderer + atomicRenderer, /Math\.random/);
  assert.doesNotMatch(renderer + atomicRenderer + commerce, /priceDeltaCents|configuredPrice|basePrice|availability|soldOut/);
  assert.match(sw, /"\/ingredient-visuals\.js"/);
  const appShell = sw.slice(sw.indexOf("const APP_SHELL"), sw.indexOf("self.addEventListener(\"install\""));
  assert.doesNotMatch(appShell, /ingredient\.tomato\.slice\.png/, "large ingredient media must cache on demand");
});

test("static slot transforms and delta animation live on separate SVG nodes", () => {
  assert.match(atomicRenderer, /wrapper\.setAttribute\("transform"/);
  assert.match(atomicRenderer, /image\.classList\.add\("mc-ingredient-instance__media"\)/);
  assert.match(rendererCss, /\[data-atomic-ingredient-host\][\s\S]*transition: none/);
  assert.match(rendererCss, /\.mc-ingredient-instance__media[\s\S]*transform-origin: center/);
  assert.match(atomicRenderer, /mcello:ingredient-visual-delta/);
  assert.match(motion, /animateIngredientBatch\(\{ changes, settle \}\)/);
  assert.match(commerce, /function animateIngredientBatch\(\{ changes, settle \}\)/);
  assert.match(commerce, /change\.selection === "added"[\s\S]*change\.instances/);
  assert.match(commerce, /batch\.settle\?\.\(\)/);
  assert.match(motionCss, /mcello-ingredient-instance-add/);
  assert.match(motionCss, /mcello-ingredient-instance-remove/);
  const reduced = motionCss.slice(motionCss.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.motion-ingredient-instance-change/);
  assert.match(reduced, /animation: none !important/);
});

test("governed ingredient families are ready while host filtering prevents unbound requests", () => {
  const ready = ATOMIC_INGREDIENT_VISUALS.filter((visual) => visual.runtimeReady);
  const expectedAssetIds = [
    "ingredient.tomato.slice",
    "ingredient.cucumber.slice",
    "ingredient.lettuce.iceberg.leaf",
    "ingredient.onion.ring",
    "ingredient.flatbread.pocket",
    "ingredient.sauce.garlic.ribbon",
    "ingredient.sauce.curry.ribbon",
    "ingredient.meat.doner.shaving",
    "ingredient.falafel.ball",
  ];
  assert.deepEqual(ATOMIC_INGREDIENT_VISUALS.map((visual) => visual.assetId), expectedAssetIds);
  assert.deepEqual(ready.map((visual) => visual.assetId), expectedAssetIds);
  assert.match(atomicRenderer, /visual\.runtimeReady === true[\s\S]*hosts\.has\(visual\.assetId\)/);
  assert.doesNotMatch(atomicRenderer, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.match(renderer, /acceptedOptionLabels\(groupMap\)/);
  assert.doesNotMatch(renderer, /groupsRoot\?\.querySelectorAll\("\.modifier-option"\)/);
});

test("flatbread is driven only by explicit product-form metadata", () => {
  assert.deepEqual(FLATBREAD_VISUAL.optionRules, []);
  assert.equal(atomicProductFormContribution(FLATBREAD_VISUAL, "flatbread-pocket"), 1);
  assert.equal(atomicProductFormContribution(FLATBREAD_VISUAL, "yufka-wrap"), 0);
  assert.equal(atomicInstanceCount(FLATBREAD_VISUAL, [], "flatbread-pocket"), 1);
  assert.equal(atomicInstanceCount(FLATBREAD_VISUAL, [], "yufka-wrap"), 0);
  assert.match(renderer, /productForm:?.*[\s\S]*reconcileAtomicIngredients|reconcileAtomicIngredients\(\{[\s\S]*productForm,/);
  assert.doesNotMatch(renderer, /productName|includes\([^\n]*(?:fladenbrot|yufka)/i);
});

test("all nine atomic families have separate fallback-safe hosts", () => {
  const hostIds = [...renderer.matchAll(/data-atomic-ingredient-host="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(hostIds.sort(), [
    "ingredient.cucumber.slice",
    "ingredient.falafel.ball",
    "ingredient.flatbread.pocket",
    "ingredient.lettuce.iceberg.leaf",
    "ingredient.meat.doner.shaving",
    "ingredient.onion.ring",
    "ingredient.sauce.curry.ribbon",
    "ingredient.sauce.garlic.ribbon",
    "ingredient.tomato.slice",
  ].sort());
  assert.equal(new Set(hostIds).size, 9);
  assert.match(renderer, /ingredient\.lettuce\.iceberg\.leaf"><path/);
  assert.match(renderer, /ingredient\.meat\.doner\.shaving">\s*<path/);
  assert.match(renderer, /ingredient\.falafel\.ball">\s*<circle/);
  assert.match(renderer, /ingredient\.cucumber\.slice"><g/);
  assert.match(renderer, /ingredient\.onion\.ring"><g/);
  assert.match(renderer, /ingredient\.sauce\.curry\.ribbon"><path/);
  assert.match(renderer, /ingredient\.sauce\.garlic\.ribbon"><path/);
  assert.match(rendererCss, /> :not\(\.mc-ingredient-instance\) \{\s*display: none;/);
  assert.match(rendererCss, /data-builder-product-form="flatbread-pocket"[\s\S]*data-flatbread-vector-fallback/);
});

test("an unmatched protein name keeps the legacy fallback instead of relabelling the Kalb master", () => {
  assert.equal(atomicInstanceCount(DONER_MEAT_VISUAL, ["Pute"]), 0);
  assert.match(atomicRenderer, /atomicRuntimeReady = desiredCount > 0 \? "true" : "false"/);
});

test("batch settlement is token-scoped and idempotent for rapid remove/add reversals", () => {
  assert.equal(shouldRemoveAtomicExit({ dataset: { instanceActive: "false", exitBatch: "batch-1" } }, "batch-1"), true);
  assert.equal(shouldRemoveAtomicExit({ dataset: { instanceActive: "true", exitBatch: "batch-1" } }, "batch-1"), false);
  assert.equal(shouldRemoveAtomicExit({ dataset: { instanceActive: "false", exitBatch: "batch-2" } }, "batch-1"), false);
  assert.match(atomicRenderer, /const detail = \{ batchId, changes, settle \}/);
  assert.match(atomicRenderer, /let settled = false[\s\S]*if \(settled\) return/);
  assert.match(atomicRenderer, /delete wrapper\.dataset\.exitBatch/);
  assert.equal((atomicRenderer.match(/dispatchEvent\(deltaEvent\)/g) || []).length, 1);
});

test("there is no separate Extra-Tomato asset file", async () => {
  const files = await readdir(new URL("data/mcello/ingredients/tomato/", root), { recursive: true });
  const assetFiles = files.filter((file) => /\.(?:png|webp|avif|jpe?g)$/i.test(file));
  assert.equal(assetFiles.some((file) => /extra[._ -]?tomat|tomat[._ -]?extra/i.test(file)), false);
  assert.equal(assetFiles.some((file) => /web[\\/]ingredient\.tomato/i.test(file)), false);
});
