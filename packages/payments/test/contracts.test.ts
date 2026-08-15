import test from "node:test";
import assert from "node:assert/strict";
import {
  PayOnSiteOnlyPaymentPolicy,
  PaymentBoundaryError,
  type OnlinePaymentProvider,
} from "../src/contracts.ts";

const policy = new PayOnSiteOnlyPaymentPolicy();

test("V1 payment policy prepares pay-on-site cash/card payment", async () => {
  const payment = await policy.prepare({ amountCents: 1900, currency: "EUR" });
  assert.deepEqual(payment, {
    mode: "pay_on_site",
    method: "cash_or_card",
    status: "due_on_site",
    currency: "EUR",
    amountCents: 1900,
    providerReference: null,
  });
});

test("explicit pay-on-site request is accepted", async () => {
  const payment = await policy.prepare({ requestedMode: "pay_on_site", amountCents: 0 });
  assert.equal(payment.mode, "pay_on_site");
  assert.equal(payment.currency, "EUR");
});

test("online payment is rejected in V1", async () => {
  await assert.rejects(
    policy.prepare({ requestedMode: "online", amountCents: 1900 }),
    (error: unknown) => error instanceof PaymentBoundaryError && error.code === "ONLINE_PAYMENT_DISABLED",
  );
});

test("invalid amounts and unsupported currencies fail closed", async () => {
  await assert.rejects(
    policy.prepare({ amountCents: -1 }),
    (error: unknown) => error instanceof PaymentBoundaryError && error.code === "INVALID_PAYMENT_AMOUNT",
  );
  await assert.rejects(
    policy.prepare({ amountCents: 100, currency: "USD" }),
    (error: unknown) => error instanceof PaymentBoundaryError && error.code === "UNSUPPORTED_CURRENCY",
  );
});

test("future online provider contract stays outside the V1 policy", async () => {
  const provider: OnlinePaymentProvider = {
    async createCheckout(input) {
      return {
        providerReference: `future-${input.orderId}`,
        redirectUrl: "https://payments.invalid/future",
      };
    },
  };
  const result = await provider.createCheckout({
    orderId: "order-1",
    amountCents: 1900,
    currency: "EUR",
    returnUrl: "https://mcello.invalid/status",
  });
  assert.equal(result.providerReference, "future-order-1");
});
