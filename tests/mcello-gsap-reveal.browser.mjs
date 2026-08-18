import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const scenario = process.argv[2] || "all";
const allowedScenarios = new Set(["all", "normal", "fallback", "reduced"]);
assert.ok(allowedScenarios.has(scenario), `unknown reveal scenario: ${scenario}`);

const browser = await chromium.launch({ headless: true });

function identityTransform(transform) {
  const matrix = transform === "none" ? new DOMMatrix() : new DOMMatrix(transform);
  return matrix.is2D && matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
}

async function waitForAnimations(page, selector) {
  await page.locator(selector).evaluate(async (node) => {
    const animations = node.getAnimations();
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function normalScenario() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "ready");
    await page.waitForFunction(() => document.documentElement.dataset.mcelloRevealEngine === "gsap");
    await page.waitForFunction(() => document.querySelector("#aktuelles .section-head")?.dataset.motionRevealEngine === "gsap");

    const before = await page.locator("#aktuelles .section-head").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        revealed: node.classList.contains("is-revealed"),
        engine: node.dataset.motionRevealEngine,
        opacity: style.opacity,
        transitionDuration: style.transitionDuration,
      };
    });
    assert.equal(before.revealed, false, `normal before: expected pending reveal, got ${JSON.stringify(before)}`);
    assert.equal(before.engine, "gsap", `normal before: expected GSAP ownership, got ${JSON.stringify(before)}`);
    assert.equal(before.opacity, "0", `normal before: expected hidden pending target, got ${JSON.stringify(before)}`);
    assert.match(before.transitionDuration, /(^|, )0s(,|$)/, `normal before: CSS transition must not contend with GSAP: ${JSON.stringify(before)}`);

    await page.locator("#aktuelles .section-head").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("#aktuelles .section-head")?.classList.contains("is-revealed"));
    const after = await page.locator("#aktuelles .section-head").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        opacity: style.opacity,
        transform: style.transform,
        inlineOpacity: node.style.opacity,
        inlineTransform: node.style.transform,
      };
    });
    assert.equal(after.opacity, "1", `normal after: target must finish visible: ${JSON.stringify(after)}`);
    assert.equal(await page.evaluate(identityTransform, after.transform), true, `normal after: target must finish at identity transform: ${JSON.stringify(after)}`);
    assert.equal(after.inlineOpacity, "", `normal after: GSAP opacity must be cleared: ${JSON.stringify(after)}`);
    assert.equal(after.inlineTransform, "", `normal after: GSAP transform must be cleared: ${JSON.stringify(after)}`);
    console.log("Mcello GSAP reveal normal scenario passed.");
  } finally {
    await context.close();
  }
}

async function fallbackScenario() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    await context.route("**/vendor/gsap/**", (route) => route.abort("failed"));
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "fallback");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloRevealEngine), "v2");
    assert.equal(await page.locator("#aktuelles .section-head").getAttribute("data-motion-reveal-engine"), null);
    await page.locator("#aktuelles .section-head").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("#aktuelles .section-head")?.classList.contains("is-revealed"));
    await waitForAnimations(page, "#aktuelles .section-head");
    assert.equal(await page.locator("#aktuelles .section-head").evaluate((node) => getComputedStyle(node).opacity), "1");
    console.log("Mcello GSAP reveal vendor-fallback scenario passed.");
  } finally {
    await context.close();
  }
}

async function reducedScenario() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "reduced");
    const state = await page.evaluate(() => ({
      revealEngine: document.documentElement.dataset.mcelloRevealEngine,
      motionReady: document.documentElement.classList.contains("motion-ready"),
      targetRevealed: document.querySelector("#aktuelles .section-head")?.classList.contains("is-revealed") || false,
      targetGsap: document.querySelector("#aktuelles .section-head")?.dataset.motionRevealEngine || null,
      targetOpacity: getComputedStyle(document.querySelector("#aktuelles .section-head")).opacity,
    }));
    assert.deepEqual(state, {
      revealEngine: "reduced",
      motionReady: false,
      targetRevealed: true,
      targetGsap: null,
      targetOpacity: "1",
    });
    console.log("Mcello GSAP reveal reduced-motion scenario passed.");
  } finally {
    await context.close();
  }
}

try {
  if (scenario === "all" || scenario === "normal") await normalScenario();
  if (scenario === "all" || scenario === "fallback") await fallbackScenario();
  if (scenario === "all" || scenario === "reduced") await reducedScenario();
} finally {
  await browser.close();
}
