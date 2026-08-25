import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ATOMIC_INGREDIENT_VISUALS,
  DONER_MEAT_VISUAL,
  FLATBREAD_VISUAL,
  TOMATO_EXTRA_VISUAL,
  TOMATO_VISUAL,
  atomicInstanceContribution,
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

test("the tomato layer and its extra overlay have deterministic instance plans", () => {
  assert.equal(TOMATO_VISUAL.assetId, "ingredient.tomato.layer");
  assert.equal(TOMATO_VISUAL.assetUrl, "/media/ingredients/ingredient.tomato.layer.png");
  assert.equal(TOMATO_EXTRA_VISUAL.assetId, "ingredient.tomato.layer.extra");
  assert.equal(TOMATO_EXTRA_VISUAL.assetUrl, "/media/ingredients/ingredient.tomato.layer.extra.png");

  /*
   * D076 stores one governed master per role, so the base master already depicts
   * the three slices that D075 rendered as three repeated instances. "Tomate" is
   * therefore one instance, and "Extra Tomate" is a separate overlay master on
   * its own host rather than two further instances of the base. The 3 -> 5 slice
   * intent survives inside the imagery; the runtime contract is now 1 + 1.
   */
  assert.equal(tomatoInstanceContribution("Tomate"), 1);
  assert.equal(tomatoInstanceContribution("Getrocknete Tomaten"), 0);
  assert.equal(tomatoInstanceCount(["Tomate"]), 1);
  assert.equal(tomatoInstanceCount(["Tomate", "Extra Tomate"]), 1, "extra never adds a second base instance");
  assert.equal(atomicInstanceContribution(TOMATO_EXTRA_VISUAL, "Extra Tomate"), 1);
  assert.equal(atomicInstanceContribution(TOMATO_EXTRA_VISUAL, "Tomate"), 0);

  // Extra Tomate is one delta on its own host: 0 -> 1 -> 0 against a stable key.
  const none = atomicInstancePlan(TOMATO_EXTRA_VISUAL, [], 0);
  assert.deepEqual(none.desiredKeys, []);

  const added = atomicInstancePlan(TOMATO_EXTRA_VISUAL, none.desiredKeys, 1);
  assert.deepEqual(added.desiredKeys, ["ingredient.tomato.layer.extra:0"]);
  assert.deepEqual(added.addedKeys, ["ingredient.tomato.layer.extra:0"]);
  assert.deepEqual(added.removedKeys, []);

  const removed = atomicInstancePlan(TOMATO_EXTRA_VISUAL, added.desiredKeys, 0);
  assert.deepEqual(removed.desiredKeys, []);
  assert.deepEqual(removed.addedKeys, []);
  assert.deepEqual(removed.removedKeys, ["ingredient.tomato.layer.extra:0"]);

  // Re-adding reuses the same key, so a rapid reversal cannot orphan a node.
  assert.deepEqual(atomicInstancePlan(TOMATO_EXTRA_VISUAL, [], 1), added);
  assert.deepEqual(tomatoInstancePlan([], 1), tomatoInstancePlan([], 1));
  assert.deepEqual(atomicInstancePlan(TOMATO_VISUAL, [], 1), tomatoInstancePlan([], 1));
  assert.equal(atomicInstanceCount(TOMATO_VISUAL, ["Tomate", "Extra Tomate"]), 1);
});

test("the FoodStage instantiates the governed tomato layer master as one SVG image", () => {
  assert.match(atomicRenderer, /createElementNS\(SVG_NS, "image"\)/);
  assert.match(atomicRenderer, /image\.setAttribute\("href", visual\.assetUrl\)/);
  assert.match(renderer, /data-atomic-ingredient-host="ingredient\.tomato\.layer"/);
  assert.match(atomicRenderer, /wrapper\.dataset\.ingredientInstanceKey/);
  assert.doesNotMatch(renderer, /mc-food-layer--tomate"[^\n]*<ellipse/);
  assert.doesNotMatch(renderer + atomicRenderer, /Math\.random/);
  assert.doesNotMatch(renderer + atomicRenderer + commerce, /priceDeltaCents|configuredPrice|basePrice|availability|soldOut/);
  assert.match(sw, /"\/ingredient-visuals\.js"/);
  const appShell = sw.slice(sw.indexOf("const APP_SHELL"), sw.indexOf("self.addEventListener(\"install\""));
  assert.doesNotMatch(appShell, /ingredient\.tomato\.layer\.png/, "large ingredient media must cache on demand");
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
  /*
   * D076 layer contract, in registry order. Kept as an explicit literal rather
   * than derived from the export, so an accidental registry edit fails here
   * instead of silently agreeing with itself.
   */
  const expectedAssetIds = [
    "ingredient.flatbread.base",
    "ingredient.sauce.garlic.layer",
    "ingredient.sauce.curry.layer",
    "ingredient.sauce.hot.layer",
    "ingredient.tomato.layer",
    "ingredient.tomato.layer.extra",
    "ingredient.cucumber.layer",
    "ingredient.onion.layer",
    "ingredient.meat.doner.layer",
    "ingredient.falafel.layer",
    "ingredient.lettuce.layer",
    "ingredient.flatbread.lid",
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

test("all twelve layer families have separate hosts and keep their vector fallback where one exists", () => {
  const hostIds = [...renderer.matchAll(/data-atomic-ingredient-host="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(hostIds.slice().sort(), [
    "ingredient.cucumber.layer",
    "ingredient.falafel.layer",
    "ingredient.flatbread.base",
    "ingredient.flatbread.lid",
    "ingredient.lettuce.layer",
    "ingredient.meat.doner.layer",
    "ingredient.onion.layer",
    "ingredient.sauce.curry.layer",
    "ingredient.sauce.garlic.layer",
    "ingredient.sauce.hot.layer",
    "ingredient.tomato.layer",
    "ingredient.tomato.layer.extra",
  ]);
  assert.equal(new Set(hostIds).size, 12, "every layer role owns its own host");

  /*
   * Filling and sauce hosts keep their inline illustration, so an option that
   * never resolves to a governed master still renders something. The CSS below
   * hides it again as soon as the atomic runtime reports ready.
   */
  assert.match(renderer, /ingredient\.lettuce\.layer"><path/);
  assert.match(renderer, /ingredient\.meat\.doner\.layer">\s*<path/);
  assert.match(renderer, /ingredient\.falafel\.layer">\s*<circle/);
  assert.match(renderer, /ingredient\.cucumber\.layer"><g/);
  assert.match(renderer, /ingredient\.onion\.layer"><g/);
  assert.match(renderer, /ingredient\.sauce\.curry\.layer"><path/);
  assert.match(renderer, /ingredient\.sauce\.garlic\.layer"><path/);
  assert.match(renderer, /ingredient\.sauce\.hot\.layer"><path/);

  /*
   * Bread and tomato hosts are deliberately empty. Under D076 the bread is
   * driven by product-form metadata and falls back to the separate vector
   * vessel, not to art inside the host; the tomato layers have no schematic
   * stand-in that would read as anything but a defect inside a photoreal stack.
   */
  for (const emptyHost of [
    "ingredient.flatbread.base",
    "ingredient.flatbread.lid",
    "ingredient.tomato.layer",
    "ingredient.tomato.layer.extra",
  ]) {
    assert.match(renderer, new RegExp(`data-atomic-ingredient-host="${emptyHost.replace(/\./g, "\\.")}"></g>`));
  }

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
