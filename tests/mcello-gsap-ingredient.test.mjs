import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const motion = await readFile(new URL("apps/mcello/public/motion.js", root), "utf8");
const commerce = await readFile(new URL("apps/mcello/public/motion/commerce.js", root), "utf8");
const app = await readFile(new URL("apps/mcello/public/app.js", root), "utf8");
const pizza = await readFile(new URL("apps/mcello/public/pizza-builder-v2.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/motion.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("Phase 3 ingredient migration observes application-validated modifier state", () => {
  assert.match(app, /function handleModifierChange\(input\)/);
  assert.match(app, /group\.maxSelections === 1/);
  assert.match(app, /selection\.optionIds = input\.checked/);
  assert.match(app, /input\.checked = false/);
  assert.match(app, /updateAddButton\(\)/);
  assert.match(motion, /const selection = input\.checked \? "added" : "removed"/);
  assert.match(motion, /commerceMotionV3\?\.animateIngredientChange/);
  assert.doesNotMatch(commerce, /optionIds|maxSelections|minSelections|configurationValid|configuredPrice|state\./);
});

test("FoodStage targeting prefers the rich Doner/Yufka stage and never double-writes the Pizza stage", () => {
  assert.match(motion, /function activeFoodStage\(\)/);
  assert.match(motion, /data-food-stage-v4/);
  assert.match(motion, /if \(document\.querySelector\("#productModal\.open \[data-pizza-stage\]"\)\) return null/);
  assert.match(motion, /return document\.querySelector\("#productModal\.open \.modal-hero"\)/);
  assert.match(pizza, /function pulseStage\(\)/);
  assert.match(pizza, /foodStage\.animate\?\./);
});

test("GSAP ingredient feedback mirrors the bounded V2 option and FoodStage language", () => {
  assert.match(commerce, /function animateIngredientChange/);
  assert.match(commerce, /selection !== "added" && selection !== "removed"/);
  assert.match(commerce, /selection === "added" \? 1\.018 : 0\.985/);
  assert.match(commerce, /selection === "added" \? 1\.012 : 0\.992/);
  assert.match(commerce, /opacity: 0\.88/);
  assert.match(commerce, /duration: 0\.16/);
  assert.match(commerce, /duration: 0\.2/);
  assert.match(motion, /motion-ingredient-change/);
  assert.match(motion, /motion-food-stage-change/);
  assert.doesNotMatch(commerce, /width\s*:|height\s*:|top\s*:|left\s*:|margin\s*:|padding\s*:/);
  assert.doesNotMatch(commerce, /repeat:\s*(?:-1|Infinity)|ScrollTrigger|Flip/);
});

test("GSAP ingredient frames isolate CSS contention and clean repeated transitions", () => {
  assert.match(css, /\[data-motion-ingredient-engine="gsap"\]/);
  assert.match(commerce, /let ingredientTransition = null/);
  assert.match(commerce, /clearIngredientPresentation/);
  assert.match(commerce, /timeline\.kill\(\)/);
  assert.match(commerce, /delete option\.dataset\.motionIngredientEngine/);
  assert.match(commerce, /delete foodStage\.dataset\.motionIngredientEngine/);
  assert.match(commerce, /clearProps: "opacity,transform"/);
});

test("Reduced Motion blocks GSAP ingredient feedback and leaves legacy keyframes as no-op", () => {
  assert.match(motion, /!reducedMotion\.matches && Boolean\(commerceMotionV3\?\.animateIngredientChange/);
  assert.match(motion, /dataset\.mcelloIngredientEngine = mode/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.motion-ingredient-change/);
  assert.match(reduced, /\.motion-food-stage-change/);
  assert.match(reduced, /animation: none !important/);
});

test("ingredient motion stays presentation-only and available offline", () => {
  assert.doesNotMatch(commerce, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(commerce, /\/api\/|\/rest\/|supabase|\.rpc\s*\(/i);
  assert.doesNotMatch(commerce, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(commerce, /basePrice|unitPrice|checkout|availability|sold.?out|authorization|locationId/i);
  // Bumped with the shell whenever a cached Builder/FoodStage asset changes.
  /*
   * The cache name is asserted as versioned, not as one exact version. Pinning
   * the number made an unrelated test fail on every shell bump -- which it just
   * did -- while proving nothing: the guarantee here is that the motion runtime
   * is in the precache list, and that is asserted directly below.
   */
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /"\/motion\/commerce\.js"/);
  assert.match(sw, /"\/vendor\/gsap\/gsap\.min\.js"/);
});

test("atomic ingredient events normalize legacy single deltas and simultaneous batch changes", () => {
  assert.match(motion, /mcello:ingredient-visual-delta/);
  assert.match(motion, /Array\.isArray\(detail\?\.changes\) \? detail\.changes : \[detail\]/);
  assert.match(motion, /animateIngredientBatch\(\{ changes, settle \}\)/);
  assert.match(motion, /if \(option\?\.dataset\.atomicIngredient\) return/);
  assert.match(commerce, /function animateIngredientBatch/);
  assert.match(commerce, /const activeIngredientBatches = new Map\(\)/);
  assert.match(commerce, /change\.selection === "added"/);
  assert.match(commerce, /timeline\.fromTo\(/);
  assert.match(commerce, /timeline\.to\(/);
  assert.doesNotMatch(commerce, /Math\.random/);
});

test("ingredient batches are overlap-safe and clean SVG presentation residue centrally", () => {
  assert.match(commerce, /function ingredientBatchesOverlap/);
  assert.match(commerce, /settleIngredientBatch\(batch\)/);
  assert.match(commerce, /function clearIngredientInstancePresentation/);
  assert.match(commerce, /clearProps: "opacity,transform,transformOrigin"/);
  assert.match(commerce, /removeAttribute\?\.\("data-svg-origin"\)/);
  assert.match(commerce, /removeAttribute\?\.\("style"\)/);
  assert.match(commerce, /delete instance\.dataset\.motionIngredientBatch/);
});

test("Reduced Motion settles live GSAP and CSS ingredient batches without disabling later motion", () => {
  assert.match(motion, /const handleCommerceMotionPreferenceChange = \(\) =>/);
  assert.match(motion, /if \(!reducedMotion\.matches\) return/);
  assert.match(motion, /commerceMotionV3\?\.settleIngredientBatches\?\.\(\)/);
  assert.match(motion, /settleFallbackIngredientBatches\(\)/);
  assert.match(motion, /const fallbackIngredientBatches = new Map\(\)/);
  assert.match(motion, /settleOverlappingFallbackIngredientBatches\(changes\)/);
  assert.match(css, /motion-ingredient-instance-change\[data-motion-ingredient-batch\]/);
});
