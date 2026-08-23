import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const scenario = process.argv[2] || "all";
const allowedScenarios = new Set(["all", "normal", "fallback", "reduced"]);
assert.ok(allowedScenarios.has(scenario), `unknown cart scenario: ${scenario}`);

const browser = await chromium.launch({ headless: true });

async function closeProduct(page) {
  if (!await page.locator("#productModal").evaluate((node) => node.classList.contains("open"))) return;
  await page.locator("[data-close-modal]").click();
  await page.waitForFunction(() => !document.querySelector("#productModal")?.classList.contains("open"));
}

async function openCandidateProduct(page, predicate) {
  await page.locator("#bestellen").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll("#categoryRail [data-category]").length > 0);
  const categoryCount = await page.locator("#categoryRail [data-category]").count();

  for (let categoryIndex = 0; categoryIndex < categoryCount; categoryIndex += 1) {
    const categories = page.locator("#categoryRail [data-category]");
    await categories.nth(categoryIndex).click();
    await page.waitForTimeout(35);
    const productCount = await page.locator('[data-product]:not([disabled])').count();
    for (let productIndex = 0; productIndex < productCount; productIndex += 1) {
      const products = page.locator('[data-product]:not([disabled])');
      if (productIndex >= await products.count()) break;
      await products.nth(productIndex).click();
      await page.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
      if (await predicate(page)) return;
      await closeProduct(page);
    }
  }
  assert.fail("expected a matching orderable Mcello product in the preview fixture");
}

async function openAddableProduct(page) {
  await openCandidateProduct(page, async (candidatePage) => candidatePage.locator("#addToCart").isEnabled());
}

