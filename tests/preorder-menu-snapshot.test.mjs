import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../apps/mcello/public/app.js", import.meta.url), "utf8");
const server = await readFile(new URL("../apps/mcello/server.mjs", import.meta.url), "utf8");

test("local menu endpoint evaluates the public menu at a bounded requested pickup time", () => {
  assert.match(server, /url\.searchParams\.get\("at"\)/);
  assert.match(server, /14 \* 24 \* 60 \* 60_000/);
  assert.match(server, /_at: at/);
  assert.match(server, /INVALID_MENU_TIME/);
});

test("future pickup selection refreshes product and modifier availability from the same public menu RPC", () => {
  assert.match(app, /fetch\(`\/api\/menu\$\{query\}`/);
  assert.match(app, /refreshMenuSnapshot\(selected\)/);
  assert.match(app, /prepareCartForCheckout\(requestedPickupAt\)/);
  assert.match(app, /Für diesen Abholslot nicht verfügbar/);
});

test("cart is preflighted and repriced before otp while backend and database remain final authority", () => {
  assert.match(app, /function validateAndRepriceCart\(\)/);
  assert.match(app, /line\.unitPriceCents = currentPrice/);
  assert.match(app, /wurde bei Zutaten, Sauce, Größe oder Extras geändert/);
  assert.match(app, /if \(!await prepareCartForCheckout\(requestedPickupAt\)\) return/);
});

test("slot-scoped menu refresh does not silently delete cart rows that become unavailable", () => {
  const refreshBody = app.slice(app.indexOf("async function refreshMenuSnapshot"), app.indexOf("async function prepareCartForCheckout"));
  assert.doesNotMatch(refreshBody, /reconcileCartWithMenu\(/);
  assert.match(app, /ist für den gewählten Abholzeitpunkt nicht verfügbar/);
});

test("staff HTTP surface no longer advertises force-open", () => {
  assert.match(server, /new Set\(\["auto", "force_closed", "pause", "today_closed"\]\)/);
});
