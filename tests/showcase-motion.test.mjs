import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../apps/mcello/public/motion.css", import.meta.url), "utf8");
const js = await readFile(new URL("../apps/mcello/public/motion.js", import.meta.url), "utf8");
const publicContent = await readFile(new URL("../apps/mcello/public/public-content.js", import.meta.url), "utf8");
const sw = await readFile(new URL("../apps/mcello/public/sw.js", import.meta.url), "utf8");

test("D058 motion layer stays restricted to composited visual properties", () => {
  assert.match(css, /opacity var\(--motion-reveal\)/);
  assert.match(css, /transform var\(--motion-reveal\)/);
  assert.match(css, /translate3d\(0,18px,0\)/);
  assert.match(css, /translateY\(-4px\)/);
  assert.doesNotMatch(css, /transition:[^;]*(width|height|top|left|margin|padding)/i);
  assert.doesNotMatch(css, /animation-iteration-count\s*:\s*infinite/i);
});

test("D058 obeys the user's reduced-motion preference", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition: none !important/);
  assert.match(css, /animation: none !important/);
  assert.match(css, /transform: none !important/);
  assert.match(js, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(js, /if \(reducedMotion\.matches \|\| !\("IntersectionObserver" in window\)\)/);
  assert.match(js, /if \(!node \|\| reducedMotion\.matches\) return/);
});

test("public motion is progressive enhancement and part of the offline shell", () => {
  assert.match(publicContent, /import "\.\/motion\.js";/);
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /classList\.add\("is-revealed"\)/);
  assert.match(sw, /"\/motion\.js"/);
  assert.match(sw, /"\/motion\.css"/);
  assert.match(sw, /mcello-public-shell-v\d+/);
});

test("V2 motion covers hero food, product, category, ingredient and cart feedback without owning commerce state", () => {
  assert.match(js, /installHeroFoodDepth/);
  assert.match(js, /--motion-hero-depth-y/);
  assert.match(js, /\[data-category\]/);
  assert.match(js, /motion-category-switch/);
  assert.match(js, /\[data-product\], \[data-recommended-product\]/);
  assert.match(js, /motion-product-open/);
  assert.match(js, /#modifierGroups input/);
  assert.match(js, /input\.checked \? "added" : "removed"/);
  assert.match(js, /motion-food-stage-change/);
  assert.match(js, /#addToCart/);
  assert.match(js, /motion-cart-confirm/);

  for (const keyframe of [
    "mcello-category-shift",
    "mcello-product-open",
    "mcello-ingredient-choice",
    "mcello-food-stage-change",
    "mcello-cart-confirm",
  ]) assert.match(css, new RegExp(`@keyframes ${keyframe}`));

  assert.doesNotMatch(js, /\bstate\b|basePrice|unitPrice|configuredPrice|localStorage|fetch\s*\(/);
});

test("builder-ready ingredient feedback is visual only and already reduced-motion safe", () => {
  assert.match(css, /\[data-motion-selection="removed"\]/);
  assert.match(css, /\[data-motion-ingredient="removed"\]/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const selector of [
    "motion-category-switch",
    "motion-product-open",
    "motion-ingredient-change",
    "motion-food-stage-change",
    "motion-cart-confirm",
  ]) assert.match(reduced, new RegExp(selector));
  assert.match(reduced, /\.hero-media-v2 \.hero-photo/);
});
