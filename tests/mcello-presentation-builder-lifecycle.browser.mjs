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

async function openNamedProduct(page, productName) {
  await page.locator("#categoryRail [data-category]").first().waitFor({ state: "visible", timeout: 20_000 });
  const categories = page.locator("#categoryRail [data-category]");
  for (let categoryIndex = 0; categoryIndex < await categories.count(); categoryIndex += 1) {
    await categories.nth(categoryIndex).click();
    const rows = page.locator(".food-card, .list-row");
    for (let rowIndex = 0; rowIndex < await rows.count(); rowIndex += 1) {
      const row = rows.nth(rowIndex);
      const heading = row.locator("h3, strong").first();
      if (!(await heading.count()) || (await heading.textContent())?.trim() !== productName) continue;
      const button = row.locator("[data-product]").first();
      if (!(await button.isEnabled())) continue;
      await button.click();
      await page.waitForFunction((expected) => {
        const modal = document.querySelector("#productModal");
        return modal?.classList.contains("open") && document.querySelector("#modalTitle")?.textContent?.trim() === expected;
      }, productName);
      return;
    }
  }
  throw new Error(`${productName} was not discoverable and orderable`);
}

async function modifierGroup(page, name) {
  const groups = page.locator("#modifierGroups .modifier-group");
  for (let index = 0; index < await groups.count(); index += 1) {
    const group = groups.nth(index);
    if ((await group.locator(".modifier-head strong").textContent())?.trim() === name) return group;
  }
  throw new Error(`Modifier group ${name} was not rendered`);
}

async function optionInput(group, name) {
  const options = group.locator(".modifier-option");
  for (let index = 0; index < await options.count(); index += 1) {
    const option = options.nth(index);
    if ((await option.locator("span").first().textContent())?.replace(/ · ausverkauft$/i, "").trim() === name) return option.locator("input");
  }
  throw new Error(`Modifier option ${name} was not rendered`);
}

