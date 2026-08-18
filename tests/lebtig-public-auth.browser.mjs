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

async function expectRedirect(pathname, status, location) {
  const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
  assert.equal(response.status, status, `${pathname} should return ${status}`);
  assert.equal(response.headers.get("location"), location, `${pathname} should redirect to ${location}`);
}

async function verifyHttpContracts() {
  await expectRedirect("/Startseite", 308, "/");
  await expectRedirect("/Ueber-Uns/", 308, "/ueber-uns");
  await expectRedirect("/Unser-Sortiment", 308, "/sortiment");
  await expectRedirect("/Kontakt/Oeffnungszeiten", 308, "/kontakt");
  await expectRedirect("/Mittagstisch/?utm_source=flyer", 308, "/mittagstisch?utm_source=flyer");
  await expectRedirect("/Rezepte/Wiener-Tafelspitz/", 308, "/rezepte");

  for (const pathname of ["/admin", "/admin/mittagstisch"]) {
    const response = await fetch(`${baseUrl}${pathname}`, { redirect: "manual" });
    assert.equal(response.status, 200, `${pathname} should serve the app-owned admin SPA shell`);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
  }

  const bootstrap = await fetch(`${baseUrl}/api/bootstrap-status`);
  assert.equal(bootstrap.status, 200, "bootstrap status should be a server-owned JSON endpoint");
  assert.match(bootstrap.headers.get("content-type") || "", /application\/json/);
  const bootstrapPayload = await bootstrap.json();
  assert.deepEqual(
    bootstrapPayload,
    { configured: false, bootstrapOpen: false },
    "unconfigured preview must expose only a fail-closed bootstrap result",
  );

  const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemap.status, 200, "/sitemap.xml should return 200");
  assert.match(sitemap.headers.get("content-type") || "", /application\/xml/);
  const xml = await sitemap.text();
  for (const pathname of [
    "/mittagstisch",
    "/wochenangebote",
    "/partyservice",
    "/kontakt",
    "/sortiment",
    "/ueber-uns",
    "/aktuelles",
    "/rezepte",
    "/datenschutz",
    "/impressum",
  ]) {
    assert.ok(xml.includes(`${pathname}</loc>`), `sitemap should contain ${pathname}`);
  }
  assert.ok(!xml.includes("/auth</loc>"), "sitemap must not expose auth as indexable content");
  assert.ok(!xml.includes("/admin</loc>"), "sitemap must not expose admin as indexable content");

  const media = await fetch(`${baseUrl}/media/not-configured`, { redirect: "manual" });
  assert.equal(media.status, 404, "portable shell must fail closed for unconfigured media backend");

  const unknown = await fetch(`${baseUrl}/gibt-es-nicht-xyz`, { redirect: "manual" });
  assert.equal(unknown.status, 404, "unknown direct requests should return a real 404");
}

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

  await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  await page.waitForURL(`${baseUrl}/auth`);
  assert.equal(await page.getByLabel("Passwort").count(), 1, "unconfigured admin route should fail closed to auth");

  if (viewport.width <= 390) {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    const menuSummary = page.locator(".mobile-menu > summary");
    assert.equal(await menuSummary.count(), 1, "mobile navigation control should render");
    await menuSummary.click();
    const lunchLink = page.locator(".mobile-panel a[href='/mittagstisch']");
    assert.equal(await lunchLink.count(), 1, "mobile navigation should expose Mittagstisch");
    await lunchLink.click();
    await page.waitForURL(`${baseUrl}/mittagstisch`);
    assert.equal(await page.locator("h1").count(), 1, "mobile navigation target should render");
  }

  assert.deepEqual(consoleErrors, [], `browser console/page errors: ${consoleErrors.join(" | ")}`);
  await context.close();
}

await verifyHttpContracts();

const browser = await chromium.launch({ headless: true });
try {
  await verifyViewport(browser, { width: 1280, height: 900 });
  await verifyViewport(browser, { width: 390, height: 844 });
} finally {
  await browser.close();
}

console.log("Lebtig public/auth/admin HTTP and browser smoke passed");
