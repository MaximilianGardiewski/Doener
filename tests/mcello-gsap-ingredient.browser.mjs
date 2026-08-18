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

async function armIngredientTrace(page, stage) {
  await page.evaluate(({ kind, selector }) => {
    window.__mcelloIngredientTraceObserver?.disconnect?.();
    window.__mcelloIngredientTrace = {
      option: null,
      optionSawInlineTransform: false,
      stage: null,
      stageSawInlineTransform: false,
      pizzaPulseCount: 0,
    };

    const root = document.querySelector("#productModal.open");
    if (!root) return;
    const trace = window.__mcelloIngredientTrace;
    const stageNode = document.querySelector(selector);

    if (kind === "pizza" && stageNode?.animate) {
      const originalAnimate = stageNode.animate.bind(stageNode);
      stageNode.animate = (...args) => {
        trace.pizzaPulseCount += 1;
        return originalAnimate(...args);
      };
    }

    const capture = () => {
      const ownedOption = root.querySelector(".modifier-option[data-motion-ingredient-engine='gsap']");
      if (ownedOption) {
        const input = ownedOption.querySelector("input");
        if (!trace.option) {
          trace.option = {
            groupId: input?.dataset.groupId || null,
            value: input?.value || null,
            checked: Boolean(input?.checked),
            selection: ownedOption.dataset.motionSelection || null,
            owner: ownedOption.dataset.motionIngredientEngine || null,
            fallbackClass: ownedOption.classList.contains("motion-ingredient-change"),
            transitionDuration: getComputedStyle(ownedOption).transitionDuration,
          };
        }
        if (ownedOption.style.transform) trace.optionSawInlineTransform = true;
      }

      if (kind !== "pizza" && stageNode?.dataset.motionIngredientEngine === "gsap") {
        if (!trace.stage) {
          trace.stage = {
            owner: stageNode.dataset.motionIngredientEngine,
            selection: stageNode.dataset.motionIngredient || null,
            fallbackClass: stageNode.classList.contains("motion-food-stage-change"),
            transitionDuration: getComputedStyle(stageNode).transitionDuration,
          };
        }
        if (stageNode.style.transform || stageNode.style.opacity) trace.stageSawInlineTransform = true;
      }
    };

    const observer = new MutationObserver(capture);
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-motion-ingredient-engine", "data-motion-selection", "data-motion-ingredient", "style", "class"],
    });
    window.__mcelloIngredientTraceObserver = observer;
    capture();
  }, stage);
}

function stableInputSelector(identity) {
  return `#modifierGroups input[data-group-id=${JSON.stringify(identity.groupId)}][value=${JSON.stringify(identity.value)}]`;
}

