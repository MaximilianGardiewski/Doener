import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const motion = await readFile(new URL("apps/mcello/public/motion.js", root), "utf8");
const commerce = await readFile(new URL("apps/mcello/public/motion/commerce.js", root), "utf8");
const app = await readFile(new URL("apps/mcello/public/app.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/motion.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("cart confirmation is gated by post-commit application UI state rather than click intent", () => {
  assert.match(app, /function addActiveProductToCart\(\)/);
  assert.match(app, /state\.cart\.push\(/);
  assert.match(app, /saveCart\(\)/);
  assert.match(app, /closeProduct\(\)/);
  assert.match(app, /drawer\.classList\.add\("open"\)/);
  assert.match(app, /\$\("#addToCart"\)\.onclick = addActiveProductToCart/);

  assert.match(motion, /function cartCommitSucceededAfterClick\(\)/);
  assert.match(motion, /drawer\?\.classList\.contains\("open"\)/);
  assert.match(motion, /!document\.querySelector\("#productModal\.open"\)/);
  assert.match(motion, /addToCart && !addToCart\.matches\(":disabled"\) && cartCommitSucceededAfterClick\(\)/);
});

test("GSAP cart confirmation is bounded transform-only feedback with V2 fallback", () => {
  assert.match(commerce, /function animateCartConfirmation\(sticky\)/);
  assert.match(commerce, /scale: 1\.025/);
  assert.match(commerce, /duration: 0\.16/);
  assert.match(commerce, /scale: 1, duration: 0\.2/);
  assert.match(commerce, /clearProps: "transform"/);
  assert.match(motion, /commerceMotionV3\?\.animateCartConfirmation\(sticky\)/);
  assert.match(motion, /motion-cart-confirm/);
  assert.doesNotMatch(commerce, /width\s*:|height\s*:|top\s*:|left\s*:|margin\s*:|padding\s*:/);
  assert.doesNotMatch(commerce, /repeat:\s*(?:-1|Infinity)|ScrollTrigger|Flip/);
});

test("cart feedback isolates its CSS writer and cleans repeated transitions", () => {
  assert.match(css, /\[data-motion-cart-engine="gsap"\]/);
  assert.match(commerce, /let cartTransition = null/);
  assert.match(commerce, /function clearCartPresentation\(\)/);
  assert.match(commerce, /delete sticky\.dataset\.motionCartEngine/);
  assert.match(commerce, /delete sticky\.dataset\.motionCart/);
  const cleanup = commerce.slice(commerce.indexOf("cleanup() {"));
  assert.match(cleanup, /clearCartPresentation\(\)/);
  assert.match(cleanup, /activeTweens\.clear\(\)/);
  assert.match(cleanup, /scope\.cleanup\(\)/);
});

test("Reduced Motion prevents both GSAP and legacy cart confirmation animation", () => {
  assert.match(motion, /dataset\.mcelloCartEngine = mode/);
  assert.match(motion, /!reducedMotion\.matches && Boolean\(commerceMotionV3\?\.animateCartConfirmation/);
  assert.match(motion, /if \(!handledByV3 && !reducedMotion\.matches && sticky\)/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.sticky-order\.motion-cart-confirm/);
  assert.match(reduced, /animation: none !important/);
});

test("cart motion remains presentation-only and self-host/offline capable", () => {
  const cartFn = commerce.slice(commerce.indexOf("function animateCartConfirmation"));
  assert.doesNotMatch(cartFn, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(cartFn, /\/api\/|\/rest\/|supabase|\.rpc\s*\(/i);
  assert.doesNotMatch(cartFn, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(cartFn, /price|checkout|availability|sold.?out|authorization|locationId|state\./i);
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /"\/motion\/commerce\.js"/);
  assert.match(sw, /"\/vendor\/gsap\/gsap\.min\.js"/);
});