import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MCELLO_GSAP_VENDOR_FILES,
  MCELLO_GSAP_VENDOR_PUBLIC_PATH,
  MCELLO_GSAP_VERSION,
  prepareMcelloGsapVendor,
} from "../scripts/vendor-mcello-gsap.mjs";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await readFile(new URL("apps/mcello/package.json", root), "utf8"));
const vendorScript = await readFile(new URL("scripts/vendor-mcello-gsap.mjs", root), "utf8");
const buildPreview = await readFile(new URL("scripts/build-preview.mjs", root), "utf8");
const run = await readFile(new URL("apps/mcello/run.mjs", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const motion = await readFile(new URL("apps/mcello/public/motion.js", root), "utf8");
const decisions = await readFile(new URL("docs/projects/mcello/DECISIONS.md", root), "utf8");
const contract = await readFile(new URL("docs/projects/mcello/GSAP_MOTION_V3.md", root), "utf8");

test("D074 pins the verified GSAP baseline exactly and admits only Core, ScrollTrigger and Flip", () => {
  assert.equal(packageJson.dependencies.gsap, "3.15.0");
  assert.equal(MCELLO_GSAP_VERSION, "3.15.0");
  assert.equal(MCELLO_GSAP_VENDOR_PUBLIC_PATH, "/vendor/gsap");
  assert.deepEqual(MCELLO_GSAP_VENDOR_FILES, [
    "gsap.min.js",
    "ScrollTrigger.min.js",
    "Flip.min.js",
  ]);

  for (const forbidden of [
    "ScrollSmoother",
    "SplitText",
    "MorphSVG",
    "DrawSVG",
    "MotionPath",
    "Draggable",
    "Observer",
    "Inertia",
    "GSDevTools",
    "all.js",
  ]) assert.ok(!MCELLO_GSAP_VENDOR_FILES.some((file) => file.includes(forbidden)), `${forbidden} must stay outside the Phase 1 whitelist`);
});

test("GSAP vendor step copies only the approved installed-package browser files", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mcello-gsap-"));
  try {
    const result = await prepareMcelloGsapVendor(temp);
    assert.equal(result.version, "3.15.0");
    assert.deepEqual(result.files, [...MCELLO_GSAP_VENDOR_FILES]);

    const entries = (await readdir(temp)).sort();
    assert.deepEqual(entries, [...MCELLO_GSAP_VENDOR_FILES, "vendor-manifest.json"].sort());

    for (const file of MCELLO_GSAP_VENDOR_FILES) {
      const info = await stat(path.join(temp, file));
      assert.ok(info.isFile());
      assert.ok(info.size > 1_000, `${file} should contain the real local GSAP distribution file`);
    }

    const manifest = JSON.parse(await readFile(path.join(temp, "vendor-manifest.json"), "utf8"));
    assert.equal(manifest.package, "gsap");
    assert.equal(manifest.version, "3.15.0");
    assert.match(String(manifest.license), /Standard.*no charge/i);
    assert.deepEqual(manifest.files, [...MCELLO_GSAP_VENDOR_FILES]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("direct runtime and static preview both prepare the same-origin vendor before serving/copying", () => {
  assert.match(run, /prepareMcelloGsapVendor\(\)/);
  assert.ok(run.indexOf("prepareMcelloGsapVendor()") < run.indexOf('import("./runtime/development.mjs")'));

  assert.match(buildPreview, /prepareMcelloGsapVendor\(\)/);
  assert.ok(buildPreview.indexOf("prepareMcelloGsapVendor()") < buildPreview.indexOf("await cp(source, out"));

  assert.match(vendorScript, /node_modules|requireFromMcello\.resolve\("gsap\/package\.json"\)/);
  assert.doesNotMatch(vendorScript, /https?:\/\//);
});

test("PWA shell caches only same-origin approved GSAP files across cache generations", () => {
  assert.match(sw, /mcello-public-shell-v\d+/);
  for (const file of MCELLO_GSAP_VENDOR_FILES) {
    assert.match(sw, new RegExp(`"\\/vendor\\/gsap\\/${file.replaceAll(".", "\\.")}"`));
  }
  assert.doesNotMatch(sw, /cdn\.jsdelivr|cdnjs|unpkg|webflow|https?:\/\/.*gsap/i);
});

test("Phase 1 foundation stays presentation-only while V2 remains the visible implementation until explicit migration", () => {
  assert.doesNotMatch(motion, /\bgsap\s*\./);
  assert.doesNotMatch(motion, /ScrollTrigger|\bFlip\b/);
  assert.match(motion, /installRevealMotion\(\)/);
  assert.match(motion, /installHeroFoodDepth\(\)/);
});

test("D074 contract preserves progressive enhancement, domain truth and rollback boundaries", () => {
  assert.match(decisions, /\| D074 \| GSAP Motion Runtime \|/);
  assert.match(contract, /presentation runtime only/i);
  assert.match(contract, /GSAP fails to load or is intentionally disabled/i);
  assert.match(contract, /prefers-reduced-motion/);
  assert.match(contract, /price \/ modifier validity \/ sold-out \/ cart \/ checkout \/ role \/ RLS truth/);
  assert.match(contract, /Every GSAP migration must remain independently reversible/);
  assert.match(contract, /does \*\*not\*\* authorize:\n\n- production deployment/);
});
