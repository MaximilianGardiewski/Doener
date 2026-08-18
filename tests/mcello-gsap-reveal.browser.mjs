import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

function identityTransform(transform) {
  const matrix = transform === "none" ? new DOMMatrix() : new DOMMatrix(transform);
  return matrix.is2D && matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
}

try {
  const normalContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  const normal = await normalContext.newPage();
  await normal.goto(baseUrl, { waitUntil: "networkidle" });
  await normal.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "ready");
  await normal.waitForFunction(() => document.documentElement.dataset.mcelloRevealEngine === "gsap");
  await normal.waitForFunction(() => document.querySelector("#aktuelles .section-head")?.dataset.motionRevealEngine === "gsap");

  const before = await normal.locator("#aktuelles .section-head").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      revealed: node.classList.contains("is-revealed"),
      engine: node.dataset.motionRevealEngine,
      opacity: style.opacity,
      transitionDuration: style.transitionDuration,
    };
  });
  assert.equal(before.revealed, false);
  assert.equal(before.engine, "gsap");
  assert.equal(before.opacity, "0");
  assert.match(before.transitionDuration, /(^|, )0s(,|$)/);

  await normal.locator("#aktuelles .section-head").scrollIntoViewIfNeeded();
  await normal.waitForFunction(() => document.querySelector("#aktuelles .section-head")?.classList.contains("is-revealed"));
  const after = await normal.locator("#aktuelles .section-head").evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      opacity: style.opacity,
      transform: style.transform,
      inlineOpacity: node.style.opacity,
      inlineTransform: node.style.transform,
    };
  });
  assert.equal(after.opacity, "1");
  assert.equal(await normal.evaluate(identityTransform, after.transform), true);
  assert.equal(after.inlineOpacity, "");
  assert.equal(after.inlineTransform, "");
  await normalContext.close();

  const fallbackContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  await fallbackContext.route("**/vendor/gsap/**", (route) => route.abort("failed"));
  const fallback = await fallbackContext.newPage();
  await fallback.goto(baseUrl, { waitUntil: "networkidle" });
  await fallback.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "fallback");
  assert.equal(await fallback.evaluate(() => document.documentElement.dataset.mcelloRevealEngine), "v2");
  assert.equal(await fallback.locator("#aktuelles .section-head").getAttribute("data-motion-reveal-engine"), null);
  await fallback.locator("#aktuelles .section-head").scrollIntoViewIfNeeded();
  await fallback.waitForFunction(() => document.querySelector("#aktuelles .section-head")?.classList.contains("is-revealed"));
  assert.equal(await fallback.locator("#aktuelles .section-head").evaluate((node) => getComputedStyle(node).opacity), "1");
  await fallbackContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const reduced = await reducedContext.newPage();
  await reduced.goto(baseUrl, { waitUntil: "networkidle" });
  await reduced.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "reduced");
  const reducedState = await reduced.evaluate(() => ({
    revealEngine: document.documentElement.dataset.mcelloRevealEngine,
    motionReady: document.documentElement.classList.contains("motion-ready"),
    targetRevealed: document.querySelector("#aktuelles .section-head")?.classList.contains("is-revealed") || false,
    targetGsap: document.querySelector("#aktuelles .section-head")?.dataset.motionRevealEngine || null,
    targetOpacity: getComputedStyle(document.querySelector("#aktuelles .section-head")).opacity,
  }));
  assert.deepEqual(reducedState, {
    revealEngine: "reduced",
    motionReady: false,
    targetRevealed: true,
    targetGsap: null,
    targetOpacity: "1",
  });
  await reducedContext.close();

  console.log("Mcello GSAP reveal gate passed for staged takeover, V2 fallback and reduced-motion parity.");
} finally {
  await browser.close();
}
