import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

async function hasHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await desktop.goto(baseUrl, { waitUntil: "networkidle" });
  await desktop.waitForFunction(() => document.querySelectorAll("#categoryRail [data-category]").length > 0);
  await desktop.waitForFunction(() => document.querySelectorAll("#homepageQuickOrderGrid [data-home-quick-product]").length > 0);

  assert.equal(await desktop.locator("#start").isVisible(), true, "hero must be visible");
  assert.equal(await desktop.locator("#homepageQuickOrder").isVisible(), true, "quick-order panel must be visible");
  assert.equal(await desktop.locator(".sticky-order").isVisible(), true, "sticky order CTA/cart must stay visible");

  const quickCards = desktop.locator("#homepageQuickOrderGrid [data-home-quick-product]");
  const quickCount = await quickCards.count();
  assert.ok(quickCount >= 1 && quickCount <= 4, `expected 1-4 category highlights, got ${quickCount}`);

  const firstAction = desktop.locator("#homepageQuickOrderGrid [data-home-quick-action]").first();
  const actionText = (await firstAction.textContent())?.trim();
  assert.ok(["Direkt hinzufügen", "Schnell konfigurieren"].includes(actionText), `unexpected quick action: ${actionText}`);
  await firstAction.click();

  if (actionText === "Direkt hinzufügen") {
    await desktop.waitForFunction(() => !document.querySelector("#cartCount")?.textContent?.startsWith("0 "));
    assert.notEqual((await desktop.locator("#cartCount").textContent())?.trim(), "0 Artikel", "direct quick action must use existing cart flow");
  } else {
    await desktop.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
    assert.equal(await desktop.locator("#productModal").isVisible(), true, "configurable highlight must open existing configurator");
    await desktop.locator("[data-close-modal]").click();
  }

  await desktop.locator("#ueber").scrollIntoViewIfNeeded();
  assert.equal(await desktop.locator("#homepageTeamStory").isVisible(), true, "story/team slot must be present");
  assert.match(
    (await desktop.locator("#homepageTeamStory").textContent()) || "",
    /ohne erfundene Namen oder Biografie/,
    "story/team placeholder must remain first-party safe",
  );

  await desktop.locator("#aktuelles").scrollIntoViewIfNeeded();
  assert.equal(await desktop.locator("#aktuelles").isVisible(), true, "community/news/events section must be reachable");
  assert.equal(await hasHorizontalOverflow(desktop), false, "homepage composition must not overflow desktop viewport");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await mobile.waitForFunction(() => document.querySelectorAll("#homepageQuickOrderGrid [data-home-quick-product]").length > 0);
  assert.equal(await mobile.locator("#homepageQuickOrder").isVisible(), true, "quick-order panel must remain visible on mobile");
  assert.equal(await mobile.locator(".header-order-cta").isVisible(), true, "mobile order CTA must remain available");
  assert.equal(await hasHorizontalOverflow(mobile), false, "homepage composition must not overflow mobile viewport");

  console.log("D024 Chromium homepage composition smoke passed on desktop and mobile.");
} finally {
  await browser.close();
}
