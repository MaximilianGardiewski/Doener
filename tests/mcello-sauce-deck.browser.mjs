import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright";

const jsPath = resolve("apps/mcello/public/doner-yufka-builder-v2.js");
const cssPath = resolve("apps/mcello/public/doner-yufka-builder-v2.css");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 960, height: 720 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

const option = (group, name, type = "checkbox", checked = false) => `
  <label class="modifier-option" data-option-name="${name}">
    <input type="${type}" name="${group}" ${checked ? "checked" : ""}>
    <span>${name}</span>
  </label>`;

try {
  await page.setContent(`<!doctype html>
    <html lang="de">
      <head><meta charset="utf-8"></head>
      <body>
        <button id="openProduct" data-product="fixture">Öffnen</button>
        <section id="productModal" data-category-slug="drehspiess">
          <div class="modal">
            <div class="visual"><img id="modalImage" alt="Fixture"></div>
            <div id="modifierGroups">
              <section class="modifier-group" data-group-name="Basis">
                <div class="modifier-head"><strong>Basis</strong></div>
                ${option("basis", "Fleisch", "radio", true)}
                ${option("basis", "Falafel", "radio")}
              </section>
              <section class="modifier-group" data-group-name="Gemüse">
                <div class="modifier-head"><strong>Gemüse</strong></div>
                ${option("fresh", "Salat", "checkbox", true)}
                ${option("fresh", "Tomate", "checkbox", true)}
                ${option("fresh", "Gurke", "checkbox", true)}
                ${option("fresh", "Zwiebel", "checkbox", true)}
              </section>
              <section class="modifier-group" data-group-name="Soße">
                <div class="modifier-head"><strong>Soße</strong></div>
                ${option("sauce", "Curry")}
                ${option("sauce", "Knoblauch")}
                ${option("sauce", "Scharf")}
              </section>
            </div>
          </div>
        </section>
      </body>
    </html>`);

  await page.addStyleTag({ path: cssPath });
  await page.addScriptTag({ path: jsPath });

  await page.evaluate(() => document.querySelector("#productModal")?.classList.add("open"));
  await page.waitForFunction(() => document.querySelector("#productModal")?.dataset.productBuilder === "doner-yufka");

  const stage = page.locator('[data-food-stage-v4="true"]');
  await stage.waitFor({ state: "visible" });
  assert.equal(await page.locator("#modalImage").isHidden(), true, "FoodStage must replace the legacy product image while active");
  assert.equal(await page.locator("#productModal").getAttribute("data-assembly-sauce-count"), "0");
  assert.equal(await page.locator("[data-sauce-deck]").getAttribute("data-sauce-count"), "0");
  assert.deepEqual(await page.locator("[data-sauce-deck] image.mc-sauce-raster").evaluateAll((images) => images.map((image) => image.getAttribute("href"))), [
    "/assets/ingredients/sauces/sauce-curry-master.png",
    "/assets/ingredients/sauces/sauce-garlic-master.png",
    "/assets/ingredients/sauces/sauce-spicy-master.png",
  ]);

  async function setSauce(name, checked) {
    await page.locator(`[data-group-name="Soße"] [data-option-name="${name}"] input`).setChecked(checked);
  }

  async function waitSauceCount(count) {
    await page.waitForFunction((expected) => {
      const modal = document.querySelector("#productModal");
      const deck = document.querySelector("[data-sauce-deck]");
      return modal?.dataset.assemblySauceCount === String(expected)
        && deck?.dataset.sauceCount === String(expected);
    }, count);
  }

  async function deckState() {
    return page.locator("[data-sauce-deck]").evaluate((deck) => ({
      count: deck.getAttribute("data-sauce-count"),
      active: [...deck.querySelectorAll('.mc-food-layer--sauce[data-active="true"]')].map((layer) => ({
        name: layer.getAttribute("data-food-layer"),
        slot: layer.getAttribute("data-sauce-slot"),
        transform: layer.style.transform,
        transitionDuration: getComputedStyle(layer).transitionDuration,
      })),
    }));
  }

  let threeSauceState;
  for (const [index, name] of ["Curry", "Knoblauch", "Scharf"].entries()) {
    await setSauce(name, true);
    const count = index + 1;
    await waitSauceCount(count);

    const state = await deckState();
    assert.equal(state.count, String(count));
    assert.deepEqual(state.active.map(({ slot }) => slot), Array.from({ length: count }, (_, slot) => String(slot)));
    assert.equal(new Set(state.active.map(({ transform }) => transform)).size, count, "active sauces must occupy distinct deck geometry");
    assert.ok(state.active.every(({ transform }) => transform.includes("translate3d(") && transform.includes("scale(")), "every active sauce needs explicit deck geometry");
    assert.ok(state.active.every(({ transitionDuration }) => transitionDuration === "0s"), "reduced-motion mode must disable sauce transitions");
    if (count === 3) threeSauceState = state;
  }

  assert.deepEqual(threeSauceState.active.map(({ name, slot }) => [name, slot]), [
    ["Curry", "0"],
    ["Knoblauch", "1"],
    ["Scharf", "2"],
  ]);
  const threeTransforms = new Map(threeSauceState.active.map(({ name, transform }) => [name, transform]));

  await setSauce("Knoblauch", false);
  await waitSauceCount(2);
  const redistributed = await deckState();
  assert.deepEqual(redistributed.active.map(({ name, slot }) => [name, slot]), [
    ["Curry", "0"],
    ["Scharf", "1"],
  ]);
  assert.ok(redistributed.active.every(({ name, transform }) => transform !== threeTransforms.get(name)), "remaining sauces must redistribute after one sauce is removed");

  await setSauce("Knoblauch", true);
  await waitSauceCount(3);
  assert.deepEqual((await deckState()).active.map(({ name, slot }) => [name, slot]), [
    ["Curry", "0"],
    ["Knoblauch", "1"],
    ["Scharf", "2"],
  ]);

  const checkedSauces = await page.locator('[data-group-name="Soße"] input:checked').evaluateAll((inputs) => inputs.map((input) => input.closest(".modifier-option")?.dataset.optionName));
  assert.deepEqual(checkedSauces, ["Curry", "Knoblauch", "Scharf"], "the presentation adapter must mirror, never rewrite, modifier state");
  assert.match(await stage.getAttribute("aria-label"), /Curry · Knoblauch · Scharf/);
  assert.deepEqual(pageErrors, [], pageErrors.join("\n"));

  console.log("Mcello SauceDeck browser harness passed: deterministic 0→1→2→3 composition, 3→2 redistribution, reduced motion and state mirroring.");
} finally {
  await context.close();
  await browser.close();
}
