import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile(new URL("../apps/mcello/server.mjs", import.meta.url), "utf8");
const statusHtml = await readFile(new URL("../apps/mcello/public/status.html", import.meta.url), "utf8");
const statusJs = await readFile(new URL("../apps/mcello/public/status.js", import.meta.url), "utf8");
const editHtml = await readFile(new URL("../apps/mcello/public/edit-order.html", import.meta.url), "utf8");
const editJs = await readFile(new URL("../apps/mcello/public/edit-order.js", import.meta.url), "utf8");
const privacyMigration = await readFile(
  new URL("../supabase/migrations/20260815025800_preaccept_edit_context_privacy.sql", import.meta.url),
  "utf8",
);

function requireTokens(source, tokens) {
  for (const token of tokens) assert.equal(source.includes(token), true, `missing marker: ${token}`);
}

test("status exposes edit navigation only while public status says editable", () => {
  requireTokens(statusHtml, ['id="editOrder"', 'Bestellung ändern']);
  requireTokens(statusJs, [
    'status.editable === true',
    'status.state === "waiting_for_acceptance"',
    '/edit-order.html?token=',
  ]);
});

test("dedicated editor contains only mutable customer order fields", () => {
  requireTokens(editHtml, [
    'id="pickupMode"',
    'id="pickupAt"',
    'id="orderComment"',
    'id="editItems"',
    'id="saveEdit"',
  ]);
  for (const forbidden of [
    'checkoutMobile', 'otpCode', 'paymentMode', 'fulfillmentType', 'orderSource',
    'autocomplete="tel"', 'one-time-code',
  ]) {
    assert.equal(editHtml.includes(forbidden), false, `editor must not expose ${forbidden}`);
  }
  requireTokens(editJs, [
    '/api/order-edit?token=',
    'method: "POST"',
    'productId: line.productId',
    'quantity: Number(line.quantity)',
    'selections: line.selections || []',
    'requestedPickupAt: pickupAt',
  ]);
  for (const forbiddenPayload of ['mobile:', 'paymentMode:', 'fulfillmentType:', 'source:', 'firstName:']) {
    assert.equal(editJs.includes(forbiddenPayload), false, `edit payload must not contain ${forbiddenPayload}`);
  }
});

test("server routes edit through service-role-only RPCs and never accepts identity fields", () => {
  requireTokens(server, [
    'url.pathname === "/api/order-edit"',
    'server_get_pending_order_edit_context',
    'server_replace_pending_order',
    'serviceRpc()',
  ]);
  assert.equal(server.includes('body.mobile'), false, "edit route must not consume mobile");
  assert.equal(server.includes('body.paymentMode'), false, "edit route must not consume payment mode");
  assert.equal(server.includes('body.fulfillmentType'), false, "edit route must not consume fulfillment");
  assert.equal(server.includes('body.source'), false, "edit route must not consume source");
});

test("database edit context is privacy-minimal and V1-scoped", () => {
  requireTokens(privacyMigration, [
    "state <> 'waiting_for_acceptance'",
    "source <> 'web'",
    "fulfillment <> 'pickup'",
    "'orderNumber'",
    "'customerFirstName'",
    "'requestedPickupAt'",
    "'items'",
  ]);
  for (const forbidden of ["'locationId'", "'mobile'", "'payment'", "'source'", "'fulfillment'"]) {
    assert.equal(privacyMigration.includes(forbidden), false, `public edit context must not build ${forbidden}`);
  }
});
