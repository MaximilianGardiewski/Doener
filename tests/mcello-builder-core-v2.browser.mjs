import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

async function openBuilderProduct(page) {
  await page.locator("#bestellen").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('[data-product]:not([disabled])').length > 0);
  const buttons = page.locator('[data-product]:not([disabled])');
  const count = await buttons.count();

  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) continue;
    await button.click();
    await page.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
    await page.waitForFunction(() => document.querySelector("#productModal .modal")?.dataset.builderVersion === "core-v2");
    return;
  }

  throw new Error("No orderable product found in preview data");
}

async function exerciseModifierStateWhenPresent(page) {
  const inputs = page.locator("#modifierGroups input");
  const inputCount = await inputs.count();
  const context = page.locator("[data-builder-context]");

  if (inputCount === 0) {
    assert.equal(await page.locator("#modifierGroups .builder-step").count(), 0, "preview without first-party modifiers must not invent Builder steps");
    assert.equal(await context.isHidden(), true, "Mcello Original helper stays hidden when there is no structured modifier recipe to explain");
    assert.equal(await page.locator("#productModal").getAttribute("data-builder-original-selection"), "[]", "empty first-party modifier state should snapshot honestly");
    assert.equal(await page.locator("#productModal").getAttribute("data-builder-recipe-state"), "original");
    return { hadModifiers: false, originalSignature: "[]" };
  }

  assert.equal(await context.isVisible(), true, "Mcello Original helper should be visible when structured modifier steps exist");
  const originalSignature = await page.locator("#productModal").getAttribute("data-builder-original-selection");
  assert.ok(originalSignature, "Builder Core should snapshot the actual checked standard selection");
  assert.equal(await page.locator("#productModal").getAttribute("data-builder-recipe-state"), "original");
  assert.match(await page.locator("[data-builder-selection-state]").textContent(), /Standardauswahl/);

  const checkbox = page.locator('#modifierGroups input[type="checkbox"]:not(:disabled)').first();
  const uncheckedRadio = page.locator('#modifierGroups input[type="radio"]:not(:disabled):not(:checked)').first();
  if (await checkbox.count()) {
    if (await checkbox.isChecked()) await checkbox.uncheck();
    else await checkbox.check();
  } else if (await uncheckedRadio.count()) {
    await uncheckedRadio.check();
  } else {
    return { hadModifiers: true, originalSignature };
  }

  await page.waitForFunction(() => document.querySelector("#productModal")?.dataset.builderRecipeState === "customized");
  assert.match(await page.locator("[data-builder-selection-state]").textContent(), /Angepasst/);
  assert.equal(await page.locator("#productModal").getAttribute("data-builder-original-selection"), originalSignature, "visual Builder must not rewrite the captured original recipe signature");

  const optionHeights = await page.locator('[data-builder-option="true"]').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
  assert.ok(optionHeights.every((height) => height >= 44), "modifier choices must remain touch-safe");
  return { hadModifiers: true, originalSignature };
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  await openBuilderProduct(desktop);

  const modal = desktop.locator("#productModal .modal");
  const stage = desktop.locator('[data-builder-food-stage="true"]');
  const controls = desktop.locator('[data-builder-controls="true"]');
  const actionBar = desktop.locator('[data-builder-action-bar="true"]');
  const steps = desktop.locator("#modifierGroups .builder-step");
  const groups = desktop.locator("#modifierGroups .modifier-group");

  assert.equal(await modal.getAttribute("data-builder-version"), "core-v2");
  assert.equal(await stage.count(), 1, "existing modal image should become the one Builder FoodStage");
  assert.equal(await controls.count(), 1, "existing modal content should remain the one control pane");
  assert.equal(await actionBar.count(), 1, "existing footer should become the one Builder action bar");
  assert.equal(await steps.count(), await groups.count(), "each existing modifier group should map to exactly one visual step");

  const layout = await modal.evaluate((node) => {
    const style = getComputedStyle(node);
    return { display: style.display, columns: style.gridTemplateColumns };
  });
  assert.equal(layout.display, "grid");
  assert.match(layout.columns, /\d+(?:\.\d+)?px \d+(?:\.\d+)?px/, "desktop builder should resolve to two visual columns");

  await exerciseModifierStateWhenPresent(desktop);

  const addButton = desktop.locator("#addToCart");
  assert.match(await addButton.textContent(), /In den Warenkorb ·|Online derzeit nicht bestellbar/);
  assert.ok(await actionBar.evaluate((node) => node.getBoundingClientRect().height) >= 48, "Builder action bar must remain reachable");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: "reduce" });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await openBuilderProduct(mobile);

  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    "Builder Core must not introduce mobile horizontal overflow",
  );

  const mobileModal = mobile.locator("#productModal .modal");
  const mobileLayout = await mobileModal.evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { columns: style.gridTemplateColumns, width: rect.width, viewport: window.innerWidth };
  });
  assert.ok(mobileLayout.width <= mobileLayout.viewport + 1, "mobile builder sheet must fit the viewport");
  assert.doesNotMatch(mobileLayout.columns, /\s\d+(?:\.\d+)?px\s+\d+(?:\.\d+)?px/, "mobile builder should collapse to one column");

  assert.equal(await mobile.locator('[data-builder-food-stage="true"]').isVisible(), true);
  assert.equal(await mobile.locator('[data-builder-action-bar="true"]').isVisible(), true);
  assert.ok(await mobile.locator("#addToCart").evaluate((node) => node.getBoundingClientRect().height) >= 48, "mobile add action must keep the primary touch target");
  await exerciseModifierStateWhenPresent(mobile);

  console.log("Builder Core V2 Chromium smoke passed for truthful zero/modifier-step states, existing price action, and mobile sheet layout.");
} finally {
  await browser.close();
}
