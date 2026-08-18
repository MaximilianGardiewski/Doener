import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const motion = await readFile(new URL("apps/mcello/public/motion.js", root), "utf8");
const commerce = await readFile(new URL("apps/mcello/public/motion/commerce.js", root), "utf8");
const app = await readFile(new URL("apps/mcello/public/app.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/motion.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("Phase 3 product-open observes an already-open application modal instead of owning product state", () => {
  assert.match(app, /function openProduct\(id\)/);
  assert.match(app, /state\.activeProduct = product/);
  assert.match(app, /modal\.classList\.add\("open"\)/);
  assert.match(app, /modal\.setAttribute\("aria-hidden", "false"\)/);
  assert.match(motion, /document\.querySelector\("#productModal\.open \.modal"\)/);
  assert.match(motion, /commerceMotionV3\?\.animateProductOpen\(\{ source, modal \}\)/);
  assert.match(commerce, /if \(!modal\?\.closest\("#productModal\.open"\)\) return false/);
  assert.doesNotMatch(commerce, /activeProduct\s*=|state\.|openProduct|modal\.classList\.add/);
});

test("GSAP product-open is bounded presentation motion with exact V2 fallback retained", () => {
  assert.match(commerce, /function animateProductOpen/);
  assert.match(commerce, /scale: 0\.985/);
  assert.match(commerce, /opacity: 0\.76/);
  assert.match(commerce, /y: 10/);
  assert.match(commerce, /scale: 0\.988/);
  assert.match(commerce, /duration: 0\.38/);
  assert.match(commerce, /ease: "power3\.out"/);
  assert.match(commerce, /clearProps: "opacity,transform"/);
  assert.match(motion, /motion-product-activate/);
  assert.match(motion, /motion-product-open/);
  assert.doesNotMatch(commerce, /width\s*:|height\s*:|top\s*:|left\s*:|margin\s*:|padding\s*:/);
  assert.doesNotMatch(commerce, /repeat:\s*(?:-1|Infinity)|ScrollTrigger|Flip/);
});

test("GSAP product-open prevents CSS transition contention and clears ownership markers", () => {
  assert.match(css, /\[data-motion-product-engine="gsap"\]/);
  const owned = css.slice(css.indexOf('[data-motion-product-engine="gsap"]'));
  assert.match(owned, /transition: none !important/);
  assert.match(owned, /animation: none !important/);
  assert.match(commerce, /node\.dataset\.motionProductEngine = "gsap"/);
  assert.match(commerce, /delete node\.dataset\.motionProductEngine/);
  assert.match(commerce, /clearProductPresentation/);
});

test("Reduced Motion blocks both GSAP product-open and legacy product keyframes", () => {
  assert.match(motion, /!reducedMotion\.matches && Boolean\(commerceMotionV3\?\.animateProductOpen/);
  assert.match(motion, /dataset\.mcelloProductEngine = mode/);
  assert.match(motion, /if \(!node \|\| reducedMotion\.matches\) return/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.motion-product-activate/);
  assert.match(reduced, /\.motion-product-open/);
  assert.match(reduced, /animation: none !important/);
});

test("product-open motion remains visual-only and self-host/offline capable", () => {
  assert.doesNotMatch(commerce, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(commerce, /\/api\/|\/rest\/|supabase|\.rpc\s*\(/i);
  assert.doesNotMatch(commerce, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(commerce, /basePrice|configuredPrice|unitPrice|checkout|availability|sold.?out|authorization|locationId/i);
  assert.match(sw, /mcello-public-shell-v27/);
  assert.match(sw, /"\/motion\/commerce\.js"/);
  assert.match(sw, /"\/vendor\/gsap\/gsap\.min\.js"/);
});