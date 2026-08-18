import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const js = await readFile(new URL("apps/mcello/public/store-v2.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/store-v2.css", root), "utf8");
const publicContent = await readFile(new URL("apps/mcello/public/public-content.js", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const docs = await readFile(new URL("docs/projects/mcello/STORE_V2.md", root), "utf8");

test("Store V2 is loaded as a presentation layer over the existing ordering UI", () => {
  assert.match(publicContent, /import "\.\/store-v2\.js";/);
  assert.match(js, /data\.mcelloStoreV2/);
  assert.match(js, /href = "\/store-v2\.css"/);
  assert.match(js, /data-store-version/);
  assert.match(js, /MutationObserver/);
});

test("Store V2 exposes signature support and compact product roles without inventing popularity", () => {
  assert.match(js, /"signature"/);
  assert.match(js, /"support"/);
  assert.match(js, /"compact"/);
  assert.match(js, /signature-product/);
  assert.match(js, /support-product/);
  assert.match(js, /compact-product/);
  assert.match(docs, /does \*\*not\*\* mean bestseller, popularity or owner endorsement/);
  assert.match(docs, /Kategorie-Highlight/);
});

test("Store V2 presentation code does not own commerce or backend state", () => {
  assert.doesNotMatch(js, /\bstate\b/);
  assert.doesNotMatch(js, /basePrice|priceDelta|unitPrice|configuredPrice/i);
  assert.doesNotMatch(js, /localStorage|sessionStorage/);
  assert.doesNotMatch(js, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(js, /cart\s*=|categoryId\s*=|availableNow\s*=|soldOut\s*=/);
});

test("Store V2 uses semantic brand roles and keeps commerce controls touch-safe", () => {
  for (const token of [
    "surface-food-stage",
    "surface-raised",
    "mcello-copper",
    "mcello-gold",
    "touch-target-compact",
    "touch-target-primary",
    "ratio-product",
  ]) assert.match(css, new RegExp(`var\\(--${token}\\)`));

  assert.match(css, /\.signature-product/);
  assert.match(css, /\.support-product/);
  assert.match(css, /\.compact-product/);
  assert.match(css, /category-rail\[data-store-navigation="categories"\]/);
  assert.match(css, /sticky-order\[data-store-cart="sticky"\]/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /url\s*\(\s*["']?https?:/i);
  assert.doesNotMatch(css, /@import/i);
});

test("Store V2 keeps real-media truth and Adobe concepts outside the runtime path", () => {
  assert.match(docs, /CONCEPT ART ONLY/);
  assert.match(docs, /not a real Mcello product/);
  assert.match(docs, /placeholder\/CMS pipeline/);
  assert.doesNotMatch(js + css, /adobe|firefly|photoshop-api|short-url/i);
});

test("Store V2 remains part of the offline public shell without caching business data", () => {
  assert.match(sw, /mcello-public-shell-v11/);
  assert.match(sw, /"\/store-v2\.js"/);
  assert.match(sw, /"\/store-v2\.css"/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});
