import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const scenario = process.argv[2] || "all";
const allowedScenarios = new Set(["all", "normal", "fallback", "reduced"]);
assert.ok(allowedScenarios.has(scenario), `unknown product-open scenario: ${scenario}`);

const browser = await chromium.launch({ headless: true });

function identityTransform(transform) {
  const matrix = transform === "none" ? new DOMMatrix() : new DOMMatrix(transform);
  return matrix.is2D && matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
}

async function openStore(page) {
  await page.locator("#bestellen").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('[data-product]:not([disabled])'));
}

async function triggerProduct(page) {
  const button = page.locator('[data-product]:not([disabled])').first();
  const expectedTitle = await button.locator("xpath=ancestor::*[contains(@class,'food-card') or contains(@class,'list-row')][1]").locator("h3, strong").first().textContent();
  await button.click();
  await page.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
  assert.equal(await page.locator("#productModal").getAttribute("aria-hidden"), "false");
  assert.equal((await page.locator("#modalTitle").textContent())?.trim(), expectedTitle?.trim());
  return expectedTitle;
}

async function normalScenario() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "ready");
    await page.waitForFunction(() => document.documentElement.dataset.mcelloProductEngine === "gsap");
    await openStore(page);
    await triggerProduct(page);

    await page.waitForFunction(() => document.querySelector("#productModal .modal")?.dataset.motionProductEngine === "gsap");
    const during = await page.locator("#productModal .modal").evaluate((node) => ({
      inlineOpacity: node.style.opacity,
      inlineTransform: node.style.transform,
      fallbackClass: node.classList.contains("motion-product-open"),
      transitionDuration: getComputedStyle(node).transitionDuration,
    }));
    assert.equal(during.fallbackClass, false, `GSAP product path must not start the V2 modal keyframe: ${JSON.stringify(during)}`);
    assert.ok(during.inlineOpacity || during.inlineTransform, `GSAP product path should own an inline presentation frame: ${JSON.stringify(during)}`);
    assert.match(during.transitionDuration, /(^|, )0s(,|$)/, `GSAP product frames must not contend with CSS transitions: ${JSON.stringify(during)}`);

    await page.waitForFunction(() => !document.querySelector("#productModal .modal")?.hasAttribute("data-motion-product-engine"));
    const after = await page.locator("#productModal .modal").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        opacity: style.opacity,
        transform: style.transform,
        inlineOpacity: node.style.opacity,
        inlineTransform: node.style.transform,
      };
    });
    assert.equal(after.opacity, "1");
    assert.equal(await page.evaluate(identityTransform, after.transform), true);
    assert.equal(after.inlineOpacity, "");
    assert.equal(after.inlineTransform, "");
    assert.deepEqual(pageErrors, []);
    console.log("Mcello GSAP product-open normal scenario passed.");
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
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloProductEngine), "v2");
    await openStore(page);
    await triggerProduct(page);
    await page.waitForFunction(() => document.querySelector("#productModal .modal")?.classList.contains("motion-product-open"));
    assert.equal(await page.locator("#productModal .modal").getAttribute("data-motion-product-engine"), null);
    await page.locator("#productModal .modal").evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
    });
    assert.equal(await page.locator("#productModal .modal").evaluate((node) => getComputedStyle(node).opacity), "1");
    console.log("Mcello GSAP product-open vendor-fallback scenario passed.");
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
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloProductEngine), "reduced");
    assert.equal(await page.locator('script[data-mcello-gsap-vendor]').count(), 0);
    await openStore(page);
    await triggerProduct(page);
    const state = await page.locator("#productModal .modal").evaluate((node) => {
      const style = getComputedStyle(node);
      const transform = style.transform;
      const matrix = transform === "none" ? new DOMMatrix() : new DOMMatrix(transform);
      return {
        opacity: style.opacity,
        identityTransform: matrix.is2D && matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0,
        fallbackClass: node.classList.contains("motion-product-open"),
        gsapOwner: node.hasAttribute("data-motion-product-engine"),
      };
    });
    assert.deepEqual(state, { opacity: "1", identityTransform: true, fallbackClass: false, gsapOwner: false });
    console.log("Mcello GSAP product-open reduced-motion scenario passed.");
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