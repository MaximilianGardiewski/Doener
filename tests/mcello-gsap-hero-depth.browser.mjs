import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const scenario = process.argv[2] || "all";
const allowedScenarios = new Set(["all", "normal", "fallback", "reduced"]);
assert.ok(allowedScenarios.has(scenario), `unknown hero scenario: ${scenario}`);

const browser = await chromium.launch({ headless: true });

async function heroSnapshot(page) {
  return page.locator(".hero-photo").evaluate((node) => {
    const style = getComputedStyle(node);
    const matrix = style.transform === "none" ? new DOMMatrix() : new DOMMatrix(style.transform);
    return {
      transform: style.transform,
      transitionDuration: style.transitionDuration,
      y: matrix.m42,
      scaleX: matrix.a,
      scaleY: matrix.d,
      legacyDepth: node.style.getPropertyValue("--motion-hero-depth-y"),
    };
  });
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
    await page.waitForFunction(() => document.documentElement.dataset.mcelloHeroEngine === "gsap");

    const before = await heroSnapshot(page);
    assert.equal(before.legacyDepth, "", `GSAP ownership must remove the V2 depth variable: ${JSON.stringify(before)}`);
    assert.match(before.transitionDuration, /(^|, )0s(,|$)/, `GSAP hero must disable CSS transition contention: ${JSON.stringify(before)}`);
    assert.ok(Math.abs(before.y) <= 10.5, `initial GSAP depth must stay bounded: ${JSON.stringify(before)}`);
    assert.ok(Math.abs(before.scaleX - 1.045) < 0.01, `GSAP hero scaleX must stay stable: ${JSON.stringify(before)}`);
    assert.ok(Math.abs(before.scaleY - 1.045) < 0.01, `GSAP hero scaleY must stay stable: ${JSON.stringify(before)}`);

    await page.evaluate(() => window.scrollTo(0, 360));
    await page.waitForTimeout(150);
    const after = await heroSnapshot(page);
    assert.ok(Math.abs(after.y) <= 10.5, `scrolled GSAP depth must stay bounded: ${JSON.stringify(after)}`);
    assert.ok(after.y > before.y + 0.5, `GSAP hero depth should advance with native page scroll: before=${before.y}, after=${after.y}`);
    assert.ok(Math.abs(after.scaleX - 1.045) < 0.01);
    assert.ok(Math.abs(after.scaleY - 1.045) < 0.01);
    assert.deepEqual(pageErrors, []);
    console.log("Mcello GSAP hero-depth normal scenario passed.");
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
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloMotionEngine === "fallback");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloHeroEngine), "v2");

    const before = await heroSnapshot(page);
    assert.notEqual(before.legacyDepth, "", "V2 fallback must retain its CSS depth variable");
    const beforeDepth = Number.parseFloat(before.legacyDepth);
    assert.ok(Number.isFinite(beforeDepth) && Math.abs(beforeDepth) <= 10.1);

    await page.evaluate(() => window.scrollTo(0, 360));
    await page.waitForTimeout(150);
    const after = await heroSnapshot(page);
    const afterDepth = Number.parseFloat(after.legacyDepth);
    assert.ok(Number.isFinite(afterDepth) && Math.abs(afterDepth) <= 10.1);
    assert.ok(afterDepth > beforeDepth + 0.5, `V2 fallback depth should continue reacting to scroll: before=${beforeDepth}, after=${afterDepth}`);
    assert.deepEqual(pageErrors, []);
    console.log("Mcello GSAP hero-depth vendor-fallback scenario passed.");
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
    assert.equal(await page.evaluate(() => document.documentElement.dataset.mcelloHeroEngine), "reduced");
    assert.equal(await page.locator('script[data-mcello-gsap-vendor]').count(), 0, "reduced motion must not load GSAP vendor scripts");

    const snapshot = await heroSnapshot(page);
    assert.equal(snapshot.legacyDepth, "", "reduced motion must not retain a scroll-depth variable");
    assert.match(snapshot.transitionDuration, /(^|, )0s(,|$)/, "reduced motion must disable hero transitions");
    assert.ok(Math.abs(snapshot.y) < 0.01, `reduced motion must remove hero translation: ${JSON.stringify(snapshot)}`);
    assert.ok(Math.abs(snapshot.scaleX - 1.035) < 0.01, `reduced hero scale must match the CSS final state: ${JSON.stringify(snapshot)}`);
    assert.ok(Math.abs(snapshot.scaleY - 1.035) < 0.01, `reduced hero scale must match the CSS final state: ${JSON.stringify(snapshot)}`);
    console.log("Mcello GSAP hero-depth reduced-motion scenario passed.");
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
