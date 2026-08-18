import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const scenario = process.argv[2] || "all";
const allowedScenarios = new Set(["all", "normal", "fallback", "reduced"]);
assert.ok(allowedScenarios.has(scenario), `unknown ingredient scenario: ${scenario}`);

const browser = await chromium.launch({ headless: true });

async function closeProduct(page) {
  const modal = page.locator("#productModal");
  if (!(await modal.evaluate((node) => node.classList.contains("open")))) return;
  await page.locator("[data-close-modal]").click();
  await page.waitForFunction(() => !document.querySelector("#productModal")?.classList.contains("open"));
}

async function openConfigurableProduct(page) {
  await page.locator("#bestellen").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll("#categoryRail [data-category]").length > 0);

  const categoryCount = await page.locator("#categoryRail [data-category]").count();
  for (let categoryIndex = 0; categoryIndex < categoryCount; categoryIndex += 1) {
    const categories = page.locator("#categoryRail [data-category]");
    if (categoryIndex >= await categories.count()) break;
    await categories.nth(categoryIndex).click();
    await page.waitForTimeout(40);

    const productCount = await page.locator('[data-product]:not([disabled])').count();
    for (let productIndex = 0; productIndex < productCount; productIndex += 1) {
      const products = page.locator('[data-product]:not([disabled])');
      if (productIndex >= await products.count()) break;
      await products.nth(productIndex).click();
      await page.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
      if (await page.locator("#modifierGroups input:not(:disabled)").count()) return;
      await closeProduct(page);
    }
  }
  assert.fail("expected at least one configurable Mcello product in the preview fixture");
}

async function waitForProductOpenPresentation(page) {
  await page.waitForTimeout(450);
}

async function stageState(page) {
  return page.evaluate(() => {
    const doner = document.querySelector('#productModal.open [data-food-stage-v4="true"]');
    if (doner) return { kind: "doner-yufka", selector: '[data-food-stage-v4="true"]' };
    const pizza = document.querySelector("#productModal.open [data-pizza-stage]");
    if (pizza) return { kind: "pizza", selector: "[data-pizza-stage]" };
    return { kind: "generic", selector: "#productModal.open .modal-hero" };
  });
}

async function triggerModifier(page) {
  const unchecked = page.locator("#modifierGroups input:not(:disabled):not(:checked)").first();
  const checkedCheckbox = page.locator('#modifierGroups input[type="checkbox"]:not(:disabled):checked').first();
  let input;

  if (await unchecked.count()) {
    input = unchecked;
    await input.click();
  } else if (await checkedCheckbox.count()) {
    input = checkedCheckbox;
    await input.click();
  } else {
    input = page.locator("#modifierGroups input:not(:disabled)").first();
    await input.dispatchEvent("change");
  }

  const checked = await input.isChecked();
  const option = input.locator("xpath=ancestor::*[contains(@class,'modifier-option')][1]");
  return { input, option, checked };
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
    await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "gsap");
    await openConfigurableProduct(page);
    await waitForProductOpenPresentation(page);
    const stage = await stageState(page);

    const { input, option, checked } = await triggerModifier(page);
    await page.waitForFunction(() => document.querySelector(".modifier-option[data-motion-ingredient-engine='gsap']"));

    const optionDuring = await option.evaluate((node) => ({
      owner: node.dataset.motionIngredientEngine,
      selection: node.dataset.motionSelection,
      inlineTransform: node.style.transform,
      fallbackClass: node.classList.contains("motion-ingredient-change"),
      transitionDuration: getComputedStyle(node).transitionDuration,
    }));
    assert.equal(optionDuring.owner, "gsap");
    assert.equal(optionDuring.selection, checked ? "added" : "removed");
    assert.equal(optionDuring.fallbackClass, false);
    assert.ok(optionDuring.inlineTransform, `GSAP should own an option transform frame: ${JSON.stringify(optionDuring)}`);
    assert.match(optionDuring.transitionDuration, /(^|, )0s(,|$)/);

    const stageLocator = page.locator(stage.selector).first();
    if (stage.kind === "pizza") {
      assert.equal(await stageLocator.getAttribute("data-motion-ingredient-engine"), null, "Pizza stage must stay owned by its builder pulse, not GSAP");
      assert.equal(await stageLocator.evaluate((node) => node.classList.contains("motion-food-stage-change")), false);
      const activeAnimations = await stageLocator.evaluate((node) => node.getAnimations().length);
      assert.ok(activeAnimations >= 1, "Pizza builder should retain its own stage pulse while GSAP owns only the modifier option");
    } else {
      await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.motionIngredientEngine === "gsap", stage.selector);
      assert.equal(await stageLocator.evaluate((node) => node.classList.contains("motion-food-stage-change")), false);
    }

    await page.waitForFunction(() => !document.querySelector(".modifier-option[data-motion-ingredient-engine='gsap']"));
    assert.equal(await input.isChecked(), checked, "motion must not rewrite the application-validated modifier state");
    assert.equal(await option.evaluate((node) => node.style.transform), "");
    if (stage.kind !== "pizza") {
      await page.waitForFunction((selector) => !document.querySelector(selector)?.hasAttribute("data-motion-ingredient-engine"), stage.selector);
      assert.equal(await stageLocator.evaluate((node) => node.style.transform), "");
      assert.equal(await stageLocator.evaluate((node) => node.style.opacity), "");
    }
    assert.deepEqual(pageErrors, []);
    console.log(`Mcello GSAP ingredient normal scenario passed (${stage.kind} stage).`);
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
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloIngredientEngine), "v2");
    await openConfigurableProduct(page);
    const stage = await stageState(page);
    const { input, option, checked } = await triggerModifier(page);
    await page.waitForFunction(() => document.querySelector(".modifier-option.motion-ingredient-change"));
    assert.equal(await option.getAttribute("data-motion-ingredient-engine"), null);

    const stageLocator = page.locator(stage.selector).first();
    if (stage.kind === "pizza") {
      assert.equal(await stageLocator.evaluate((node) => node.classList.contains("motion-food-stage-change")), false);
      assert.ok(await stageLocator.evaluate((node) => node.getAnimations().length) >= 1, "Pizza fallback keeps its builder-owned pulse");
    } else {
      await page.waitForFunction((selector) => document.querySelector(selector)?.classList.contains("motion-food-stage-change"), stage.selector);
    }
    assert.equal(await input.isChecked(), checked);
    console.log(`Mcello GSAP ingredient vendor-fallback scenario passed (${stage.kind} stage).`);
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
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloIngredientEngine), "reduced");
    assert.equal(await page.locator('script[data-mcello-gsap-vendor]').count(), 0);
    await openConfigurableProduct(page);
    const stage = await stageState(page);
    const { input, option, checked } = await triggerModifier(page);
    await page.waitForTimeout(40);

    assert.equal(await option.evaluate((node) => node.classList.contains("motion-ingredient-change")), false);
    assert.equal(await option.getAttribute("data-motion-ingredient-engine"), null);
    const stageLocator = page.locator(stage.selector).first();
    assert.equal(await stageLocator.evaluate((node) => node.classList.contains("motion-food-stage-change")), false);
    assert.equal(await stageLocator.getAttribute("data-motion-ingredient-engine"), null);
    assert.equal(await input.isChecked(), checked);
    if (stage.kind === "pizza") assert.equal(await stageLocator.evaluate((node) => node.getAnimations().length), 0);
    console.log(`Mcello GSAP ingredient reduced-motion scenario passed (${stage.kind} stage).`);
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