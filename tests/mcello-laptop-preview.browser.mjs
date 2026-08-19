import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173/?presentation=mcello#bestellen";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "no-preference",
  serviceWorkers: "block",
});

try {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "ready");
  await page.waitForFunction(() => document.documentElement.dataset.mcelloProductEngine === "gsap");
  await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "gsap");
  await page.waitForFunction(() => document.querySelector('[data-product="warm-013"]:not([disabled])'));

  await page.locator('[data-product="warm-013"]:not([disabled])').first().click();
  await page.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
  await page.waitForFunction(() => document.querySelector("#productModal .modal")?.dataset.motionProductEngine === "gsap");

  const title = (await page.locator("#modalTitle").textContent())?.trim();
  assert.match(title || "", /Drehspieß im Fladenbrot/i);

  const groupNames = await page.locator("#modifierGroups .modifier-head strong").allTextContents();
  assert.ok(groupNames.includes("Basis"), `Basis modifier missing: ${JSON.stringify(groupNames)}`);
  assert.ok(groupNames.includes("Gemüse"), `Gemüse modifier missing: ${JSON.stringify(groupNames)}`);
  assert.ok(groupNames.includes("Soße"), `Soße modifier missing: ${JSON.stringify(groupNames)}`);

  await page.waitForFunction(() => document.querySelector('#productModal.open [data-food-stage-v4="true"]'));
  assert.equal(await page.locator('[data-food-stage-v4="true"]').count(), 1);

  await page.waitForFunction(() => !document.querySelector("#productModal .modal")?.hasAttribute("data-motion-product-engine"));

  const candidate = page.locator('#modifierGroups input:not(:disabled):not(:checked)').first();
  const identity = await candidate.evaluate((node) => ({
    groupId: node.dataset.groupId,
    value: node.value,
  }));
  assert.ok(identity.groupId && identity.value, `modifier identity missing: ${JSON.stringify(identity)}`);

  await page.evaluate(() => {
    window.__mcelloLaptopIngredientSeen = false;
    const root = document.querySelector("#productModal.open");
    const observer = new MutationObserver(() => {
      if (root?.querySelector(".modifier-option[data-motion-ingredient-engine='gsap']")) {
        window.__mcelloLaptopIngredientSeen = true;
      }
    });
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["data-motion-ingredient-engine"] });
    window.__mcelloLaptopIngredientObserver = observer;
  });

  await candidate.click();
  await page.waitForFunction(() => window.__mcelloLaptopIngredientSeen === true);
  await page.waitForFunction(() => document.querySelector('[data-food-stage-v4="true"]')?.dataset.motionIngredientEngine === "gsap");

  const stageSnapshot = await page.locator('[data-food-stage-v4="true"]').evaluate((node) => ({
    owner: node.dataset.motionIngredientEngine,
    selection: node.dataset.motionIngredient,
    transform: node.style.transform,
    opacity: node.style.opacity,
  }));
  assert.equal(stageSnapshot.owner, "gsap");
  assert.ok(stageSnapshot.selection === "added" || stageSnapshot.selection === "removed");
  assert.ok(stageSnapshot.transform || stageSnapshot.opacity, `FoodStage must show a GSAP presentation frame: ${JSON.stringify(stageSnapshot)}`);

  assert.deepEqual(errors, []);
  console.log("Mcello laptop preview passed: real configurator, Döner/Yufka modifiers, FoodStage and GSAP takeovers are visible.");
} finally {
  await context.close();
  await browser.close();
}
