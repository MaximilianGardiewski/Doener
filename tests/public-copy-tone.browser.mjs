import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#homepageTeamStory").waitFor({ state: "attached" });

  assert.match(await page.locator(".hero-copy > p").innerText(), /Ankommen, Essen und Zusammensein/);
  assert.equal(await page.locator("#bestellen .section-head h2").innerText(), "App-schnell. Bistro-echt.");
  assert.match(await page.locator("#ueber .story-card:first-child .story-copy p").innerText(), /online genauso unkompliziert/);
  assert.match(await page.locator("#homepageTeamStory .story-copy p").innerText(), /erfinden wir lieber nichts dazu/);
  assert.match(await page.locator("#aktuelles .section-head > p").innerText(), /vorbeizuschauen/);
  assert.equal(await page.locator("#galerie .section-head h2").innerText(), "Momente aus Mcello.");
  assert.equal(await page.locator("#kontakt .section-head h2").innerText(), "Komm vorbei.");
  assert.equal(await page.locator(".footer .brand span").innerText(), "Bad Krozingen");

  const marketingText = await page.evaluate(() => [
    document.querySelector("#start")?.innerText,
    document.querySelector("#ueber")?.innerText,
    document.querySelector("#aktuelles")?.innerText,
    document.querySelector("#galerie")?.innerText,
    document.querySelector("#kontakt")?.innerText,
    document.querySelector("#homepageQuickOrder")?.innerText,
  ].filter(Boolean).join("\n"));

  for (const forbidden of ["Showcase", "Media Layer", "CMS/Storage", "First-Party-Inhalten", "technisch stark"]) {
    assert.equal(marketingText.includes(forbidden), false, `customer-facing marketing copy leaked internal term: ${forbidden}`);
  }

  const prototypeText = await page.locator("#prototypeBanner").innerText();
  assert.match(prototypeText, /Entwicklungsprototyp|Entwicklungs-Preview|Entwicklungs/);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  assert.match(await mobile.locator(".hero-copy > p").innerText(), /Ankommen, Essen und Zusammensein/);
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    "D059 copy must not introduce mobile horizontal overflow",
  );

  console.log("D059 Chromium public-copy tone smoke passed.");
} finally {
  await browser.close();
}
