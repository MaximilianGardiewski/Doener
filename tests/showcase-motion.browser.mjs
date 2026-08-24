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

async function scrollIngredientStoryToEnd(page) {
  await page.evaluate(() => {
    const story = document.querySelector("[data-mcello-ingredient-story]");
    const top = story.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + story.offsetHeight - window.innerHeight + 8);
  });
  await page.waitForFunction(() => Number(document.querySelector("[data-mcello-ingredient-story]")?.dataset.storyFrame || 0) === 144);
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

  await normal.waitForFunction(() => ["gsap", "fallback"].includes(document.querySelector("[data-mcello-ingredient-story]")?.dataset.storyEngine));
  const storyContract = await normal.locator("[data-mcello-ingredient-story]").evaluate((story) => ({
    engine: story.dataset.storyEngine,
    initialFrame: Number(story.dataset.storyFrame || 0),
    imageCount: story.querySelectorAll("img").length,
    layerCount: story.querySelectorAll("[data-story-layer]").length,
    conceptLabel: story.querySelector(".mc-ingredient-story__concept-label")?.textContent.trim() || "",
    truthLabel: story.querySelector(".mc-ingredient-story__truth strong")?.textContent.trim() || "",
    storeIsNext: story.nextElementSibling?.id === "bestellen",
  }));
  assert.ok(["gsap", "fallback"].includes(storyContract.engine), `unexpected ingredient story engine ${storyContract.engine}`);
  const { engine: storyEngine, ...storyShape } = storyContract;
  assert.deepEqual(storyShape, {
    initialFrame: 1,
    imageCount: 0,
    layerCount: 8,
    conceptLabel: "Concept Art · lokal gerendert",
    truthLabel: "Illustration · keine Produktfotografie",
    storeIsNext: true,
  }, "ingredient story must be local, illustrative, layered and placed directly before commerce");
  console.log(`Ingredient story normal-motion engine: ${storyEngine}`);
  await scrollIngredientStoryToEnd(normal);
  assert.equal(await normal.locator("[data-story-phase]").textContent(), "Fertig");
  assert.equal(await normal.locator("[data-story-progress]").getAttribute("aria-valuenow"), "144");
  assert.equal(await normal.locator('[data-story-layer="top"]').evaluate((node) => Number(getComputedStyle(node).opacity) > .99), true);

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
  const categoryEngine = await normal.evaluate(() => document.documentElement.dataset.mcelloCategoryEngine);
  assert.ok(["v2", "gsap"].includes(categoryEngine), `unexpected category engine ${categoryEngine}`);
  if (categoryEngine === "v2") {
    await normal.waitForFunction(() => document.querySelector("#featuredGrid")?.classList.contains("motion-category-switch"));
  } else {
    await normal.waitForFunction(() => document.querySelector(".store-stage")?.dataset.motionCategoryEngine === "gsap");
  }

  const productButton = normal.locator('[data-product]:not([disabled])').first();
  const productEngine = await normal.evaluate(() => document.documentElement.dataset.mcelloProductEngine);
  assert.ok(["v2", "gsap"].includes(productEngine), `unexpected product engine ${productEngine}`);
  await productButton.click();
  await normal.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
  if (productEngine === "v2") {
    await normal.waitForFunction(() => document.querySelector("#productModal .modal")?.classList.contains("motion-product-open"));
  } else {
    await normal.waitForTimeout(20);
    assert.equal(
      await normal.locator("#productModal .modal").evaluate((node) => node.classList.contains("motion-product-open")),
      false,
      "GSAP product-open path must not start the legacy modal keyframe",
    );
  }

  const modifierInput = normal.locator("#modifierGroups input:not(:disabled)").first();
  if (await modifierInput.count()) {
    const ingredientEngine = await normal.evaluate(() => document.documentElement.dataset.mcelloIngredientEngine);
    assert.ok(["v2", "gsap"].includes(ingredientEngine), `unexpected ingredient engine ${ingredientEngine}`);
    const modifierOption = modifierInput.locator("xpath=ancestor::*[contains(@class,'modifier-option')][1]");
    const type = await modifierInput.getAttribute("type");
    const wasChecked = await modifierInput.isChecked();
    if (type === "checkbox" && wasChecked) await modifierInput.uncheck();
    else if (!wasChecked) await modifierInput.check();
    else await modifierInput.dispatchEvent("change");
    if (ingredientEngine === "v2") {
      await normal.waitForFunction(() => document.querySelector(".modifier-option.motion-ingredient-change"));
    } else {
      await normal.waitForFunction(() => document.querySelector(".modifier-option[data-motion-ingredient-engine='gsap']"));
      assert.equal(await modifierOption.evaluate((node) => node.classList.contains("motion-ingredient-change")), false);
    }
  }

  const addToCart = normal.locator("#addToCart");
  if (await addToCart.isEnabled()) {
    await addToCart.click();
    await normal.waitForFunction(() => document.querySelector(".sticky-order")?.dataset.motionCart === "added");
  }

  const fallback = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "no-preference" });
  await fallback.route("**/vendor/gsap/**", (route) => route.abort("failed"));
  await fallback.goto(baseUrl, { waitUntil: "networkidle" });
  await fallback.waitForFunction(() => document.querySelector("[data-mcello-ingredient-story]")?.dataset.storyEngine === "fallback");
  await scrollIngredientStoryToEnd(fallback);
  assert.equal(await fallback.locator("[data-mcello-ingredient-story]").getAttribute("data-story-frame"), "144");
  assert.equal(await fallback.locator('[data-story-layer="top"]').evaluate((node) => Number(getComputedStyle(node).opacity) > .99), true);

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
  await reduced.waitForFunction(() => document.querySelector("[data-mcello-ingredient-story]")?.dataset.storyEngine === "reduced");
  const reducedStory = await reduced.locator("[data-mcello-ingredient-story]").evaluate((story) => ({
    frame: story.dataset.storyFrame,
    phase: story.querySelector("[data-story-phase]")?.textContent,
    topOpacity: getComputedStyle(story.querySelector('[data-story-layer="top"]')).opacity,
    topTransform: getComputedStyle(story.querySelector('[data-story-layer="top"]')).transform,
    stickyPosition: getComputedStyle(story.querySelector(".mc-ingredient-story__sticky")).position,
  }));
  assert.deepEqual(reducedStory, {
    frame: "144",
    phase: "Fertig",
    topOpacity: "1",
    topTransform: "none",
    stickyPosition: "relative",
  }, "reduced motion must render the complete story without scrub-dependent content");

  console.log("D058/V3-compatible Chromium motion smoke passed for reveal, hero depth, 144-step ingredient story (normal/fallback/reduced), category, product-open, ingredient feedback, cart feedback, and reduced-motion preferences.");
} finally {
  await browser.close();
}
