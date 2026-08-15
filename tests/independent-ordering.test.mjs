import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const app = await readFile(new URL("apps/mcello/public/app.js", root), "utf8");
const server = await readFile(new URL("apps/mcello/server.mjs", root), "utf8");
const ordering = await readFile(new URL("packages/ordering/src/checkout.ts", root), "utf8");

const combined = `${app}\n${server}\n${ordering}`;

test("D002 browser submits orders to the first-party Mcello checkout", () => {
  assert.match(app, /fetch\("\/api\/checkout",\s*\{[\s\S]*?method:\s*"POST"/);
  assert.match(app, /prepareCartForCheckout/);
  assert.match(app, /clientPriceCents/);
  assert.match(app, /statusUrl/);
});

test("D002 server owns validation persistence and public status handoff", () => {
  assert.match(server, /url\.pathname === "\/api\/checkout"/);
  assert.match(server, /submitVerifiedPickupOrder/);
  assert.match(server, /new SupabaseCatalogReader\(rpc\)/);
  assert.match(server, /new SupabaseShopStateReader\(rpc\)/);
  assert.match(server, /new SupabaseSlotReader\(rpc\)/);
  assert.match(server, /new SupabaseOrderWriter\(rpc\)/);
  assert.match(ordering, /export async function submitVerifiedPickupOrder/);
});

test("D002 ordering core does not depend on a third-party delivery marketplace", () => {
  for (const marketplace of ["lieferando", "wolt", "uber eats", "ubereats", "doordash", "deliveroo"]) {
    assert.equal(combined.toLowerCase().includes(marketplace), false, `marketplace dependency leaked into first-party ordering core: ${marketplace}`);
  }
});
