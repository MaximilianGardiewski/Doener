import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../apps/mcello/public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../apps/mcello/public/index.html", import.meta.url), "utf8");

test("customer cart persists for 48 hours and is revalidated before OTP and submit", () => {
  assert.match(app, /CART_MAX_AGE_MS = 48 \* 60 \* 60 \* 1000/);
  assert.match(app, /localStorage\.setItem\(CART_KEY/);
  assert.match(app, /async function prepareCartForCheckout/);
  assert.match(app, /refreshMenuSnapshot\(requestedPickupAt\)/);
  assert.match(app, /validateAndRepriceCart\(\)/);
  const prepareCalls = app.match(/prepareCartForCheckout\(requestedPickupAt\)/g) || [];
  assert.ok(prepareCalls.length >= 2, "OTP start and final submit must both revalidate the cart");
});

test("checkout exposes ASAP and later free-slot modes with minimal V1 customer data", () => {
  assert.match(html, /<option value="asap">So schnell wie möglich<\/option>/);
  assert.match(html, /<option value="later">Für später<\/option>/);
  assert.match(html, /id="checkoutFirstName"/);
  assert.match(html, /id="checkoutMobile"/);
  assert.match(html, /id="checkoutComment"/);
  assert.doesNotMatch(html, /checkoutEmail|checkoutAddress|checkoutAccount/i);
  assert.match(app, /\/api\/slots\?days=7/);
  assert.match(app, /state\.slotMinutes = data\.slotMinutes \|\| 15/);
});

test("closed paused or cutoff shop stays browsable while checkout remains fail-closed", () => {
  assert.match(app, /\["force_closed", "pause", "today_closed"\]\.includes\(shop\.override\)/);
  assert.match(app, /Number\(shop\.minutesUntilScheduledClose\) > Number\(shop\.orderCutoffMinutes \|\| 0\)/);
  assert.match(app, /const canStart = state\.cart\.length > 0 && state\.backendReady && shopAcceptsOrders\(\)/);
  assert.match(app, /Aktuell geschlossen\. Du kannst weiter stöbern und den Warenkorb für später vorbereiten\./);
  assert.match(app, /Der Online-Bestellschluss für heute ist erreicht\. Dein Warenkorb bleibt gespeichert\./);
});

test("browser checkout sends only V1 customer fields plus order mechanics", () => {
  const checkoutPayload = app.match(/fetch\("\/api\/checkout"[\s\S]*?body: JSON\.stringify\(\{([\s\S]*?)\r?\n\s*\}\),\r?\n\s*\}\);/);
  assert.ok(checkoutPayload, "checkout payload must remain explicit");
  const payload = checkoutPayload[1];
  assert.match(payload, /firstName:/);
  assert.match(payload, /mobile:/);
  assert.match(payload, /comment:/);
  assert.doesNotMatch(payload, /email:|address:|account:/i);
});
