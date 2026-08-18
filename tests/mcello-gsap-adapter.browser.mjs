import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

try {
  const normalContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  const normal = await normalContext.newPage();
  await normal.goto(baseUrl, { waitUntil: "networkidle" });
  await normal.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "ready");

  const runtime = await normal.evaluate(() => ({
    mode: document.documentElement.dataset.mcelloMotionEngine,
    version: window.gsap?.version || null,
    scrollTrigger: typeof window.ScrollTrigger?.create === "function",
    flip: typeof window.Flip?.getState === "function",
    vendorPaths: [...document.querySelectorAll("script[data-mcello-gsap-vendor]")]
      .map((script) => new URL(script.src).pathname),
  }));
  assert.deepEqual(runtime, {
    mode: "ready",
    version: "3.15.0",
    scrollTrigger: true,
    flip: true,
    vendorPaths: [
      "/vendor/gsap/gsap.min.js",
      "/vendor/gsap/ScrollTrigger.min.js",
      "/vendor/gsap/Flip.min.js",
    ],
  });

  const cleanup = await normal.evaluate(async () => {
    const { loadMcelloMotionEngine } = await import("/motion/engine.js");
    const engine = await loadMcelloMotionEngine();
    const node = document.createElement("div");
    document.body.appendChild(node);
    const scope = engine.createScope(node);
    scope.context(({ gsap }) => gsap.set(node, { x: 48, opacity: 0.5 }));
    const animated = { transform: node.style.transform, opacity: node.style.opacity };
    scope.cleanup();
    const reverted = { transform: node.style.transform, opacity: node.style.opacity };
    node.remove();
    return { animated, reverted };
  });
  assert.notEqual(cleanup.animated.transform, "");
  assert.equal(cleanup.animated.opacity, "0.5");
  assert.equal(cleanup.reverted.transform, "");
  assert.equal(cleanup.reverted.opacity, "");
  await normalContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const reduced = await reducedContext.newPage();
  await reduced.goto(baseUrl, { waitUntil: "networkidle" });
  await reduced.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "reduced");
  const reducedState = await reduced.evaluate(() => ({
    mode: document.documentElement.dataset.mcelloMotionEngine,
    vendorScripts: document.querySelectorAll("script[data-mcello-gsap-vendor]").length,
    gsapLoaded: typeof window.gsap !== "undefined",
    v2RevealHidden: document.documentElement.classList.contains("motion-ready"),
    heroOpacity: getComputedStyle(document.querySelector(".hero-copy")).opacity,
  }));
  assert.deepEqual(reducedState, {
    mode: "reduced",
    vendorScripts: 0,
    gsapLoaded: false,
    v2RevealHidden: false,
    heroOpacity: "1",
  });
  await reducedContext.close();

  const fallbackContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  await fallbackContext.route("**/vendor/gsap/**", (route) => route.abort("failed"));
  const fallback = await fallbackContext.newPage();
  const pageErrors = [];
  fallback.on("pageerror", (error) => pageErrors.push(String(error)));
  await fallback.goto(baseUrl, { waitUntil: "networkidle" });
  await fallback.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "fallback");
  await fallback.waitForFunction(() => document.querySelector(".hero-copy")?.classList.contains("is-revealed"));

  const fallbackState = await fallback.evaluate(() => ({
    mode: document.documentElement.dataset.mcelloMotionEngine,
    motionReady: document.documentElement.classList.contains("motion-ready"),
    heroRevealed: document.querySelector(".hero-copy")?.classList.contains("is-revealed") || false,
    heroDepth: document.querySelector(".hero-photo")?.style.getPropertyValue("--motion-hero-depth-y") || "",
  }));
  assert.equal(fallbackState.mode, "fallback");
  assert.equal(fallbackState.motionReady, true);
  assert.equal(fallbackState.heroRevealed, true);
  assert.notEqual(fallbackState.heroDepth, "");
  assert.deepEqual(pageErrors, []);
  await fallbackContext.close();

  console.log("Mcello Motion V3 adapter browser gate passed for ready, reduced-motion and vendor-fallback paths.");
} finally {
  await browser.close();
}
