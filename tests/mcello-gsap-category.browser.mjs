import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const scenario = process.argv[2] || "all";
const allowedScenarios = new Set(["all", "normal", "fallback", "reduced"]);
assert.ok(allowedScenarios.has(scenario), `unknown category scenario: ${scenario}`);

const browser = await chromium.launch({ headless: true });

async function openStore(page) {
  await page.locator("#bestellen").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll("#categoryRail [data-category]").length > 0);
}

async function clickFirstCategory(page) {
  const category = page.locator("#categoryRail [data-category]").first();
  const categoryId = await category.getAttribute("data-category");
  assert.ok(categoryId);
  await category.click();
  await page.waitForFunction(
    (id) => document.querySelector(".store-stage")?.dataset.motionCategory === id,
    categoryId,
  );
  return categoryId;
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
    await page.waitForFunction(() => document.documentElement.dataset.mcelloCategoryEngine === "gsap");
    await openStore(page);

    const categoryId = await clickFirstCategory(page);
    await page.waitForFunction(() => document.querySelector(".store-stage")?.dataset.motionCategoryEngine === "gsap");
    await page.waitForFunction(() => {
      const node = document.querySelector("#featuredGrid");
      return Boolean(node?.style.transform || node?.style.opacity);
    });

    const during = await page.locator("#featuredGrid").evaluate((node) => ({
      inlineTransform: node.style.transform,
      inlineOpacity: node.style.opacity,
      fallbackClass: node.classList.contains("motion-category-switch"),
    }));
    assert.equal(during.fallbackClass, false, `GSAP category path must not start the V2 keyframe: ${JSON.stringify(during)}`);
    assert.ok(during.inlineTransform || during.inlineOpacity, `GSAP category path should own an inline presentation frame: ${JSON.stringify(during)}`);

    await page.waitForTimeout(500);
    const after = await page.locator("#featuredGrid").evaluate((node) => ({
      inlineTransform: node.style.transform,
      inlineOpacity: node.style.opacity,
      fallbackClass: node.classList.contains("motion-category-switch"),
    }));
    assert.deepEqual(after, { inlineTransform: "", inlineOpacity: "", fallbackClass: false });
    assert.equal(
      await page.locator(`#categoryRail [data-category="${categoryId}"]`).first().evaluate((node) => node.classList.contains("active")),
      true,
      "application category state must remain authoritative and rendered independently of GSAP",
    );
    assert.deepEqual(pageErrors, []);
    console.log("Mcello GSAP category normal scenario passed.");
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
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloCategoryEngine), "v2");
    await openStore(page);
    await clickFirstCategory(page);
    await page.waitForFunction(() => document.querySelector("#featuredGrid")?.classList.contains("motion-category-switch"));
    assert.equal(await page.locator(".store-stage").getAttribute("data-motion-category-engine"), null);
    console.log("Mcello GSAP category vendor-fallback scenario passed.");
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
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloCategoryEngine), "reduced");
    assert.equal(await page.locator('script[data-mcello-gsap-vendor]').count(), 0);
    await openStore(page);
    const categoryId = await clickFirstCategory(page);
    const state = await page.locator("#featuredGrid").evaluate((node) => ({
      inlineTransform: node.style.transform,
      inlineOpacity: node.style.opacity,
      fallbackClass: node.classList.contains("motion-category-switch"),
    }));
    assert.deepEqual(state, { inlineTransform: "", inlineOpacity: "", fallbackClass: false });
    assert.equal(
      await page.locator(`#categoryRail [data-category="${categoryId}"]`).first().evaluate((node) => node.classList.contains("active")),
      true,
    );
    console.log("Mcello GSAP category reduced-motion scenario passed.");
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
