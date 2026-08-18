import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const engine = await readFile(new URL("apps/mcello/public/motion/engine.js", root), "utf8");
const accessibility = await readFile(new URL("apps/mcello/public/motion/accessibility.js", root), "utf8");
const motion = await readFile(new URL("apps/mcello/public/motion.js", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("D074 Motion V3 adapter loads only the exact same-origin approved GSAP runtime", () => {
  assert.match(engine, /EXPECTED_GSAP_VERSION = "3\.15\.0"/);
  for (const path of [
    "/vendor/gsap/gsap.min.js",
    "/vendor/gsap/ScrollTrigger.min.js",
    "/vendor/gsap/Flip.min.js",
  ]) assert.match(engine, new RegExp(path.replaceAll(".", "\\.")));

  assert.match(engine, /url\.origin !== window\.location\.origin/);
  assert.match(engine, /gsap\.registerPlugin\(ScrollTrigger, Flip\)/);
  assert.doesNotMatch(engine, /ScrollSmoother|SplitText|MorphSVG|DrawSVG|Draggable|Observer|Inertia|GSDevTools/);
  assert.doesNotMatch(engine, /https?:\/\//);
});

test("D074 adapter has no commerce, backend, auth or persistence authority", () => {
  const runtime = `${engine}\n${accessibility}`;
  assert.doesNotMatch(runtime, /fetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(runtime, /\/api\/|\/rest\/|supabase|\.rpc\s*\(/i);
  assert.doesNotMatch(runtime, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(runtime, /basePrice|configuredPrice|unitPrice|cart|checkout|sold.?out|availability/i);
  assert.doesNotMatch(runtime, /authorization|service.?role|access.?token|locationId/i);
});

test("Reduced Motion and explicit disable resolve before any vendor loading", () => {
  assert.match(accessibility, /REDUCED_MOTION_QUERY = "\(prefers-reduced-motion: reduce\)"/);
  assert.match(accessibility, /NORMAL_MOTION_QUERY = "\(prefers-reduced-motion: no-preference\)"/);

  const loader = engine.slice(engine.indexOf("export async function loadMcelloMotionEngine"));
  const disabled = loader.indexOf("if (disabled)");
  const reduced = loader.indexOf("if (prefersReducedMotion())");
  const build = loader.indexOf("buildReadyEngine()");
  assert.ok(disabled >= 0 && disabled < build);
  assert.ok(reduced >= 0 && reduced < build);
  assert.match(engine, /unavailableEngine\("fallback", "vendor-unavailable"\)/);
});

test("Motion V3 scopes provide GSAP context and matchMedia cleanup without global kills", () => {
  assert.match(engine, /gsap\.context/);
  assert.match(engine, /gsap\.matchMedia\(\)/);
  assert.match(engine, /for \(const media of mediaContexts\) media\.revert\(\)/);
  assert.match(engine, /for \(const context of contexts\) context\.revert\(\)/);
  assert.doesNotMatch(engine, /ScrollTrigger\.killAll|globalTimeline\.clear|gsap\.killTweensOf\("\*"\)/);
});

test("V2 contracts are installed before the V3 adapter can upgrade an eligible slice", () => {
  assert.match(motion, /import\("\.\/motion\/engine\.js"\)/);
  assert.match(motion, /requestIdleCallback/);
  assert.match(motion, /data.*mcelloMotionEngine|dataset\.mcelloMotionEngine/);
  assert.doesNotMatch(motion, /\bgsap\s*\./);
  assert.doesNotMatch(motion, /ScrollTrigger|\bFlip\b/);

  const reveal = motion.indexOf("const revealController = installRevealMotion();");
  const hero = motion.indexOf("installHeroFoodDepth();");
  const commerce = motion.indexOf("installCommerceMotionContracts();");
  const prime = motion.indexOf("scheduleMotionV3Adapter(revealController);");
  assert.ok(reveal >= 0 && reveal < prime);
  assert.ok(hero >= 0 && hero < prime);
  assert.ok(commerce >= 0 && commerce < prime);
});

test("Motion V3 adapter modules and vendor runtime remain part of every refreshed offline shell", () => {
  assert.match(sw, /mcello-public-shell-v\d+/);
  for (const asset of [
    "/motion/engine.js",
    "/motion/accessibility.js",
    "/vendor/gsap/gsap.min.js",
    "/vendor/gsap/ScrollTrigger.min.js",
    "/vendor/gsap/Flip.min.js",
  ]) assert.match(sw, new RegExp(`"${asset.replaceAll(".", "\\.")}"`));
});
