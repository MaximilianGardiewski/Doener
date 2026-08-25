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
  assert.match(js, /KI-Zutatenvisualisierung · keine Produktfotografie/);
  assert.doesNotMatch(js, /\.checked\s*=|localStorage|sessionStorage|fetch\s*\(|cart\s*=|configuredPrice|configurationValid/);
});

test("flatbread uses explicit product-form metadata while Yufka never binds the pocket master", () => {
  assert.match(js, /const BUILDER_PRODUCT_FORMS = new Set\(\["flatbread-pocket", "yufka-wrap"\]\)/);
  assert.match(js, /modal\?\.dataset\.builderProductForm/);
  assert.match(js, /productForm === "flatbread-pocket"/);
  // D076 splits the bread into two masters so the filling sits between them.
  assert.match(js, /data-atomic-ingredient-host="ingredient\.flatbread\.base"/);
  assert.match(js, /data-atomic-ingredient-host="ingredient\.flatbread\.lid"/);
  assert.match(js, /productForm,/);
  assert.match(css, /data-builder-product-form="flatbread-pocket"/);
  assert.match(css, /data-flatbread-atomic-ready="true"/);
  assert.doesNotMatch(js, /(?:name|title|slug)[^\n]*includes\([^\n]*(?:fladenbrot|yufka)/i);
});

test("presentation assembly has distinct ingredient layers and purposeful lightweight motion", () => {
  for (const ingredient of ["Fladenbrot", "Fleisch", "Falafel", "Salat", "Tomate", "Gurke", "Zwiebel", "Curry", "Knoblauch", "Scharf"]) {
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

test("the blueprint HUD is decorative and cannot take a tap from a modifier option", () => {
  // aria-hidden in markup, pointer-transparent in CSS. Both halves are required:
  // one keeps it out of the accessibility tree, the other out of hit testing.
  assert.match(js, /class="mc-stage-hud mc-stage-hud--ground" aria-hidden="true"/);
  assert.match(js, /class="mc-stage-hud mc-stage-hud--brackets" aria-hidden="true"/);
  assert.match(js, /class="mc-stage-hud__annotations" aria-hidden="true"/);
  assert.match(css, /\.mc-stage-hud,[\s\S]*?\.mc-stage-hud__annotations \*\s*\{\s*pointer-events: none;/);

  /*
   * Drawn before the first layer host. That ordering is what lets the beams read
   * as passing through the stack: every master is a transparent PNG, so the
   * beams survive in the negative space instead of being covered wholesale.
   */
  // Compare the call sites inside stageMarkup, not the function definitions,
  // which appear earlier in the file and would make this pass for free.
  const stage = js.slice(js.indexOf("function stageMarkup()"));
  assert.ok(
    stage.indexOf("${hudGroundMarkup()}") < stage.indexOf('data-atomic-ingredient-host="ingredient.flatbread.base"'),
    "the HUD ground must be painted before the first layer host",
  );
  assert.ok(
    stage.indexOf("${hudBracketsMarkup()}") > stage.indexOf('data-atomic-ingredient-host="ingredient.flatbread.lid"'),
    "registration brackets must be painted after the last layer host",
  );

  // The readout is written from stage state, never hard-coded into the markup.
  assert.match(js, /function updateHudReadout\(root, counts\)/);
  assert.match(js, /stackExplodeSpan\(present\)/);
  assert.doesNotMatch(js, /Gesamthöhe\s*\d/);

  /*
   * No second palette. A literal colour is only allowed as the fallback inside
   * var(--token, …); anything else would be a new raw value, which
   * brand-system.css rules out until Visual Gate B approves a calibrated one.
   */
  const hudCss = css.slice(css.indexOf("Blueprint HUD and exploded stack"));
  const bareColours = hudCss
    .replace(/var\(--[a-z0-9-]+, *(?:#[0-9a-f]{3,8}|rgba?\([^)]*\))\)/gi, "")
    .match(/#[0-9a-f]{3,8}\b|\brgba?\(/gi);
  assert.equal(bareColours, null, `HUD colours must come from tokens, found: ${bareColours}`);
});

test("the exploded stack is presentation-only and never rides on the atomic host", () => {
  /*
   * A ready atomic host is pinned to `transform: none` so per-instance delta
   * animation stays the only motion inside it. The exploded offset therefore
   * has to live on a wrapper, or the two would fight.
   */
  assert.match(js, /function wrapStackShells\(root\)/);
  assert.match(js, /shell\.dataset\.stackShell = assetId/);
  assert.match(css, /\.mc-stack-shell \{[\s\S]*?transform: translateY\(calc\(var\(--stack-explode, 0\) \* var\(--shell-offset, 0px\)\)\)/);
  assert.match(css, /\[data-stack-state="exploded"\] \{ --stack-explode: 1; \}/);

  // Tap is always sufficient (D065), and the control reports its state.
  assert.match(js, /data-stage-stack-toggle/);
  assert.match(js, /toggle\.setAttribute\("aria-pressed"/);
  assert.match(css, /\.mc-stage-stack-toggle \{[\s\S]*?min-height: 44px;/);

  // Reduced motion reaches the same composition without the movement.
  assert.match(js, /if \(reducedMotionQuery\?\.matches\) \{\s*setStackState\(stageRoot, false\);/);
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.mc-stack-shell \{ transition: none !important; \}/);

  // Fanning the stack out must not touch selection or emit an ingredient delta.
  const setState = js.slice(js.indexOf("function setStackState"), js.indexOf("function ensureStage"));
  assert.doesNotMatch(setState, /reconcileAtomicIngredients|dispatchEvent|\.checked/);
});
