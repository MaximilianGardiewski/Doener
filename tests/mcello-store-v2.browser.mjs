import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  await desktop.waitForFunction(() => document.querySelectorAll("#featuredGrid .food-card").length > 0);
  await desktop.waitForFunction(() => document.querySelector(".store-stage")?.dataset.storeVersion === "v2");

  const roles = await desktop.locator("#featuredGrid .food-card").evaluateAll((cards) => cards.map((card) => ({
    role: card.dataset.productRole,
    signature: card.classList.contains("signature-product"),
    support: card.classList.contains("support-product"),
    foodObject: card.querySelector("img")?.dataset.foodObject || null,
  })));
  assert.equal(roles[0]?.role, "signature", "first deterministic category highlight should receive the visual signature slot");
  assert.equal(roles[0]?.signature, true, "signature slot should have its dedicated Store V2 class");
  assert.equal(roles[0]?.foodObject, "signature", "signature media should use the food-object stage role");
  for (const role of roles.slice(1)) {
    assert.equal(role.role, "support", "remaining featured cards should stay compact support products");
    assert.equal(role.support, true);
  }

  const signature = desktop.locator("#featuredGrid .signature-product");
  const signatureStyle = await signature.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      display: style.display,
      minHeight: style.minHeight,
      background: style.backgroundImage,
    };
  });
  assert.equal(signatureStyle.display, "grid");
  assert.notEqual(signatureStyle.minHeight, "0px", "desktop signature product should keep a deliberately larger stage");
  assert.match(signatureStyle.background, /linear-gradient/i, "signature stage should carry the warm editorial material cue");

  const rail = desktop.locator("#categoryRail");
  assert.equal(await rail.getAttribute("data-store-navigation"), "categories");
  const categoryButtons = rail.locator("[data-category]");
  if (await categoryButtons.count() > 1) {
    const second = categoryButtons.nth(1);
    const nextCategory = await second.getAttribute("data-category");
    await second.click();
    await desktop.waitForFunction(
      (id) => document.querySelector("#categoryRail .active")?.dataset.category === id,
      nextCategory,
    );
    await desktop.waitForFunction(() => document.querySelector("#featuredGrid .food-card")?.dataset.productRole === "signature");
  }

  const listRows = desktop.locator("#menuList .list-row");
  if (await listRows.count()) {
    const rowRoles = await listRows.evaluateAll((rows) => rows.map((row) => ({
      role: row.dataset.productRole,
      compact: row.classList.contains("compact-product"),
    })));
    for (const row of rowRoles) {
      assert.equal(row.role, "compact");
      assert.equal(row.compact, true);
    }
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: "reduce" });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await mobile.waitForFunction(() => document.querySelectorAll("#featuredGrid .food-card").length > 0);
  await mobile.waitForFunction(() => document.querySelector(".store-stage")?.dataset.storeVersion === "v2");

  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    "Store V2 must not introduce mobile horizontal overflow",
  );

  const activeCategoryHeight = await mobile.locator("#categoryRail [data-category]").first().evaluate((node) => node.getBoundingClientRect().height);
  assert.ok(activeCategoryHeight >= 44, "category controls must remain touch-safe");

  const cart = mobile.locator(".sticky-order");
  assert.equal(await cart.getAttribute("data-store-cart"), "sticky");
  assert.equal(await cart.isVisible(), true, "sticky cart must remain visible in Store V2");
  assert.ok(await cart.evaluate((node) => node.getBoundingClientRect().height) >= 58, "sticky cart must keep the stronger Store V2 touch hierarchy");

  const productAction = mobile.locator('#featuredGrid [data-product]:not([disabled])').first();
  if (await productAction.count()) {
    assert.ok(await productAction.evaluate((node) => node.getBoundingClientRect().height) >= 44, "product action must remain touch-safe");
  }

  console.log("Store V2 Chromium smoke passed for presentation roles, rerendering, cart clarity, and mobile touch safety.");
} finally {
  await browser.close();
}
