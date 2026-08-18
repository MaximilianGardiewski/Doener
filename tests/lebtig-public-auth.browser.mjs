import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.LEBTIG_PREVIEW_URL || "http://127.0.0.1:4174";
const publicPaths = [
  "/",
  "/mittagstisch",
  "/wochenangebote",
  "/partyservice",
  "/kontakt",
  "/sortiment",
  "/ueber-uns",
  "/aktuelles",
  "/aktuelles/portable-smoke",
  "/rezepte",
  "/rezepte/portable-smoke",
  "/seite/portable-smoke",
  "/datenschutz",
  "/impressum",
];

async function verifyViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  for (const pathname of publicPaths) {
    const response = await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200, `${pathname} should return 200`);
    assert.equal(await page.locator("h1").count(), 1, `${pathname} should render exactly one h1`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${pathname} should not overflow horizontally (delta ${overflow})`);
  }

  const authResponse = await page.goto(`${baseUrl}/auth`, { waitUntil: "networkidle" });
  assert.equal(authResponse?.status(), 200, "/auth should return 200");
  assert.equal(await page.locator("h1").count(), 1, "/auth should render exactly one h1");
  assert.equal(await page.getByLabel("E-Mail").count(), 1, "auth email field should render");
  assert.equal(await page.getByLabel("Passwort").count(), 1, "auth password field should render");
  assert.equal(await page.getByRole("button", { name: "Anmelden", exact: true }).count(), 1, "auth sign-in should render");
  assert.equal(await page.getByTestId("invite-only-hint").count(), 1, "bootstrap should fail closed in portable shell");
  const authOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(authOverflow <= 1, `/auth should not overflow horizontally (delta ${authOverflow})`);

  assert.deepEqual(consoleErrors, [], `browser console/page errors: ${consoleErrors.join(" | ")}`);
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await verifyViewport(browser, { width: 1280, height: 900 });
  await verifyViewport(browser, { width: 390, height: 844 });
} finally {
  await browser.close();
}

console.log("Lebtig public/auth browser smoke passed");
