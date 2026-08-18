import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("apps/mcello/public/index.html", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/homepage-v2.css", root), "utf8");
const brand = await readFile(new URL("apps/mcello/public/brand-system.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

function position(marker) {
  const index = html.indexOf(marker);
  assert.notEqual(index, -1, `missing ${marker}`);
  return index;
}

test("Homepage V2 loads the semantic brand layer after the proven legacy styles", () => {
  const legacy = position('href="/styles.css"');
  const semantic = position('href="/brand-system.css"');
  const homepage = position('href="/homepage-v2.css"');
  assert.ok(legacy < semantic && semantic < homepage);
});

test("D067 exposes explicit public and commerce experience boundaries without splitting the app", () => {
  assert.match(html, /<body class="mcello-public-v2" data-experience-mode="public">/);
  assert.match(html, /id="start" data-experience-mode="public"/);
  assert.match(html, /id="bestellen" data-experience-mode="commerce"/);
  assert.match(brand, /\[data-experience-mode="public"\]/);
  assert.match(brand, /\[data-experience-mode="commerce"\]/);
});

test("D024 functional homepage hooks survive the visual re-layout", () => {
  for (const marker of [
    'id="start"',
    'id="bestellen"',
    'id="ueber"',
    'id="aktuelles"',
    'id="galerie"',
    'id="kontakt"',
    'id="categoryRail"',
    'id="featuredGrid"',
    'id="menuList"',
    'class="sticky-order"',
    'data-order-cta',
  ]) assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("Homepage V2 uses the semantic V2 palette instead of defining another raw brand palette", () => {
  for (const token of [
    "mcello-ink",
    "mcello-charcoal",
    "mcello-copper",
    "mcello-gold",
    "mcello-olive",
    "surface-cinematic",
    "surface-base",
    "surface-warm",
  ]) assert.match(css, new RegExp(`var\\(--${token}\\)`));

  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /url\s*\(\s*["']?https?:/i);
  assert.doesNotMatch(css, /@import/i);
});

test("real-media placeholder remains explicit and visually non-documentary", () => {
  assert.match(html, /Originalmedien noch nicht im öffentlichen Repo/);
  assert.match(css, /CONCEPT \/ ORIGINAL MEDIA PENDING/);
  assert.match(html, /src="\/media\/placeholder\.svg"/);
});

test("Homepage V2 provides a true reduced-motion path", () => {
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(brand, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(brand, /--motion-cinematic:\s*0ms/);
});

test("V2 brand and homepage assets remain part of the offline public shell", () => {
  assert.match(sw, /mcello-public-shell-v10/);
  assert.match(sw, /"\/brand-system\.css"/);
  assert.match(sw, /"\/homepage-v2\.css"/);
});

test("commerce headline preserves the deliberately relaxed D059 line", () => {
  assert.match(html, /App-schnell\. Bistro-echt\./);
});
