import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const builderJs = await readFile(new URL("apps/mcello/public/builder-core-v2.js", root), "utf8");
const builderCss = await readFile(new URL("apps/mcello/public/builder-core-v2.css", root), "utf8");
const app = await readFile(new URL("apps/mcello/public/app.js", root), "utf8");
const publicContent = await readFile(new URL("apps/mcello/public/public-content.js", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const docs = await readFile(new URL("docs/projects/mcello/BUILDER_CORE_V2.md", root), "utf8");

test("Builder Core loads as a visual shell over the existing configurator", () => {
  assert.match(publicContent, /import "\.\/builder-core-v2\.js";/);
  assert.match(builderJs, /dataset\.mcelloBuilderCore/);
  assert.match(builderJs, /data-builder-version/);
  assert.match(builderJs, /data-builder-food-stage/);
  assert.match(builderJs, /data-builder-action-bar/);
  assert.match(builderJs, /MutationObserver/);
});

test("D066 Mcello Original reflects the real defaultSelected start state", () => {
  assert.match(app, /option\.defaultSelected && !option\.soldOut/);
  assert.match(builderJs, /currentSelectionSignature/);
  assert.match(builderJs, /builderOriginalSelection/);
  assert.match(builderJs, /"original" : "customized"/);
  assert.match(docs, /does not calculate or persist the selection itself/);
});

test("Builder Core keeps configured price and validation in the existing application", () => {
  assert.match(app, /function configuredPrice\(product\)/);
  assert.match(app, /In den Warenkorb · \$\{euro\.format\(configuredPrice\(product\) \/ 100\)\}/);
  assert.match(app, /configurationValid\(product\)/);
  assert.doesNotMatch(builderJs, /basePriceCents|priceDeltaCents|configuredPrice|configurationValid/);
  assert.doesNotMatch(builderJs, /localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("Builder Core decorates existing modifier groups and controls rather than replacing them", () => {
  assert.match(app, /class="modifier-group"/);
  assert.match(app, /class="modifier-option"/);
  assert.match(builderJs, /querySelectorAll\("\.modifier-group"\)/);
  assert.match(builderJs, /classList\.add\("builder-step"\)/);
  assert.match(builderJs, /dataset\.builderOption = "true"/);
  assert.doesNotMatch(builderJs, /innerHTML\s*=.*modifier-group/s);
});

test("Builder Core uses semantic commerce tokens and touch contracts", () => {
  for (const token of [
    "surface-food-stage",
    "surface-raised",
    "mcello-copper",
    "mcello-gold",
    "mcello-olive",
    "radius-commerce-panel",
    "touch-target-compact",
    "touch-target-primary",
  ]) assert.match(builderCss, new RegExp(`var\\(--${token}\\)`));

  assert.match(builderCss, /grid-template-columns: minmax\(360px, \.95fr\) minmax\(430px, 1\.05fr\)/);
  assert.match(builderCss, /position: sticky/);
  assert.match(builderCss, /@media \(max-width: 820px\)/);
  assert.doesNotMatch(builderCss, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(builderCss, /url\s*\(\s*["']?https?:/i);
});

test("Builder Core keeps Adobe concept work outside runtime media and remains offline-capable", () => {
  assert.match(docs, /CONCEPT ART ONLY/);
  assert.match(docs, /not a real Mcello product/);
  assert.doesNotMatch(builderJs + builderCss, /adobe|firefly|photoshop-api|short-url/i);
  assert.match(sw, /mcello-public-shell-v12/);
  assert.match(sw, /"\/builder-core-v2\.js"/);
  assert.match(sw, /"\/builder-core-v2\.css"/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});