try {
  await customer.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });

  await openNamedProduct(customer, "Pizza Mcello");
  await customer.waitForFunction(() => document.querySelector("#productModal")?.dataset.pizzaVisualLayers === "5");
  const pizzaGroup = await modifierGroup(customer, "Belag");
  const onions = await optionInput(pizzaGroup, "Zwiebeln");
  await onions.uncheck();
  await customer.waitForFunction(() => document.querySelector("#productModal")?.dataset.pizzaVisualLayers === "4");
  await customer.locator("#addToCart").click();
  await customer.locator("#cartDrawer").waitFor({ state: "visible" });
  await customer.locator("[data-close-cart]").click();

  await openNamedProduct(customer, "Drehspieß im Yufka");
  await customer.waitForFunction(() => document.querySelector("#productModal")?.dataset.assemblyPresentation === "true");
  await customer.waitForFunction(() => document.querySelector("#productModal")?.dataset.assemblyVisualLayers === "5");
  const sauceGroup = await modifierGroup(customer, "Soße");
  await (await optionInput(sauceGroup, "Knoblauch")).check();
  await (await optionInput(sauceGroup, "Scharf")).check();
  await customer.waitForFunction(() => document.querySelector("#productModal")?.dataset.assemblyVisualLayers === "7");
  await customer.locator("#addToCart").click();
  await customer.locator("#cartDrawer").waitFor({ state: "visible" });

  const cartText = await customer.locator("#cartItems").innerText();
  assert.match(cartText, /Pizza Mcello/);
  assert.match(cartText, /Drehspieß im Yufka/);
  assert.match(cartText, /Fleisch/);
  assert.match(cartText, /Salat/);
  assert.match(cartText, /Tomate/);
  assert.match(cartText, /Gurke/);
  assert.match(cartText, /Zwiebel/);
  assert.match(cartText, /Soße: Knoblauch/);
  assert.match(cartText, /Soße: Scharf/);
  assert.doesNotMatch(cartText, /Zwiebeln/, "removed Pizza topping must not be submitted as selected");
  assert.equal((await customer.locator("#cartCount").textContent())?.trim(), "2 Artikel");

  await customer.locator("#checkoutFirstName").fill("Builder Demo");
  await customer.locator("#checkoutMobile").fill("+491701234567");
  await customer.locator("#checkoutComment").fill("Presentation Builder Lifecycle V4");
  await customer.locator("#requestOtp").click();
  await customer.locator("#otpPanel").waitFor({ state: "visible" });
  await customer.locator("#devOtpHint").waitFor({ state: "visible" });
  assert.match(await customer.locator("#otpCode").inputValue(), /^\d{6}$/);

  await Promise.all([
    customer.waitForURL(/\/status\.html\?token=/, { timeout: 20_000 }),
    customer.locator("#submitOrder").click(),
  ]);

  await customer.locator("#statusTitle").filter({ hasText: "Eingegangen" }).waitFor({ state: "visible", timeout: 15_000 });
  const orderNumberText = await customer.locator("#orderNumber").innerText();
  const orderNumber = orderNumberText.match(/#([^\s]+)/)?.[1];
  assert.ok(orderNumber, `could not parse order number from ${orderNumberText}`);

  const kds = await context.newPage();
  kds.on("pageerror", (error) => pageErrors.push(`kds pageerror: ${error.message}`));
  await kds.goto(`${APP_URL}/kds.html`, { waitUntil: "domcontentloaded" });
  const incomingOrder = kds.locator("#incoming .order").filter({ hasText: `#${orderNumber}` }).first();
  await incomingOrder.waitFor({ state: "visible", timeout: 20_000 });

  const kdsText = await incomingOrder.innerText();
  assert.match(kdsText, /Pizza Mcello/);
  assert.match(kdsText, /Kebap Fleisch/);
  assert.match(kdsText, /Tomaten/);
  assert.match(kdsText, /Broccoli/);
  assert.match(kdsText, /Käse/);
  assert.doesNotMatch(kdsText, /Zwiebeln/, "KDS snapshot must preserve the Pizza topping removal");
  assert.match(kdsText, /Drehspieß im Yufka/);
  assert.match(kdsText, /Fleisch/);
  assert.match(kdsText, /Salat/);
  assert.match(kdsText, /Tomate/);
  assert.match(kdsText, /Gurke/);
  assert.match(kdsText, /Zwiebel/);
  assert.match(kdsText, /Knoblauch/);
  assert.match(kdsText, /Scharf/);

  await incomingOrder.locator('[data-action="accept"][data-minutes="15"]').click();
  const preparingOrder = kds.locator("#preparing .order").filter({ hasText: `#${orderNumber}` }).first();
  await preparingOrder.waitFor({ state: "visible", timeout: 15_000 });
  await customer.locator("#refreshStatus").click();
  await customer.locator("#statusTitle").filter({ hasText: "In Zubereitung" }).waitFor({ state: "visible", timeout: 15_000 });

  await preparingOrder.locator('[data-action="ready"]').click();
  const readyOrder = kds.locator("#ready .order").filter({ hasText: `#${orderNumber}` }).first();
  await readyOrder.waitFor({ state: "visible", timeout: 15_000 });
  await customer.locator("#refreshStatus").click();
  await customer.locator("#statusTitle").filter({ hasText: "Abholbereit" }).waitFor({ state: "visible", timeout: 15_000 });

  await readyOrder.locator('[data-action="complete"]').click();
  await customer.locator("#refreshStatus").click();
  await customer.locator("#statusTitle").filter({ hasText: "Abgeholt" }).waitFor({ state: "visible", timeout: 15_000 });

  assert.deepEqual(pageErrors, [], pageErrors.join("\n"));
  console.log("Mcello Builder presentation lifecycle V4 passed", { orderNumber });
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
    headers: { apikey: anonKey, authorization: `Bearer ${login.access_token}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ _location_id: LOCATION_ID, _override: "force_open", _operator_message: "Lokaler Builder-Präsentationsmodus" }),
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
