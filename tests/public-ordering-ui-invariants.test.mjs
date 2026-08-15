import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../apps/mcello/public/app.js", import.meta.url), "utf8");
const index = await readFile(new URL("../apps/mcello/public/index.html", import.meta.url), "utf8");
const shopStateMigration = await readFile(new URL("../supabase/migrations/20260815012300_shop_state_capabilities.sql", import.meta.url), "utf8");

test("active public app uses server-provided capacity slots instead of free-form pickup times", () => {
  assert.match(index, /src="\/app\.js"/);
  assert.match(app, /\/api\/slots\?days=7/);
  assert.match(app, /id="pickupSlot"/);
  assert.match(app, /slot\.remaining/);
  assert.doesNotMatch(app, /const raw = \$\("#pickupAt"\)/);
});

test("public ordering fails closed in the UI while browsing and cart persistence stay available", () => {
  assert.match(app, /CART_MAX_AGE_MS = 48 \* 60 \* 60 \* 1000/);
  assert.match(app, /\/api\/kds\/shop-state/);
  assert.match(app, /function shopAcceptsOrders\(\)/);
  assert.match(app, /\["force_closed", "pause", "today_closed"\]/);
  assert.match(app, /if \(!await loadShopState\(\)\)/);
  assert.match(app, /Backend prüft Preise, Optionen, Öffnungszeit und Slot-Kapazität/);
});

test("shop state includes structural online-ordering capability flags", () => {
  assert.match(shopStateMigration, /'onlineOrderingEnabled', settings\.online_ordering_enabled/);
  assert.match(shopStateMigration, /'pickupEnabled', settings\.pickup_enabled/);
});
