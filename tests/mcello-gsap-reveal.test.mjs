import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const motion = await readFile(new URL("apps/mcello/public/motion.js", root), "utf8");
const homepage = await readFile(new URL("apps/mcello/public/motion/homepage.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/motion.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("Phase 3 reveal upgrade takes over only unrevealed nodes after the V3 engine is available", () => {
  assert.match(motion, /return \{ nodes, observer, reduced: false \}/);
  assert.match(motion, /if \(!engine\.available \|\| !revealController\?\.observer\) return/);
  assert.match(motion, /import\("\.\/motion\/homepage\.js"\)/);
  assert.match(motion, /upgradePendingRevealsToGsap\(engine, revealController\)/);

  assert.match(homepage, /!node\.classList\.contains\("is-revealed"\)/);
  assert.match(homepage, /controller\.observer\.disconnect\(\)/);
  assert.match(homepage, /data.*motionRevealEngine|dataset\.motionRevealEngine = "gsap"/);
});

test("GSAP reveal uses scoped normal-motion ScrollTriggers and compositor-friendly presentation properties", () => {
  assert.match(homepage, /scope\.matchMedia\(engine\.media\.normal/);
  assert.match(homepage, /ScrollTrigger\.create/);
  assert.match(homepage, /start: "top 88%"/);
  assert.match(homepage, /once: true/);
  assert.match(homepage, /opacity: 0/);
  assert.match(homepage, /y: heroMedia \? 12 : 18/);
  assert.match(homepage, /scale: 0\.985/);
  assert.match(homepage, /opacity: 1/);
  assert.match(homepage, /ease: "power3\.out"/);
  assert.doesNotMatch(homepage, /width:|height:|top:|left:|margin|padding/);
  assert.doesNotMatch(homepage, /repeat\s*:|yoyo\s*:/);
});

test("V2 observer remains the recovery path if the optional GSAP reveal upgrade cannot initialize", () => {
  assert.match(homepage, /restoreV2Reveal/);
  assert.match(homepage, /controller\?\.observer\?\.observe\(node\)/);
  assert.match(homepage, /scope\.cleanup\(\)/);
  assert.match(homepage, /mcelloRevealEngine = "v2"/);
  assert.match(motion, /V2 observer remains authoritative/);
  assert.match(motion, /IntersectionObserver/);
});

test("CSS transitions cannot fight GSAP frame updates and reduced-motion hard gate remains intact", () => {
  assert.match(css, /html\[data-mcello-reveal-engine="gsap"\]\.motion-ready \[data-reveal\]/);
  const gsapRule = css.slice(css.indexOf('html[data-mcello-reveal-engine="gsap"]'));
  assert.match(gsapRule, /transition: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /opacity: 1 !important/);
  assert.match(css, /transform: none !important/);
});

test("GSAP reveal module stays visual-only and does not gain business/backend authority", () => {
  assert.doesNotMatch(homepage, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(homepage, /\/api\/|\/rest\/|supabase|\.rpc\s*\(/i);
  assert.doesNotMatch(homepage, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(homepage, /price|cart|checkout|availability|sold.?out|authorization|locationId/i);
});

test("GSAP reveal module is available in refreshed offline shell v24", () => {
  assert.match(sw, /mcello-public-shell-v24/);
  assert.match(sw, /"\/motion\/homepage\.js"/);
  assert.match(sw, /"\/motion\/engine\.js"/);
  assert.match(sw, /"\/vendor\/gsap\/ScrollTrigger\.min\.js"/);
});
