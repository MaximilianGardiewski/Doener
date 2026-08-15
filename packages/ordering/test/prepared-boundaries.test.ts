import test from "node:test";
import assert from "node:assert/strict";
import type { MenuProduct } from "../../menu-engine/src/model.ts";
import type { Order } from "../src/model.ts";
import {
  submitVerifiedPickupOrder,
  type CheckoutDependencies,
  type CheckoutRequest,
} from "../src/checkout.ts";
import { hasSlotCapacity } from "../src/capacity.ts";

const product: MenuProduct = {
  id: "prepared-product",
  categoryId: "prepared-category",
  name: "Prepared boundary fixture",
  basePriceCents: 1000,
  effortWeight: 2.5,
};

const request: CheckoutRequest = {
  locationId: "mcello",
  firstName: "Prepared",
  mobile: "+491701234567",
  requestedPickupAt: "2026-08-14T19:15:00.000Z",
  otpChallengeId: "challenge-1",
  otpCode: "123456",
  cart: [{ productId: product.id, quantity: 1, selections: [] }],
};

function setup() {
  let created: Parameters<CheckoutDependencies["orders"]["create"]>[0] | undefined;
  let slotRequest: { locationId: string; pickupAt: string } | undefined;

  const deps: CheckoutDependencies = {
    otp: {
      async sendOtp() { return { challengeId: "challenge-1", channel: "whatsapp", expiresAt: "later" }; },
      async verifyOtp() { return { verified: true }; },
    },
    catalog: {
      async getProduct() { return product; },
      async isProductAvailable() { return true; },
    },
    shop: {
      async getShopState() { return { scheduledOpen: true, orderCutoffMinutes: 30 }; },
    },
    slots: {
      async getSlotCapacity(locationId, pickupAt) {
        slotRequest = { locationId, pickupAt };
        return { capacity: 6, acceptedOrderCount: 5 };
      },
    },
    orders: {
      async create(input) {
        created = input;
        return {
          id: "prepared-order",
          locationId: input.locationId,
          source: input.source,
          fulfillmentType: input.fulfillmentType,
          state: input.state,
          totalCents: input.totalCents,
          payment: input.payment,
        } satisfies Order;
      },
    },
    statusUrlFor: (order) => `https://preview.invalid/status/${order.id}`,
  };

  return { deps, created: () => created, slotRequest: () => slotRequest };
}

test("future source value supplied by a caller cannot change Mcello V1 web checkout origin", async () => {
  const harness = setup();
  const tamperedRequest = { ...request, source: "table" } as CheckoutRequest & { source: "table" };
  const order = await submitVerifiedPickupOrder(
    tamperedRequest,
    harness.deps,
    "2026-08-14T18:00:00.000Z",
  );

  assert.equal(order.source, "web");
  assert.equal(harness.created()?.source, "web");
});

test("product effort weight is preserved as order-item metadata for a later capacity policy", async () => {
  const harness = setup();
  await submitVerifiedPickupOrder(request, harness.deps, "2026-08-14T18:00:00.000Z");
  assert.equal(harness.created()?.items[0]?.effortWeightSnapshot, 2.5);
});

test("V1 slot admission stays strictly count-based even when effort metadata exists", async () => {
  const harness = setup();
  await submitVerifiedPickupOrder(request, harness.deps, "2026-08-14T18:00:00.000Z");
  assert.deepEqual(harness.slotRequest(), {
    locationId: "mcello",
    pickupAt: "2026-08-14T19:15:00.000Z",
  });
  assert.equal(hasSlotCapacity({ capacity: 6, acceptedOrderCount: 5 }), true);
  assert.equal(hasSlotCapacity({ capacity: 6, acceptedOrderCount: 6 }), false);
});
