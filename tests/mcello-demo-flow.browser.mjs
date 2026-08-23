import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const APP_URL = process.env.MCELLO_DEMO_URL || "http://127.0.0.1:4173";
const LOCATION_ID = "00000000-0000-4000-8000-000000000001";

const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const anonKey = required("SUPABASE_ANON_KEY");
const adminEmail = required("MCELLO_DEV_ADMIN_EMAIL");
const adminPassword = required("MCELLO_DEV_ADMIN_PASSWORD");

await forceOpenForDemo();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const customer = await context.newPage();
const pageErrors = [];
customer.on("pageerror", (error) => pageErrors.push(`customer pageerror: ${error.message}`));

try {
  await customer.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
  await customer.locator("#categoryRail button").first().waitFor({ state: "visible", timeout: 20_000 });

  assert.match(await customer.locator("body").innerText(), /Mcello/i);
  assert.equal((await customer.locator("body").innerText()).includes("SMS"), false, "Mcello V1 UI must not advertise SMS");

  const productName = "Apfelsaft";
  const categories = customer.locator("#categoryRail button");
  const categoryCount = await categories.count();
  let productButton = null;

  for (let index = 0; index < categoryCount; index += 1) {
    await categories.nth(index).click();
    const row = customer.locator(".food-card, .list-row").filter({ hasText: productName }).first();
    if (await row.count()) {
      const candidate = row.locator("[data-product]").first();
      if (await candidate.isEnabled()) {
        productButton = candidate;
        break;
      }
    }
  }

  assert.ok(productButton, `${productName} must be discoverable and orderable in the local demo menu`);
  await productButton.click();
  await customer.locator("#productModal").waitFor({ state: "visible" });
  await customer.locator("#modalTitle").filter({ hasText: productName }).waitFor({ state: "visible" });

  const groups = customer.locator("#modifierGroups .modifier-group");
  for (let index = 0; index < await groups.count(); index += 1) {
    const group = groups.nth(index);
    const label = await group.locator(".modifier-head small").innerText();
    const requiredCount = Number(label.match(/Mind\.\s*(\d+)/)?.[1] || 0);
    const checked = group.locator("input:checked:not(:disabled)");
    let missing = Math.max(0, requiredCount - await checked.count());
    const available = group.locator("input:not(:checked):not(:disabled)");
    for (let optionIndex = 0; missing > 0 && optionIndex < await available.count(); optionIndex += 1) {
      await available.nth(optionIndex).check();
      missing -= 1;
    }
    assert.equal(missing, 0, `required modifier group ${index + 1} must be satisfiable`);
  }

  await customer.locator("#addToCart").click();
  await customer.locator("#cartCount").filter({ hasText: "1 Artikel" }).waitFor({ state: "visible" });
  const cartDrawer = customer.locator("#cartDrawer");
  const cartAlreadyOpen = await cartDrawer.evaluate((node) => node.classList.contains("open"));
  if (!cartAlreadyOpen) await customer.locator("[data-open-cart]").last().click();
  await cartDrawer.waitFor({ state: "visible" });

  await customer.locator("#checkoutFirstName").fill("Mcello Demo");
  await customer.locator("#checkoutMobile").fill("+491701234567");
  await customer.locator("#checkoutComment").fill("Browser-Demo · WhatsApp-only V1");

  const otpButton = customer.locator("#requestOtp");
  await otpButton.waitFor({ state: "visible" });
  assert.match(await otpButton.innerText(), /WhatsApp/i, "checkout must name WhatsApp as the V1 verification channel");
  await otpButton.click();

  await customer.locator("#otpPanel").waitFor({ state: "visible" });
  const devHint = customer.locator("#devOtpHint");
  await devHint.waitFor({ state: "visible" });
  assert.match(await devHint.innerText(), /Lokaler DEV-Code:\s*\d{6}/);
  assert.match(await customer.locator("#otpCode").inputValue(), /^\d{6}$/);

  await Promise.all([
    customer.waitForURL(/\/status\.html\?token=/, { timeout: 20_000 }),
    customer.locator("#submitOrder").click(),
  ]);

  await customer.locator("#statusTitle").filter({ hasText: "Eingegangen" }).waitFor({ state: "visible", timeout: 15_000 });
  const orderNumberText = await customer.locator("#orderNumber").innerText();
  const orderNumber = orderNumberText.match(/#([^\s]+)/)?.[1];
  assert.ok(orderNumber, `could not parse order number from ${orderNumberText}`);
  await customer.locator("#editOrder").waitFor({ state: "visible" });

  const kds = await context.newPage();
  kds.on("pageerror", (error) => pageErrors.push(`kds pageerror: ${error.message}`));
  await kds.goto(`${APP_URL}/kds.html`, { waitUntil: "domcontentloaded" });

  const incomingOrder = kds.locator("#incoming .order").filter({ hasText: `#${orderNumber}` }).first();
  await incomingOrder.waitFor({ state: "visible", timeout: 20_000 });
  await incomingOrder.locator('[data-action="accept"][data-minutes="15"]').click();

  const preparingOrder = kds.locator("#preparing .order").filter({ hasText: `#${orderNumber}` }).first();
  await preparingOrder.waitFor({ state: "visible", timeout: 15_000 });

  await customer.locator("#refreshStatus").click();
  await customer.locator("#statusTitle").filter({ hasText: "In Zubereitung" }).waitFor({ state: "visible", timeout: 15_000 });
  await customer.locator("#editOrder").waitFor({ state: "hidden" });
  await customer.locator("#etaBlock").waitFor({ state: "visible" });

  await preparingOrder.locator('[data-action="ready"]').click();
  const readyOrder = kds.locator("#ready .order").filter({ hasText: `#${orderNumber}` }).first();
  await readyOrder.waitFor({ state: "visible", timeout: 15_000 });

  await customer.locator("#refreshStatus").click();
  await customer.locator("#statusTitle").filter({ hasText: "Abholbereit" }).waitFor({ state: "visible", timeout: 15_000 });

  await readyOrder.locator('[data-action="complete"]').click();
  await customer.locator("#refreshStatus").click();
  await customer.locator("#statusTitle").filter({ hasText: "Abgeholt" }).waitFor({ state: "visible", timeout: 15_000 });

  assert.deepEqual(pageErrors, [], pageErrors.join("\n"));
  console.log("Mcello presentation browser flow passed", {
    product: productName,
    verification: "whatsapp-only local dev code",
    orderNumber,
    lifecycle: ["received", "preparing", "ready", "completed"],
  });
} finally {
  await browser.close();
}

async function forceOpenForDemo() {
  const loginResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  const login = await loginResponse.json().catch(() => ({}));
  assert.equal(loginResponse.ok, true, JSON.stringify(login));
  assert.ok(login.access_token, "local demo admin login must return an access token");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_set_shop_override`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${login.access_token}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      _location_id: LOCATION_ID,
      _override: "force_open",
      _operator_message: "Lokaler Präsentationsmodus",
    }),
  });
  const body = await response.text();
  assert.equal(response.ok, true, body);
}

function parseEnv(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function required(name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is missing from .env.local`);
  return value;
}
