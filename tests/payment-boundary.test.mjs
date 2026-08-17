import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const contracts = await readFile(new URL("../packages/payments/src/contracts.ts", import.meta.url), "utf8");
const checkout = await readFile(new URL("../packages/ordering/src/checkout.ts", import.meta.url), "utf8");
const migration = await readFile(
  new URL("../supabase/migrations/20260815022500_payment_boundary.sql", import.meta.url),
  "utf8",
);
const statusHtml = await readFile(new URL("../apps/mcello/public/status.html", import.meta.url), "utf8");
const statusJs = await readFile(new URL("../apps/mcello/public/status.js", import.meta.url), "utf8");

test("payment package is the single provider-neutral payment contract", async () => {
  assert.match(contracts, /interface OnlinePaymentProvider/);
  assert.match(contracts, /class PayOnSiteOnlyPaymentPolicy/);
  assert.match(contracts, /ONLINE_PAYMENT_DISABLED/);
  assert.match(contracts, /UNSUPPORTED_PAYMENT_MODE/);
  assert.doesNotMatch(contracts, /stripe|paypal|adyen|mollie/i);
  await assert.rejects(
    access(new URL("../packages/notifications/src/payment-contract.ts", import.meta.url)),
    (error) => error?.code === "ENOENT",
  );
});

test("checkout prepares a payment snapshot and fails closed for online mode", () => {
  assert.match(checkout, /new PayOnSiteOnlyPaymentPolicy\(\)/);
  assert.match(checkout, /requestedMode: request\.paymentMode/);
  assert.match(checkout, /PAYMENT_NOT_AVAILABLE/);
  assert.match(checkout, /payment,/);
});

test("database V1 constraint blocks every online/provider payment state", () => {
  assert.match(migration, /default 'pay_on_site'/i);
  assert.match(migration, /default 'cash_or_card'/i);
  assert.match(migration, /default 'due_on_site'/i);
  assert.match(migration, /orders_v1_payment_boundary/i);
  assert.match(migration, /payment_mode = 'pay_on_site'/i);
  assert.match(migration, /payment_method = 'cash_or_card'/i);
  assert.match(migration, /payment_provider_reference is null/i);
});

test("customer status communicates on-site cash/card payment", () => {
  assert.match(statusHtml, /Vor Ort · bar oder Karte/);
  assert.match(statusHtml, /id="statusPayment"/);
  assert.match(statusJs, /payment\?\.mode === "pay_on_site"/);
  assert.match(statusJs, /payment\?\.method === "cash_or_card"/);
});
