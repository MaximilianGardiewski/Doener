import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL;
assert.ok(baseUrl, "MCELLO_PREVIEW_URL is required for the remote Cloudflare gate");

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

  const url = new URL(baseUrl);
  url.searchParams.set("presentation", "mcello");
  url.hash = "bestellen";
  await page.goto(url.toString(), { waitUntil: "networkidle" });

  await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "ready");
  const runtime = await page.evaluate(() => ({
    gsap: globalThis.gsap?.version || null,
    scrollTrigger: Boolean(globalThis.ScrollTrigger),
    flip: Boolean(globalThis.Flip),
    backendText: document.querySelector("#prototypeBanner")?.textContent || "",
  }));
  assert.equal(runtime.gsap, "3.15.0");
  assert.equal(runtime.scrollTrigger, true);
  assert.equal(runtime.flip, true);

  await page.waitForFunction(() => document.querySelector('[data-product="warm-013"]:not([disabled])'));
  await page.evaluate(() => {
    window.__mcelloRemoteTrace = { product: false, ingredient: false, foodStage: false };
    const observer = new MutationObserver(() => {
      const trace = window.__mcelloRemoteTrace;
      if (document.querySelector("#productModal .modal[data-motion-product-engine='gsap']")) trace.product = true;
      if (document.querySelector(".modifier-option[data-motion-ingredient-engine='gsap']")) trace.ingredient = true;
      if (document.querySelector("[data-food-stage-v4='true'][data-motion-ingredient-engine='gsap']")) trace.foodStage = true;
    });
    observer.observe(document.documentElement, { subtree: true, attributes: true });
    window.__mcelloRemoteTraceObserver = observer;
  });

  await page.locator('[data-product="warm-013"]:not([disabled])').first().click();
  await page.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
  await page.waitForFunction(() => document.querySelector('[data-food-stage-v4="true"]'));

  const configurator = await page.evaluate(() => ({
    title: document.querySelector("#modalTitle")?.textContent?.trim() || "",
    groups: [...document.querySelectorAll("#modifierGroups .modifier-group .modifier-head strong")].map((node) => node.textContent?.trim()),
    optionCount: document.querySelectorAll("#modifierGroups input:not(:disabled)").length,
    stage: Boolean(document.querySelector('[data-food-stage-v4="true"]')),
  }));
  assert.match(configurator.title, /Drehspieß/i);
  assert.deepEqual(configurator.groups, ["Basis", "Gemüse", "Soße"]);
  assert.ok(configurator.optionCount >= 9);
  assert.equal(configurator.stage, true);

  await page.waitForFunction(() => window.__mcelloRemoteTrace?.product === true);

  const sauce = page.locator("#modifierGroups .modifier-group").filter({ hasText: "Soße" }).locator("input:not(:disabled):not(:checked)").first();
  assert.equal(await sauce.count(), 1, "Expected an unselected sauce option in the Cloudflare presentation fixture");
  await sauce.click();
  await page.waitForFunction(() => window.__mcelloRemoteTrace?.ingredient === true);
  await page.waitForFunction(() => window.__mcelloRemoteTrace?.foodStage === true);

  const trace = await page.evaluate(() => structuredClone(window.__mcelloRemoteTrace));
  assert.deepEqual(trace, { product: true, ingredient: true, foodStage: true });
  assert.deepEqual(errors, []);
  console.log(`Cloudflare Mcello configurator passed: ${JSON.stringify({ runtime, configurator, trace })}`);
} finally {
  await context.close();
  await browser.close();
}
