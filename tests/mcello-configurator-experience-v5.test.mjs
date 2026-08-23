import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const app = await readFile(new URL("apps/mcello/public/app.js", root), "utf8");
const builder = await readFile(new URL("apps/mcello/public/builder-core-v2.js", root), "utf8");
const builderCss = await readFile(new URL("apps/mcello/public/builder-core-v2.css", root), "utf8");
const doner = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.js", root), "utf8");
const donerCss = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.css", root), "utf8");
const pizza = await readFile(new URL("apps/mcello/public/pizza-builder-v2.js", root), "utf8");
const styles = await readFile(new URL("apps/mcello/public/styles.css", root), "utf8");

test("the application publishes structured presentation metadata on the real modifier markup", () => {
  for (const attribute of [
    'data-group-id="\\$\\{esc\\(group\\.id\\)\\}"',
    'data-group-name="\\$\\{esc\\(group\\.name\\)\\}"',
    'data-required="\\$\\{required\\}"',
    'data-min-selections="\\$\\{group\\.minSelections\\}"',
    'data-max-selections="\\$\\{group\\.maxSelections\\}"',
    'data-option-name="\\$\\{esc\\(option\\.name\\)\\}"',
    'data-price-delta-cents="\\$\\{option\\.priceDeltaCents\\}"',
    'data-default-selected="\\$\\{Boolean\\(option\\.defaultSelected\\)\\}"',
    'data-sold-out="\\$\\{Boolean\\(option\\.soldOut\\)\\}"',
  ]) {
    assert.match(app, new RegExp(attribute), `renderModifiers must publish ${attribute}`);
  }
  assert.match(app, /modal\.dataset\.productId = product\.id/);
  assert.match(app, /modal\.dataset\.categorySlug = category\?\.slug \|\| ""/);
});

test("presentation adapters resolve visuals from that metadata instead of product identity", () => {
  assert.match(doner, /dataset\.optionName/);
  assert.match(doner, /dataset\.groupName/);
  assert.match(doner, /const GROUP_ROLES = new Map/);
  assert.match(doner, /const LAYER_TOKENS = new Map/);
  assert.match(pizza, /dataset\.categorySlug/);
  assert.match(pizza, /const TOP_DOWN_CATEGORIES = new Set/);
  // No adapter may branch on a concrete product name.
  for (const source of [doner, pizza]) {
    assert.doesNotMatch(source, /product\.name\s*===|productName\s*===|"Pizza [A-ZÄÖÜ]/);
  }
});

test("D066 offers a one-tap standard recipe that delegates to the authoritative add action", () => {
  assert.match(builder, /data-builder-accept-recipe/);
  assert.match(builder, /data-builder-customize/);
  assert.match(builder, /if \(addButton\?\.disabled\) return;\n\s*addButton\?\.click\(\);/);
  assert.match(builder, /dataset\.builderEntry = "custom"/);
  // The one-tap label mirrors the price the application already computed.
  assert.match(builder, /addButton\?\.textContent\?\.split\("·"\)/);
  // The visual shell still owns no commerce truth.
  assert.doesNotMatch(builder, /basePriceCents|priceDeltaCents|configuredPrice|configurationValid/);
  assert.doesNotMatch(builder, /localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(builder, /\.checked\s*=|\.value\s*=/);
});

test("the one-tap recipe action disappears as soon as the configuration is customized", () => {
  assert.match(
    builderCss,
    /#productModal\[data-builder-entry="custom"\] \.builder-recipe-actions \{\s*display: none;/,
    "a customized configuration must not keep a button labelled as the standard recipe",
  );
});

test("configuration state is readable as text, not only as colour or illustration", () => {
  assert.match(builder, /data-builder-summary/);
  assert.match(builder, /entries\.push\(\["Mit"/);
  assert.match(builder, /entries\.push\(\["Ohne"/);
  assert.match(builder, /entries\.push\(\["Extras"/);
  assert.match(builderCss, /content: "Ohne"/);
  assert.match(builderCss, /content: "Heute nicht verfügbar"/);
});

test("the cart summarises a configured product per modifier group including removed standard parts", () => {
  assert.match(app, /labels\.push\(`\$\{group\.name\}: \$\{names\.join\(", "\)\}`\)/);
  assert.match(app, /labels\.push\(`Ohne: \$\{removed\.join\(", "\)\}`\)/);
  // Catalog order, not tap order, keeps the summary stable.
  assert.match(app, /group\.options\.filter\(\(option\) => chosen\.includes\(option\.id\)\)/);
  // Cart revalidation reuses the same summary builder instead of a second format.
  assert.match(app, /const labels = selectionLabels\(product, \[\.\.\.selected\]/);
});

test("the FoodStage marker follows the stage that is actually visible", () => {
  assert.match(doner, /stageRoot\?\.setAttribute\("data-builder-food-stage", "true"\)/);
  assert.match(doner, /foodStageImage\.removeAttribute\("data-builder-food-stage"\)/);
});

test("ingredient motion distinguishes entry from exit and stays reduced-motion safe", () => {
  assert.match(donerCss, /\.mc-food-layer \{[^}]*transform 200ms cubic-bezier\(\.4,0,1,1\)/s);
  assert.match(donerCss, /\.mc-food-layer\[data-active="true"\] \{[^}]*transform 340ms cubic-bezier\(\.22,\.85,\.28,1\.18\)/s);
  assert.match(donerCss, /@media \(prefers-reduced-motion: reduce\)/);
  // No undefined custom property may silently invalidate the stage background again.
  const referenced = new Set([...donerCss.matchAll(/var\(--(mcello-[a-z-]+)\)/g)].map((match) => match[1]));
  for (const token of referenced) {
    assert.ok(
      ["mcello-ink", "mcello-charcoal", "mcello-coal", "mcello-copper", "mcello-gold", "mcello-olive", "mcello-cream", "mcello-bread", "mcello-stone"].includes(token),
      `${token} is not defined by the Mcello brand system`,
    );
  }
});

test("fixed commerce chrome reserves its own space and narrow rows never overflow", () => {
  /*
   * Scoped to the pages that actually carry the bar. Unscoped, this reserved
   * 96px at the bottom of kds, ops, admin, status, labels, schedule, handbook
   * and edit-order, which have no .sticky-order to reserve it for. Same
   * guarantee, applied where it belongs.
   */
  assert.match(styles, /body:has\(\.sticky-order\) \{ padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(styles, /bottom: calc\(18px \+ env\(safe-area-inset-bottom\)\)/);
  // The phone breakpoint tightens the offset; it must not drop the inset with it.
  assert.match(styles, /\.sticky-order \{ bottom: calc\(10px \+ env\(safe-area-inset-bottom\)\); \}/);
  assert.match(styles, /\.price-row \{ display: flex; flex-wrap: wrap;/);
  assert.match(styles, /\.recommendation-card \{ min-width: 0; display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
});
