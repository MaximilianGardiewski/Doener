import assert from "node:assert/strict";
import { chromium } from "playwright";

const APP_URL = process.env.MCELLO_DEMO_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

async function openNamedProduct(page, productName) {
  await page.locator("#categoryRail [data-category]").first().waitFor({ state: "visible", timeout: 20_000 });
  const categories = page.locator("#categoryRail [data-category]");
  const categoryCount = await categories.count();

  for (let categoryIndex = 0; categoryIndex < categoryCount; categoryIndex += 1) {
    await categories.nth(categoryIndex).click();
    const rows = page.locator(".food-card, .list-row");
    const rowCount = await rows.count();
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = rows.nth(rowIndex);
      const heading = row.locator("h3, strong").first();
      if (!(await heading.count())) continue;
      if ((await heading.textContent())?.trim() !== productName) continue;
      const button = row.locator("[data-product]").first();
      assert.equal(await button.isEnabled(), true, `${productName} must be orderable in the local presentation`);
      await button.click();
      await page.waitForFunction((expected) => {
        const modal = document.querySelector("#productModal");
        return modal?.classList.contains("open") && document.querySelector("#modalTitle")?.textContent?.trim() === expected;
      }, productName);
      return;
    }
  }

  throw new Error(`${productName} was not discoverable in the local presentation menu`);
}

async function modifierGroup(page, name) {
  const groups = page.locator("#modifierGroups .modifier-group");
  for (let index = 0; index < await groups.count(); index += 1) {
    const group = groups.nth(index);
    if ((await group.locator(".modifier-head strong").textContent())?.trim() === name) return group;
  }
  throw new Error(`Modifier group ${name} was not rendered`);
}

async function optionInput(group, name) {
  const options = group.locator(".modifier-option");
  for (let index = 0; index < await options.count(); index += 1) {
    const option = options.nth(index);
    if ((await option.locator("span").first().textContent())?.replace(/ · ausverkauft$/i, "").trim() === name) return option.locator("input");
  }
  throw new Error(`Modifier option ${name} was not rendered`);
}

async function waitDataset(page, key, expected) {
  await page.waitForFunction(({ key, expected }) => document.querySelector("#productModal")?.dataset[key] === expected, { key, expected });
}

async function desktopPresentationFlow() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });

  await openNamedProduct(page, "Pizza Mcello");
  await waitDataset(page, "productBuilder", "pizza");
  await waitDataset(page, "pizzaPresentation", "true");
  await waitDataset(page, "pizzaVisualLayers", "5");
  assert.match(await page.locator("#modalImage").getAttribute("src"), /^data:image\/svg\+xml/);
  assert.match(await page.locator("#modalImage").getAttribute("alt"), /Schematische interaktive Pizza-Vorschau/);

  const pizzaGroup = await modifierGroup(page, "Belag");
  assert.deepEqual(
    await pizzaGroup.locator(".modifier-option span:first-of-type").allTextContents(),
    ["Kebap Fleisch", "Tomaten", "Broccoli", "Käse", "Zwiebeln"],
  );
  assert.equal(await pizzaGroup.locator("input:checked").count(), 5, "Pizza Mcello must start from its five presentation recipe ingredients");
  const onions = await optionInput(pizzaGroup, "Zwiebeln");
  await onions.uncheck();
  await waitDataset(page, "pizzaVisualLayers", "4");
  await onions.check();
  await waitDataset(page, "pizzaVisualLayers", "5");

  assert.match(await page.locator("#addToCart").textContent(), /In den Warenkorb/);
  await page.locator("#addToCart").click();
  await page.locator("#cartDrawer").waitFor({ state: "visible" });
  assert.match(await page.locator("#cartItems").innerText(), /Pizza Mcello/);
  await page.locator("[data-close-cart]").click();

  await openNamedProduct(page, "Drehspieß im Yufka");
  await waitDataset(page, "productBuilder", "doner-yufka");
  await waitDataset(page, "assemblyPresentation", "true");
  await waitDataset(page, "assemblyVisualLayers", "0");
  assert.match(await page.locator("#modalImage").getAttribute("src"), /^data:image\/svg\+xml/);
  assert.match(await page.locator("#modalImage").getAttribute("alt"), /Schematische interaktive Döner\/Yufka-Vorschau/);

  const sauceGroup = await modifierGroup(page, "Soße");
  assert.deepEqual(
    await sauceGroup.locator(".modifier-option span:first-of-type").allTextContents(),
    ["Curry", "Knoblauch", "Scharf"],
  );
  for (const [index, sauce] of ["Curry", "Knoblauch", "Scharf"].entries()) {
    await (await optionInput(sauceGroup, sauce)).check();
    await waitDataset(page, "assemblyVisualLayers", String(index + 1));
  }

  await page.locator("#addToCart").click();
  await page.locator("#cartDrawer").waitFor({ state: "visible" });
  const cart = await page.locator("#cartItems").innerText();
  assert.match(cart, /Pizza Mcello/);
  assert.match(cart, /Drehspieß im Yufka/);
  assert.match(cart, /Soße: Curry/);
  assert.match(cart, /Soße: Knoblauch/);
  assert.match(cart, /Soße: Scharf/);
  assert.equal((await page.locator("#cartCount").textContent())?.trim(), "2 Artikel");
  assert.deepEqual(errors, [], errors.join("\n"));
  await context.close();
}

async function mobileRotationFlow() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
  await openNamedProduct(page, "Pizza Mcello");
  await waitDataset(page, "productBuilder", "pizza");
  await waitDataset(page, "pizzaVisualLayers", "5");
  await waitDataset(page, "builderOrientation", "portrait");
  assert.equal(await page.locator("[data-builder-orientation-gate]").isVisible(), true, "phone portrait must show the rotate experience");

  await page.setViewportSize({ width: 740, height: 360 });
  await waitDataset(page, "builderOrientation", "landscape");
  assert.equal(await page.locator("[data-builder-orientation-gate]").isHidden(), true);
  assert.equal(await page.locator("#productModal .modal").isVisible(), true);
  assert.equal(await page.locator('[data-builder-food-stage="true"]').isVisible(), true);
  assert.equal(await page.locator('[data-builder-action-bar="true"]').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "phone landscape must not overflow horizontally");

  const pizzaGroup = await modifierGroup(page, "Belag");
  const onions = await optionInput(pizzaGroup, "Zwiebeln");
  await onions.uncheck();
  await waitDataset(page, "pizzaVisualLayers", "4");

  await page.setViewportSize({ width: 390, height: 844 });
  await waitDataset(page, "builderOrientation", "portrait");
  assert.equal(await page.locator("[data-builder-orientation-gate]").isVisible(), true);
  await page.setViewportSize({ width: 740, height: 360 });
  await waitDataset(page, "builderOrientation", "landscape");
  await waitDataset(page, "pizzaVisualLayers", "4");
  assert.equal(await onions.isChecked(), false, "real modifier selection must survive portrait/landscape rotation without reload");
  assert.deepEqual(errors, [], errors.join("\n"));
  await context.close();
}

try {
  await desktopPresentationFlow();
  await mobileRotationFlow();
  console.log("Mcello presentation Builders passed: Pizza layers, Döner/Yufka sauces, cart selections and mobile landscape state preservation.");
} finally {
  await browser.close();
}
