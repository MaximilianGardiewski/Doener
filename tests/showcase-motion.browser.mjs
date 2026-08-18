import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

async function computed(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    const transform = style.transform;
    const matrix = transform === "none" ? new DOMMatrix() : new DOMMatrix(transform);
    const identityTransform =
      matrix.is2D &&
      matrix.a === 1 &&
      matrix.b === 0 &&
      matrix.c === 0 &&
      matrix.d === 1 &&
      matrix.e === 0 &&
      matrix.f === 0;

    return {
      opacity: style.opacity,
      transform,
      identityTransform,
      transitionDuration: style.transitionDuration,
    };
  });
}

async function waitForAnimations(page, selector) {
  await page.locator(selector).evaluate(async (node) => {
    const animations = node.getAnimations();
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
}

try {
  const normal = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "no-preference" });
  await normal.goto(baseUrl, { waitUntil: "networkidle" });
  await normal.waitForFunction(() => document.querySelector('[data-reveal="hero-media"]'));
  assert.equal(
    await normal.evaluate(() => document.documentElement.classList.contains("motion-ready")),
    true,
    "normal-motion browser should enable progressive reveal",
  );
  await normal.waitForFunction(() => document.querySelector(".hero-copy")?.classList.contains("is-revealed"));
  await waitForAnimations(normal, ".hero-copy");
  const revealed = await computed(normal, ".hero-copy");
  assert.equal(revealed.opacity, "1", "visible hero must finish fully opaque");
  assert.equal(revealed.identityTransform, true, "visible hero must finish without transform offset");

  await normal.locator("#aktuelles").scrollIntoViewIfNeeded();
  await normal.waitForFunction(() => document.querySelector("#aktuelles .section-head")?.classList.contains("is-revealed"));
  assert.equal(
    await normal.locator("#aktuelles .section-head").getAttribute("data-reveal"),
    "section",
    "below-fold content should participate in reveal motion",
  );

  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: "reduce" });
  await reduced.goto(baseUrl, { waitUntil: "networkidle" });
  await reduced.waitForFunction(() => document.querySelector(".hero-copy")?.hasAttribute("data-reveal"));
  assert.equal(
    await reduced.evaluate(() => document.documentElement.classList.contains("motion-ready")),
    false,
    "reduced-motion browser must not activate reveal-hidden state",
  );
  const reducedHero = await computed(reduced, ".hero-copy");
  assert.equal(reducedHero.opacity, "1", "reduced motion must keep content visible");
  assert.equal(reducedHero.identityTransform, true, "reduced motion must remove motion transforms");
  assert.match(reducedHero.transitionDuration, /(^|, )0s(,|$)/, "reduced motion must disable transitions");

  console.log("D058 Chromium motion smoke passed for normal and reduced-motion preferences.");
} finally {
  await browser.close();
}
