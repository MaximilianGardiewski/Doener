import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("apps/mcello/public/index.html", root), "utf8");
const module = await readFile(new URL("apps/mcello/public/homepage-composition.js", root), "utf8");
const publicContent = await readFile(new URL("apps/mcello/public/public-content.js", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("D024 homepage keeps hero community story and sticky order composition", () => {
  for (const marker of [
    'id="start"',
    'id="bestellen"',
    'id="aktuelles"',
    'id="ueber"',
    'class="sticky-order"',
    'data-order-cta',
  ]) {
    assert.equal(html.includes(marker), true, `missing ${marker}`);
  }
  for (const marker of [
    'panel.id = "homepageQuickOrder"',
    'Highlights & Schnellbestellung',
    'id="homepageTeamStory"',
    'Menschen hinter Mcello',
  ]) {
    assert.equal(module.includes(marker), true, `missing ${marker}`);
  }
});

test("quick order uses honest deterministic category highlights rather than fake popularity", () => {
  assert.match(module, /selectCategoryHighlights/);
  assert.match(module, /for \(const category of menu\.categories\)/);
  assert.match(module, /candidate\.categoryId === category\.id/);
  assert.doesNotMatch(module, /bestseller/i);
  assert.doesNotMatch(module, /most popular|beliebteste|meistverkauft/i);
});

test("quick order delegates to the existing category product configurator and cart path", () => {
  for (const marker of [
    '[data-category="${categoryId}"]',
    '[data-product="${productId}"]',
    '#modifierGroups input',
    '#addToCart',
    'addButton.click()',
  ]) {
    assert.equal(module.includes(marker), true, `missing ${marker}`);
  }
  assert.match(module, /const directEligible = \(product\.modifierGroups \|\| \[\]\)\.length === 0/);
  assert.match(module, /Schnell konfigurieren/);
  assert.match(module, /Direkt hinzufügen/);
});

test("story team slot refuses invented identity claims", () => {
  assert.match(module, /Sobald Namen, Geschichten und Fotos von Mcello bestätigt und freigegeben sind/);
  assert.match(module, /erfinden wir lieber nichts dazu/);
});

test("homepage composition is part of public module graph and offline shell", () => {
  assert.match(publicContent, /import "\.\/homepage-composition\.js";/);
  assert.match(sw, /"\/homepage-composition\.js"/);
  assert.match(sw, /mcello-public-shell-v\d+/);
});
