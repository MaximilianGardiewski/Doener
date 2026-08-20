import assert from "node:assert/strict";
import { chromium } from "playwright";

/*
 * Closes an evidence gap rather than inventing catalog truth.
 *
 * The sold-out and paid-extra option states are implemented and statically
 * guarded, but the presentation fixtures deliberately contain neither: adding a
 * surcharge there would encode an unconfirmed price, and the preview build
 * asserts every fixture option stays at zero. So the states were never actually
 * rendered.
 *
 * This test supplies the menu payload itself, which keeps the invented values
 * inside the test where they belong, and drives the real application end to end
 * against them.
 */

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

const MENU = {
  locationId: "browser-test",
  categories: [{
    id: "warm",
    slug: "warm",
    name: "Warme Spezialitäten",
    sort: 10,
    products: [{
      id: "state-probe",
      name: "Zustandsprobe",
      description: "Nur für den Rendering-Test dieser Zustände.",
      basePriceCents: 800,
      orderableOnline: true,
      availableNow: true,
      soldOut: false,
      ownerConfirmed: false,
      modifierGroups: [
        {
          id: "basis",
          name: "Basis",
          minSelections: 1,
          maxSelections: 1,
          options: [
            { id: "b-fleisch", name: "Fleisch", priceDeltaCents: 0, defaultSelected: false, soldOut: false },
            { id: "b-falafel", name: "Falafel", priceDeltaCents: 0, defaultSelected: false, soldOut: false },
          ],
        },
        {
          id: "gemuese",
          name: "Gemüse",
          minSelections: 0,
          maxSelections: 4,
          options: [
            { id: "g-salat", name: "Salat", priceDeltaCents: 0, defaultSelected: true, soldOut: false },
            { id: "g-avocado", name: "Avocado", priceDeltaCents: 0, defaultSelected: false, soldOut: true },
          ],
        },
        {
          id: "extras",
          name: "Extras",
          minSelections: 0,
          maxSelections: 2,
          options: [
            { id: "x-meat", name: "Extra Fleisch", priceDeltaCents: 250, defaultSelected: false, soldOut: false },
          ],
        },
      ],
    }],
  }],
  productCrossSells: [],
  crossSellRules: [],
};

async function openProbe(page) {
  await page.route("**/api/menu*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(MENU),
  }));
  await page.goto(`${baseUrl}/?presentation=mcello#bestellen`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-product="state-probe"]');
  await page.locator('[data-product="state-probe"]').first().click({ force: true });
  await page.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
  await page.waitForTimeout(400);
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await openProbe(page);

  // --- required group unsatisfied -----------------------------------------
  // No option in "Basis" is defaultSelected, so the configuration opens invalid.
  const addButton = page.locator("#addToCart");
  assert.equal(await addButton.isDisabled(), true, "an unsatisfied required group must block add-to-cart");
  assert.equal(
    (await page.locator("[data-builder-accept-recipe]").textContent())?.trim(),
    "Pflichtauswahl fehlt",
    "the one-tap path must say why it cannot be used instead of silently failing",
  );
  assert.equal(
    await page.locator('.modifier-group[data-group-id="basis"]').getAttribute("data-required"),
    "true",
    "the application must publish which groups are required",
  );

  // --- sold out ------------------------------------------------------------
  const soldOut = page.locator('.modifier-option[data-option-name="Avocado"]');
  assert.equal(await soldOut.count(), 1, "a sold-out option stays visible rather than being removed");
  assert.equal(await soldOut.getAttribute("data-sold-out"), "true");
  assert.equal(await soldOut.locator("input").isDisabled(), true, "a sold-out option must not be selectable");
  const soldOutNote = await soldOut.evaluate((node) => getComputedStyle(node, "::after").content);
  assert.match(soldOutNote, /Heute nicht verfügbar/, "sold-out must be stated in words, not only by opacity");
  const soldOutVisible = await soldOut.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(node).display !== "none";
  });
  assert.equal(soldOutVisible, true, "sold-out must remain rendered");

  // Clicking it must change nothing.
  const layersBefore = await page.locator("#productModal").getAttribute("data-assembly-visual-layers");
  await soldOut.click({ force: true });
  await page.waitForTimeout(200);
  assert.equal(await soldOut.locator("input").isChecked(), false, "a sold-out option must stay unchecked when clicked");
  assert.equal(
    await page.locator("#productModal").getAttribute("data-assembly-visual-layers"),
    layersBefore,
    "a rejected selection must not move the FoodStage",
  );

  // --- paid extra ----------------------------------------------------------
  const paid = page.locator('.modifier-option[data-option-name="Extra Fleisch"]');
  assert.equal(await paid.getAttribute("data-paid"), "true");
  assert.equal(await paid.getAttribute("data-price-delta-cents"), "250");
  assert.match((await paid.locator("span").last().textContent()) ?? "", /\+\s?2,50/, "a surcharge must show its amount");
  const included = page.locator('.modifier-option[data-option-name="Salat"]');
  assert.equal(await included.getAttribute("data-paid"), "false");

  // A surcharge must not read like an included option.
  const [paidStyle, includedStyle] = await Promise.all([
    paid.locator("span").last().evaluate((n) => getComputedStyle(n).backgroundColor),
    included.locator("span").last().evaluate((n) => getComputedStyle(n).backgroundColor),
  ]);
  assert.notEqual(paidStyle, includedStyle, "a paid extra must be visually distinct from an included option");

  // --- the price the application computes is what the UI shows -------------
  await page.locator('.modifier-option[data-option-name="Fleisch"] input').check();
  await page.waitForFunction(() => document.querySelector("#addToCart")?.disabled === false);
  assert.match((await addButton.textContent()) ?? "", /8,00/, "base configuration price");

  await page.locator('.modifier-option[data-option-name="Extra Fleisch"] input').check();
  await page.waitForFunction(() => /10,50/.test(document.querySelector("#addToCart")?.textContent || ""));
  assert.match((await addButton.textContent()) ?? "", /10,50/, "the surcharge must reach the configured total");

  // --- the removed-default state ------------------------------------------
  await page.locator('.modifier-option[data-option-name="Salat"] input').uncheck();
  await page.waitForTimeout(250);
  const removedNote = await included.evaluate((node) => getComputedStyle(node, "::after").content);
  assert.match(removedNote, /Ohne/, "a removed standard ingredient must say so");
  assert.match(await page.locator("[data-builder-summary]").innerText(), /OHNE[\s\S]*Salat/i);

  // --- the cart carries all of it -----------------------------------------
  await addButton.click();
  await page.waitForTimeout(400);
  const cart = await page.locator("#cartItems").innerText();
  assert.match(cart, /Extras: Extra Fleisch/, "the cart must name the paid extra");
  assert.match(cart, /Ohne: Salat/, "the cart must name what was removed");
  assert.match(cart, /10,50/, "the cart must carry the configured total");
  assert.doesNotMatch(cart, /Avocado/, "an unavailable option must never reach the cart");

  assert.deepEqual(errors, [], errors.join("\n"));
  console.log("Mcello configurator option states verified: required, sold-out, paid extra, removed default, cart summary.");
} finally {
  await browser.close();
}
