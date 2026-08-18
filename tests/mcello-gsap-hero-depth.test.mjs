import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const motion = await readFile(new URL("apps/mcello/public/motion.js", root), "utf8");
const homepage = await readFile(new URL("apps/mcello/public/motion/homepage.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/motion.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("Phase 3 hero V2 controller has a symmetrical teardown before GSAP ownership", () => {
  assert.match(motion, /const heroController = installHeroFoodDepth\(\)/);
  assert.match(motion, /window\.addEventListener\("scroll", schedule/);
  assert.match(motion, /window\.addEventListener\("resize", schedule/);
  assert.match(motion, /reducedMotion\.addEventListener\?\.\("change", handlePreferenceChange\)/);
  assert.match(motion, /window\.removeEventListener\("scroll", schedule\)/);
  assert.match(motion, /window\.removeEventListener\("resize", schedule\)/);
  assert.match(motion, /reducedMotion\.removeEventListener\?\.\("change", handlePreferenceChange\)/);
  assert.match(motion, /cancelAnimationFrame\(frame\)/);
  assert.match(motion, /foodVisual\.style\.removeProperty\("--motion-hero-depth-y"\)/);
});

test("GSAP hero depth is bounded transform-only native-scroll orchestration", () => {
  assert.match(homepage, /upgradeHeroDepthToGsap/);
  assert.match(homepage, /scope\.matchMedia\(engine\.media\.normal/);
  assert.match(homepage, /gsap\.fromTo\(foodVisual/);
  assert.match(homepage, /\{ y: -10, scale: 1\.045 \}/);
  assert.match(homepage, /y: 10/);
  assert.match(homepage, /scale: 1\.045/);
  assert.match(homepage, /ease: "none"/);
  assert.match(homepage, /start: "top bottom"/);
  assert.match(homepage, /end: "bottom top"/);
  assert.match(homepage, /scrub: true/);
  assert.doesNotMatch(homepage, /pin\s*:|snap\s*:|ScrollSmoother|scrollTo\s*:/);
  assert.doesNotMatch(homepage, /width\s*:|height\s*:|margin\s*:|padding\s*:/);
  assert.doesNotMatch(homepage, /repeat\s*:|yoyo\s*:/);
});

test("V2 hero ownership is released only after the GSAP scope initializes successfully", () => {
  const fn = homepage.slice(homepage.indexOf("export function upgradeHeroDepthToGsap"));
  const matchMedia = fn.indexOf("scope.matchMedia");
  const cleanup = fn.indexOf("controller.cleanup()");
  const catchBlock = fn.indexOf("} catch {");
  assert.ok(matchMedia >= 0 && matchMedia < cleanup);
  assert.ok(cleanup >= 0 && cleanup < catchBlock);
  assert.match(fn, /mcelloHeroEngine = "gsap"/);
  assert.match(fn, /mcelloHeroEngine = controller\.reduced \? "reduced" : "v2"/);
});

test("GSAP hero CSS removes transition contention while reduced-motion remains a hard final-state gate", () => {
  assert.match(css, /html\[data-mcello-hero-engine="gsap"\] \.hero-media-v2 \.hero-photo/);
  const owned = css.slice(css.indexOf('html[data-mcello-hero-engine="gsap"]'));
  assert.match(owned, /transition: none/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.hero-media-v2 \.hero-photo/);
  assert.match(reduced, /transform: scale\(1\.035\) !important/);
  assert.match(reduced, /transition: none !important/);
});

test("GSAP hero slice remains visual-only and offline-refreshable", () => {
  const heroFn = homepage.slice(homepage.indexOf("export function upgradeHeroDepthToGsap"));
  assert.doesNotMatch(heroFn, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(heroFn, /\/api\/|\/rest\/|supabase|\.rpc\s*\(/i);
  assert.doesNotMatch(heroFn, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(heroFn, /price|cart|checkout|availability|sold.?out|authorization|locationId/i);
  assert.match(sw, /mcello-public-shell-v25/);
  assert.match(sw, /"\/motion\/homepage\.js"/);
  assert.match(sw, /"\/vendor\/gsap\/ScrollTrigger\.min\.js"/);
});
