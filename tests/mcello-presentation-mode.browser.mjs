import assert from "node:assert/strict";
import { chromium } from "playwright";

const APP_URL = process.env.MCELLO_DEMO_URL || "http://127.0.0.1:4173";
const CART_KEY = "mcello-preview-cart-v2";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(`${APP_URL}/?presentation=mcello`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body?.dataset.presentationMode === "mcello");
  const bannerText = await page.locator("#prototypeBanner").innerText();
  assert.match(bannerText, /MCELLO PRESENTATION/i);
  assert.match(bannerText, /Produktdaten teilweise vorläufig/i);
  assert.equal(await page.locator("[data-presentation-reset]").isVisible(), true);

  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify([{ productId: "stale-demo-item", quantity: 9 }])), CART_KEY);
  assert.ok(await page.evaluate((key) => localStorage.getItem(key), CART_KEY));

  await page.goto(`${APP_URL}/?presentation=mcello&reset=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body?.dataset.presentationMode === "mcello" && !location.search.includes("reset=1"));
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), CART_KEY), null, "presentation reset must clear stale browser cart state");
  assert.equal((await page.locator("#cartCount").textContent())?.trim(), "0 Artikel");
  assert.match(page.url(), /presentation=mcello/);
  assert.doesNotMatch(page.url(), /reset=1/);

  console.log("Mcello local presentation mode passed: visible demo label and clean browser-cart reset.");
} finally {
  await browser.close();
}
