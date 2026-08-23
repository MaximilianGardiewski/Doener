import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const motion = await readFile(new URL("apps/mcello/public/motion.js", root), "utf8");
const commerce = await readFile(new URL("apps/mcello/public/motion/commerce.js", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("Phase 3 category migration observes the already-rendered application category state", () => {
  assert.match(motion, /const category = target\.closest\("\[data-category\]"\)/);
  assert.match(motion, /const categoryId = category\.dataset\.category/);
  assert.match(motion, /document\.querySelector\("#featuredGrid"\)/);
  assert.match(motion, /document\.querySelector\("#menuList"\)/);
  assert.match(motion, /document\.querySelector\(`\[data-category=/);
  assert.match(motion, /commerceMotionV3\?\.animateCategoryChange/);
  assert.doesNotMatch(commerce, /categoryId\s*=|state\.|renderMenu|renderRail/);
});

test("GSAP category feedback is bounded transform/opacity motion with V2 fallback preserved", () => {
  assert.match(commerce, /opacity: 0\.72/);
  assert.match(commerce, /x: 8/);
  assert.match(commerce, /opacity: 1/);
  assert.match(commerce, /x: 0/);
  assert.match(commerce, /duration: 0\.32/);
  assert.match(commerce, /scale: 0\.96/);
  assert.match(commerce, /duration: 0\.12/);
  assert.match(commerce, /repeat: 1/);
  assert.match(commerce, /yoyo: true/);
  assert.match(commerce, /clearProps: "opacity,transform"/);
  assert.match(motion, /if \(!handledByV3\)/);
  assert.match(motion, /motion-category-switch/);
  assert.match(motion, /motion-category-chip/);
  assert.doesNotMatch(commerce, /width\s*:|height\s*:|top\s*:|left\s*:|margin\s*:|padding\s*:/);
  assert.doesNotMatch(commerce, /repeat:\s*(?:-1|Infinity)|ScrollTrigger|Flip/);
});

test("Reduced Motion blocks both GSAP category motion and the legacy keyframe restart", () => {
  assert.match(motion, /!reducedMotion\.matches && Boolean\(commerceMotionV3\?\.animateCategoryChange/);
  assert.match(motion, /function restartMotionClass/);
  assert.match(motion, /if \(!node \|\| reducedMotion\.matches\) return/);
  assert.match(motion, /dataset\.mcelloCategoryEngine = mode/);
});

test("commerce adapter cleans only its own active tweens and scope", () => {
  assert.match(commerce, /const activeTweens = new Set\(\)/);
  assert.match(commerce, /gsap\.killTweensOf\(surfaces\)/);
  assert.match(commerce, /if \(activeChip\) gsap\.killTweensOf\(activeChip\)/);
  assert.match(commerce, /for \(const tween of activeTweens\) tween\.kill\(\)/);
  assert.match(commerce, /scope\.cleanup\(\)/);
  assert.doesNotMatch(commerce, /killAll|globalTimeline/);
});

test("category motion remains presentation-only and self-host/offline capable", () => {
  const runtime = `${motion}\n${commerce}`;
  assert.doesNotMatch(commerce, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(commerce, /\/api\/|\/rest\/|supabase|\.rpc\s*\(/i);
  assert.doesNotMatch(commerce, /localStorage|sessionStorage|indexedDB/);
  // commerce.js is a shared presentation-motion adapter. Cart-specific motion is
  // covered by its own presentation-only test, so this category guard must not
  // reject the adapter merely because a sibling cart transition exists.
  assert.doesNotMatch(commerce, /price|checkout|availability|sold.?out|authorization|locationId/i);
  assert.match(runtime, /motionCategory/);
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /"\/motion\/commerce\.js"/);
});