async function openRejectableProduct(page) {
  await openCandidateProduct(page, async (candidatePage) => {
    if (!await candidatePage.locator("#modifierGroups input:not(:disabled)").count()) return false;
    await candidatePage.locator("#modifierGroups input:not(:disabled)").evaluateAll((inputs) => {
      for (const input of inputs) {
        if (!(input instanceof HTMLInputElement)) continue;
        input.checked = false;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await candidatePage.waitForTimeout(420);
    return candidatePage.locator("#addToCart").isDisabled();
  });
}

async function armCartTrace(page) {
  await page.evaluate(() => {
    window.__mcelloCartTraceObserver?.disconnect?.();
    window.__mcelloCartTrace = {
      sawGsapOwner: false,
      sawInlineTransform: false,
      sawFallbackClass: false,
      sawAddedMarker: false,
    };
    const sticky = document.querySelector(".sticky-order");
    if (!sticky) return;
    const capture = () => {
      const trace = window.__mcelloCartTrace;
      if (sticky.dataset.motionCartEngine === "gsap") trace.sawGsapOwner = true;
      if (sticky.style.transform) trace.sawInlineTransform = true;
      if (sticky.classList.contains("motion-cart-confirm")) trace.sawFallbackClass = true;
      if (sticky.dataset.motionCart === "added") trace.sawAddedMarker = true;
    };
    const observer = new MutationObserver(capture);
    observer.observe(sticky, { attributes: true, attributeFilter: ["data-motion-cart-engine", "data-motion-cart", "style", "class"] });
    window.__mcelloCartTraceObserver = observer;
    capture();
  });
}

function cartQuantity(text) {
  const match = String(text || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

async function proveRejectedClickHasNoSuccessMotion(page) {
  await openRejectableProduct(page);
  const before = cartQuantity(await page.locator("#cartCount").textContent());
  await armCartTrace(page);
  await page.locator("#addToCart").evaluate((button) => { button.disabled = false; });
  await page.locator("#addToCart").click();
  await page.waitForTimeout(80);

  assert.equal(await page.locator("#productModal").evaluate((node) => node.classList.contains("open")), true, "rejected add must leave product modal open");
  assert.equal(await page.locator("#cartDrawer").evaluate((node) => node.classList.contains("open")), false, "rejected add must not open cart drawer");
  assert.equal(cartQuantity(await page.locator("#cartCount").textContent()), before, "rejected add must not mutate cart quantity");
  const trace = await page.evaluate(() => structuredClone(window.__mcelloCartTrace));
  assert.deepEqual(trace, { sawGsapOwner: false, sawInlineTransform: false, sawFallbackClass: false, sawAddedMarker: false });
  assert.equal(await page.locator(".motion-cart-flight-ghost").count(), 0, "rejected add must not launch the configurator cart-flight ghost");
  await closeProduct(page);
}

async function commitOneProduct(page) {
  await openAddableProduct(page);
  const before = cartQuantity(await page.locator("#cartCount").textContent());
  await armCartTrace(page);
  await page.locator("#addToCart").click();
  await page.waitForFunction(() => document.querySelector("#cartDrawer")?.classList.contains("open"));
  await page.waitForFunction(() => !document.querySelector("#productModal")?.classList.contains("open"));
  await page.waitForFunction((quantity) => {
    const match = document.querySelector("#cartCount")?.textContent?.match(/\d+/);
    return Number(match?.[0] || 0) === quantity + 1;
  }, before);
  return { before, after: cartQuantity(await page.locator("#cartCount").textContent()) };
}

async function normalScenario() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "no-preference", serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "ready");
    await page.waitForFunction(() => document.documentElement.dataset.mcelloCartEngine === "gsap");

    await proveRejectedClickHasNoSuccessMotion(page);
    const committed = await commitOneProduct(page);
    await page.waitForFunction(() => window.__mcelloCartTrace?.sawGsapOwner && window.__mcelloCartTrace?.sawInlineTransform);
    const trace = await page.evaluate(() => structuredClone(window.__mcelloCartTrace));
    assert.equal(committed.after, committed.before + 1);
    assert.equal(trace.sawGsapOwner, true);
    assert.equal(trace.sawInlineTransform, true);
    assert.equal(trace.sawAddedMarker, true);
    assert.equal(trace.sawFallbackClass, false);
    await page.waitForFunction(() => !document.querySelector(".sticky-order")?.hasAttribute("data-motion-cart-engine"));
    assert.equal(await page.locator(".sticky-order").evaluate((node) => node.style.transform), "");
    console.log("Mcello GSAP cart confirmation normal + rejection scenarios passed.");
  } finally {
    await context.close();
  }
}

async function fallbackScenario() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "no-preference", serviceWorkers: "block" });
  try {
    await context.route("**/vendor/gsap/**", (route) => route.abort("failed"));
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "fallback");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloCartEngine), "v2");
    const committed = await commitOneProduct(page);
    await page.waitForFunction(() => window.__mcelloCartTrace?.sawFallbackClass === true);
    const trace = await page.evaluate(() => structuredClone(window.__mcelloCartTrace));
    assert.equal(committed.after, committed.before + 1);
    assert.equal(trace.sawGsapOwner, false);
    assert.equal(trace.sawFallbackClass, true);
    assert.equal(trace.sawAddedMarker, true);
    console.log("Mcello GSAP cart confirmation vendor-fallback scenario passed.");
  } finally {
    await context.close();
  }
}

async function reducedScenario() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce", serviceWorkers: "block" });
  try {
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "reduced");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloCartEngine), "reduced");
    assert.equal(await page.locator('script[data-mcello-gsap-vendor]').count(), 0);
    const committed = await commitOneProduct(page);
    await page.waitForTimeout(50);
    const trace = await page.evaluate(() => structuredClone(window.__mcelloCartTrace));
    assert.equal(committed.after, committed.before + 1);
    assert.deepEqual(trace, { sawGsapOwner: false, sawInlineTransform: false, sawFallbackClass: false, sawAddedMarker: false });
    console.log("Mcello GSAP cart confirmation reduced-motion scenario passed.");
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