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

  const desktopNav = desktop.locator('nav[aria-label="Hauptnavigation"]');
  assert.equal(await desktopNav.isVisible(), true, "desktop navigation must be visible");
  assert.equal(await desktopNav.locator("a").count(), 6, "desktop navigation must expose six public targets");
  assert.equal(await desktop.locator("#mobileNav").isVisible(), false, "mobile menu must stay hidden on desktop");
  assert.equal(await desktop.locator(".header-order-cta").isVisible(), true, "desktop order CTA must stay visible");
  assert.equal(await hasHorizontalOverflow(desktop), false, "desktop viewport must not overflow horizontally");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });

  assert.equal(await mobile.locator('nav[aria-label="Hauptnavigation"]').isVisible(), false, "desktop nav must collapse on mobile");
  assert.equal(await mobile.locator("#mobileNav").isVisible(), true, "mobile menu control must be visible");
  assert.equal(await mobile.locator(".header-order-cta").isVisible(), true, "mobile header order CTA must remain visible");
  assert.equal(await hasHorizontalOverflow(mobile), false, "mobile viewport must not overflow horizontally");

  await mobile.locator("#mobileNav > summary").click();
  const mobilePanel = mobile.locator('nav[aria-label="Mobile Hauptnavigation"]');
  assert.equal(await mobilePanel.isVisible(), true, "mobile navigation panel must open");
  assert.equal(await mobilePanel.locator("a").count(), 7, "mobile panel must contain six destinations plus order CTA");

  await mobilePanel.getByRole("link", { name: "Kontakt & Anfahrt" }).click();
  await mobile.waitForURL(/#kontakt$/);
  assert.equal(await mobile.locator("#mobileNav").getAttribute("open"), null, "mobile menu must close after navigation");
  assert.equal(await mobile.locator("#kontakt").isVisible(), true, "contact section must be reachable from mobile navigation");

  await mobile.locator("#mobileNav > summary").click();
  assert.notEqual(await mobile.locator("#mobileNav").getAttribute("open"), null, "mobile menu must reopen");
  await mobile.keyboard.press("Escape");
  assert.equal(await mobile.locator("#mobileNav").getAttribute("open"), null, "Escape must close mobile navigation");
  assert.equal(
    await mobile.evaluate(() => document.activeElement === document.querySelector("#mobileNav > summary")),
    true,
    "Escape must return focus to the menu summary",
  );

  await mobile.locator(".header-order-cta").click();
  await mobile.waitForURL(/#bestellen$/);
  assert.equal(await mobile.locator("#bestellen").isVisible(), true, "order CTA must reach the menu/order section");

  console.log("D030 Chromium public navigation smoke passed for desktop and mobile viewports.");
} finally {
  await browser.close();
}
