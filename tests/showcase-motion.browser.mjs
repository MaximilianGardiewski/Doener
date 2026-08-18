import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

async function computed(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const style = getComputedStyle(node);
    const transform = style.transform;
    const matrix = transform === "none" ? new DOMMatrix() : new DOMMatrix(transform);
    const identityTransform =
      matrix.is2D &&
      matrix.a === 1 &&
      matrix.b === 0 &&
      matrix.c === 0 &&
      matrix.d === 1 &&
      matrix.e === 0 &&
      matrix.f === 0;

    return {
      opacity: style.opacity,
      transform,
      identityTransform,
      transitionDuration: style.transitionDuration,
    };
  });
}

async function waitForAnimations(page, selector) {
  await page.locator(selector).evaluate(async (node) => {
    const animations = node.getAnimations();
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
}

try {
  const normal = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "no-preference" });
  await normal.goto(baseUrl, { waitUntil: "networkidle" });
  await normal.waitForFunction(() => document.querySelector('[data-reveal="hero-media"]'));
  assert.equal(
    await normal.evaluate(() => document.documentElement.classList.contains("motion-ready")),
    true,
    "normal-motion browser should enable progressive reveal",
  );
  await normal.waitForFunction(() => document.querySelector(".hero-copy")?.classList.contains("is-revealed"));
  await waitForAnimations(normal, ".hero-copy");
  const revealed = await computed(normal, ".hero-copy");
  assert.equal(revealed.opacity, "1", "visible hero must finish fully opaque");
  assert.equal(revealed.identityTransform, true, "visible hero must finish without transform offset");

  await normal.waitForFunction(() => Boolean(document.documentElement.dataset.mcelloHeroEngine));
  const heroMotion = await normal.evaluate(() => ({
    engine: document.documentElement.dataset.mcelloHeroEngine,
    legacyDepth: document.querySelector(".hero-photo")?.style.getPropertyValue("--motion-hero-depth-y") || "",
    transitionDuration: getComputedStyle(document.querySelector(".hero-photo")).transitionDuration,
    transform: getComputedStyle(document.querySelector(".hero-photo")).transform,
  }));
  assert.ok(["v2", "gsap"].includes(heroMotion.engine), `unexpected hero engine ${heroMotion.engine}`);
  if (heroMotion.engine === "v2") {
    assert.notEqual(heroMotion.legacyDepth, "", "V2 hero motion should provide its bounded depth variable");
  } else {
    assert.equal(heroMotion.legacyDepth, "", "GSAP hero ownership should remove the legacy depth variable");
    assert.match(heroMotion.transitionDuration, /(^|, )0s(,|$)/, "GSAP hero frames must not contend with CSS transitions");
    assert.notEqual(heroMotion.transform, "none", "GSAP hero ownership should provide a compositor transform");
  }

  await normal.locator("#aktuelles").scrollIntoViewIfNeeded();
  await normal.waitForFunction(() => document.querySelector("#aktuelles .section-head")?.classList.contains("is-revealed"));
  assert.equal(
    await normal.locator("#aktuelles .section-head").getAttribute("data-reveal"),
    "section",
    "below-fold content should participate in reveal motion",
  );

  await normal.locator("#bestellen").scrollIntoViewIfNeeded();
  await normal.waitForFunction(() => document.querySelectorAll("#categoryRail [data-category]").length > 0);
  const category = normal.locator("#categoryRail [data-category]").first();
  const categoryId = await category.getAttribute("data-category");
  await category.click();
  await normal.waitForFunction(
    (id) => document.querySelector(".store-stage")?.dataset.motionCategory === id,
    categoryId,
  );
  await normal.waitForFunction(() => document.querySelector("#featuredGrid")?.classList.contains("motion-category-switch"));

  const productButton = normal.locator('[data-product]:not([disabled])').first();
  await productButton.click();
  await normal.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
  await normal.waitForFunction(() => document.querySelector("#productModal .modal")?.classList.contains("motion-product-open"));

  const modifierInput = normal.locator("#modifierGroups input:not(:disabled)").first();
  if (await modifierInput.count()) {
    const type = await modifierInput.getAttribute("type");
    const wasChecked = await modifierInput.isChecked();
    if (type === "checkbox" && wasChecked) await modifierInput.uncheck();
    else if (!wasChecked) await modifierInput.check();
    else await modifierInput.dispatchEvent("change");
    await normal.waitForFunction(() => document.querySelector("#productModal .modal-hero")?.hasAttribute("data-motion-ingredient"));
  }

  const addToCart = normal.locator("#addToCart");
  if (await addToCart.isEnabled()) {
    await addToCart.click();
    await normal.waitForFunction(() => document.querySelector(".sticky-order")?.dataset.motionCart === "added");
  }

  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: "reduce" });
  await reduced.goto(baseUrl, { waitUntil: "networkidle" });
  await reduced.waitForFunction(() => document.querySelector(".hero-copy")?.hasAttribute("data-reveal"));
  assert.equal(
    await reduced.evaluate(() => document.documentElement.classList.contains("motion-ready")),
    false,
    "reduced-motion browser must not activate reveal-hidden state",
  );
  const reducedHero = await computed(reduced, ".hero-copy");
  assert.equal(reducedHero.opacity, "1", "reduced motion must keep content visible");
  assert.equal(reducedHero.identityTransform, true, "reduced motion must remove motion transforms");
  assert.match(reducedHero.transitionDuration, /(^|, )0s(,|$)/, "reduced motion must disable transitions");
  assert.equal(
    await reduced.locator(".hero-photo").evaluate((node) => node.style.getPropertyValue("--motion-hero-depth-y")),
    "",
    "reduced motion must not inject scroll-depth offsets",
  );

  console.log("D058/V3-compatible Chromium motion smoke passed for reveal, hero depth, commerce feedback, and reduced-motion preferences.");
} finally {
  await browser.close();
}