async function triggerModifier(page) {
  const unchecked = page.locator("#modifierGroups input:not(:disabled):not(:checked)").first();
  const checkedCheckbox = page.locator('#modifierGroups input[type="checkbox"]:not(:disabled):checked').first();
  let candidate;
  let action;

  if (await unchecked.count()) {
    candidate = unchecked;
    action = "click";
  } else if (await checkedCheckbox.count()) {
    candidate = checkedCheckbox;
    action = "click";
  } else {
    candidate = page.locator("#modifierGroups input:not(:disabled)").first();
    action = "dispatch";
  }

  const identity = await candidate.evaluate((node) => ({
    groupId: node.dataset.groupId || null,
    value: node.value,
  }));
  const input = page.locator(stableInputSelector(identity));

  if (action === "click") await input.click();
  else await input.dispatchEvent("change");

  const checked = await input.isChecked();
  const option = input.locator("xpath=..");
  return { input, option, checked, identity };
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
    await armIngredientTrace(page, stage);

    const { input, option, checked, identity } = await triggerModifier(page);
    await page.waitForFunction(() => Boolean(window.__mcelloIngredientTrace?.option));
    await page.waitForTimeout(20);
    const trace = await page.evaluate(() => structuredClone(window.__mcelloIngredientTrace));
    console.log(`Ingredient normal trace: ${JSON.stringify({ stage, identity, checked, trace })}`);

    assert.equal(trace.option.groupId, identity.groupId, `GSAP must own the modifier group that actually changed: ${JSON.stringify({ trace, identity })}`);
    assert.equal(trace.option.value, identity.value, `GSAP must own the modifier option that actually changed: ${JSON.stringify({ trace, identity })}`);
    assert.equal(trace.option.owner, "gsap");
    assert.equal(trace.option.selection, checked ? "added" : "removed");
    assert.equal(trace.option.checked, checked, "GSAP ownership snapshot must observe the application-validated checked state");
    assert.equal(trace.option.fallbackClass, false);
    assert.match(trace.option.transitionDuration, /(^|, )0s(,|$)/);
    assert.equal(trace.optionSawInlineTransform, true, `GSAP must render at least one option transform frame: ${JSON.stringify(trace)}`);

    const stageLocator = page.locator(stage.selector).first();
    if (stage.kind === "pizza") {
      assert.equal(trace.stage, null, "Pizza stage must never be marked as GSAP-owned");
      assert.ok(trace.pizzaPulseCount >= 1, `Pizza builder should retain its own stage pulse: ${JSON.stringify(trace)}`);
      assert.equal(await stageLocator.getAttribute("data-motion-ingredient-engine"), null);
      assert.equal(await stageLocator.evaluate((node) => node.classList.contains("motion-food-stage-change")), false);
    } else {
      await page.waitForFunction(() => Boolean(window.__mcelloIngredientTrace?.stage));
      const stageTrace = await page.evaluate(() => structuredClone(window.__mcelloIngredientTrace));
      console.log(`Ingredient normal stage trace: ${JSON.stringify(stageTrace)}`);
      assert.equal(stageTrace.stage.owner, "gsap");
      assert.equal(stageTrace.stage.selection, checked ? "added" : "removed");
      assert.equal(stageTrace.stage.fallbackClass, false);
      assert.match(stageTrace.stage.transitionDuration, /(^|, )0s(,|$)/);
      assert.equal(stageTrace.stageSawInlineTransform, true, `GSAP must render the FoodStage frame: ${JSON.stringify(stageTrace)}`);
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
    await armIngredientTrace(page, stage);
    const { input, option, checked } = await triggerModifier(page);
    await page.waitForFunction(() => document.querySelector(".modifier-option.motion-ingredient-change"));
    assert.equal(await option.getAttribute("data-motion-ingredient-engine"), null);

    const stageLocator = page.locator(stage.selector).first();
    if (stage.kind === "pizza") {
      await page.waitForFunction(() => window.__mcelloIngredientTrace?.pizzaPulseCount >= 1);
      const trace = await page.evaluate(() => structuredClone(window.__mcelloIngredientTrace));
      console.log(`Ingredient fallback trace: ${JSON.stringify({ stage, checked, trace })}`);
      assert.equal(await stageLocator.evaluate((node) => node.classList.contains("motion-food-stage-change")), false);
      assert.ok(trace.pizzaPulseCount >= 1, "Pizza fallback keeps its builder-owned pulse");
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
    await armIngredientTrace(page, stage);
    const { input, option, checked } = await triggerModifier(page);
    await page.waitForTimeout(40);

    const trace = await page.evaluate(() => structuredClone(window.__mcelloIngredientTrace));
    console.log(`Ingredient reduced trace: ${JSON.stringify({ stage, checked, trace })}`);
    assert.equal(trace.option, null);
    assert.equal(trace.stage, null);
    assert.equal(trace.pizzaPulseCount, 0);
    assert.equal(await option.evaluate((node) => node.classList.contains("motion-ingredient-change")), false);
    assert.equal(await option.getAttribute("data-motion-ingredient-engine"), null);
    const stageLocator = page.locator(stage.selector).first();
    assert.equal(await stageLocator.evaluate((node) => node.classList.contains("motion-food-stage-change")), false);
    assert.equal(await stageLocator.getAttribute("data-motion-ingredient-engine"), null);
    assert.equal(await input.isChecked(), checked);
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