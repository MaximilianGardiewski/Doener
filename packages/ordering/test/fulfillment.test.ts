import test from "node:test";
import assert from "node:assert/strict";
import {
  FulfillmentBoundaryError,
  PickupOnlyFulfillmentPolicy,
  type DeliveryZoneResolver,
  type DeliveryZoneRule,
} from "../src/fulfillment.ts";
import {
  CheckoutError,
  submitVerifiedPickupOrder,
  type CheckoutDependencies,
  type CheckoutRequest,
} from "../src/checkout.ts";

const policy = new PickupOnlyFulfillmentPolicy();

test("Mcello V1 fulfillment defaults to pickup", async () => {
  assert.deepEqual(await policy.prepare({}), { type: "pickup" });
  assert.deepEqual(await policy.prepare({ requestedType: "pickup" }), { type: "pickup" });
});

test("Mcello V1 rejects an explicit delivery request", async () => {
  await assert.rejects(
    policy.prepare({ requestedType: "delivery" }),
    (error: unknown) => error instanceof FulfillmentBoundaryError && error.code === "DELIVERY_DISABLED",
  );
});

test("checkout rejects delivery before OTP or persistence work", async () => {
  let otpCalls = 0;
  let orderCalls = 0;
  const request: CheckoutRequest = {
    locationId: "mcello",
    firstName: "Delivery",
    mobile: "+491701234567",
    fulfillmentType: "delivery",
    otpChallengeId: "challenge-1",
    otpCode: "123456",
    cart: [{ productId: "product", quantity: 1, selections: [] }],
  };
  const deps: CheckoutDependencies = {
    otp: {
      async sendOtp() { return { challengeId: "challenge-1", channel: "whatsapp", expiresAt: "later" }; },
      async verifyOtp() { otpCalls += 1; return { verified: true }; },
    },
    catalog: {
      async getProduct() { throw new Error("catalog should not be called"); },
      async isProductAvailable() { throw new Error("catalog should not be called"); },
    },
    shop: {
      async getShopState() { throw new Error("shop should not be called"); },
    },
    slots: {
      async getSlotCapacity() { throw new Error("slots should not be called"); },
    },
    orders: {
      async create() { orderCalls += 1; throw new Error("orders should not be called"); },
    },
    statusUrlFor: () => "https://preview.invalid/status",
  };

  await assert.rejects(
    submitVerifiedPickupOrder(request, deps, "2026-08-15T08:00:00.000Z"),
    (error: unknown) => error instanceof CheckoutError && error.code === "FULFILLMENT_NOT_AVAILABLE",
  );
  assert.equal(otpCalls, 0);
  assert.equal(orderCalls, 0);
});

test("future delivery-zone contract supports PLZ and radius without choosing a provider", async () => {
  const rules: DeliveryZoneRule[] = [
    { id: "postal", kind: "postal_code", postalCodes: ["79189"] },
    { id: "radius", kind: "radius", center: { lat: 47.9, lon: 7.7 }, radiusMeters: 5000 },
  ];
  assert.equal(rules[0]?.kind, "postal_code");
  assert.equal(rules[1]?.kind, "radius");

  const resolver: DeliveryZoneResolver = {
    async resolve(input) {
      return input.destination.postalCode === "79189"
        ? { eligible: true, matchedZoneId: "postal" }
        : { eligible: false };
    },
  };

  assert.deepEqual(
    await resolver.resolve({ locationId: "mcello", destination: { postalCode: "79189" } }),
    { eligible: true, matchedZoneId: "postal" },
  );
});
