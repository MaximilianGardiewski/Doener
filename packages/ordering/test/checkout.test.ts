import test from "node:test";
import assert from "node:assert/strict";
import {
  CheckoutError,
  submitVerifiedPickupOrder,
  type CheckoutDependencies,
  type CheckoutRequest,
} from "../src/checkout.ts";
import type { MenuProduct } from "../../menu-engine/src/model.ts";
import type { Order } from "../src/model.ts";

const product: MenuProduct = {
  id: "doner",
  categoryId: "warm",
  name: "Drehspieß im Fladenbrot",
  basePriceCents: 850,
  modifierGroups: [
    {
      id: "sauce",
      name: "Sauce",
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: "garlic", name: "Knoblauch", priceDeltaCents: 0 },
        { id: "hot", name: "Scharf", priceDeltaCents: 0, soldOut: true },
      ],
    },
    {
      id: "extras",
      name: "Extras",
      minSelections: 0,
      maxSelections: 2,
      options: [{ id: "cheese", name: "Käse", priceDeltaCents: 100 }],
    },
  ],
};

const baseRequest: CheckoutRequest = {
  locationId: "mcello",
  firstName: "Maxi",
  mobile: "+491701234567",
  otpChallengeId: "challenge-1",
  otpCode: "123456",
  cart: [
    {
      productId: "doner",
      quantity: 2,
      clientPriceCents: 1,
      selections: [
        { groupId: "sauce", optionIds: ["garlic"] },
        { groupId: "extras", optionIds: ["cheese"] },
      ],
    },
  ],
};

function deps(overrides: Partial<CheckoutDependencies> = {}) {
  let createdInput: Parameters<CheckoutDependencies["orders"]["create"]>[0] | undefined;
  const dependencies: CheckoutDependencies = {
    otp: {
      async sendOtp() {
        return { challengeId: "challenge-1", channel: "whatsapp", expiresAt: "2026-08-14T18:05:00Z" };
      },
      async verifyOtp() {
        return { verified: true };
      },
    },
    catalog: {
      async getProduct(id) {
        return id === product.id ? product : null;
      },
      async isProductAvailable() {
        return true;
      },
    },
    shop: {
      async getShopState() {
        return { scheduledOpen: true, orderCutoffMinutes: 30 };
      },
    },
    slots: {
      async getSlotCapacity() {
        return { capacity: 6, acceptedOrderCount: 2 };
      },
    },
    orders: {
      async create(input) {
        createdInput = input;
        return {
          id: "order-1",
          locationId: input.locationId,
          source: input.source,
          fulfillmentType: input.fulfillmentType,
          state: input.state,
          customerFirstName: input.customerFirstName,
          mobile: input.mobile,
          comment: input.comment,
          requestedPickupAt: input.requestedPickupAt,
          submittedAt: input.submittedAt,
          totalCents: input.totalCents,
        } satisfies Order;
      },
    },
    statusUrlFor: (order) => `https://preview.invalid/status/${order.id}`,
    ...overrides,
  };
  return { dependencies, getCreatedInput: () => createdInput };
}

async function expectCode(promise: Promise<unknown>, code: CheckoutError["code"]) {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal(error instanceof CheckoutError, true);
    assert.equal((error as CheckoutError).code, code);
    return true;
  });
}

test("verified pickup order is created pending staff acceptance", async () => {
  const setup = deps();
  const order = await submitVerifiedPickupOrder(
    baseRequest,
    setup.dependencies,
    "2026-08-14T18:00:00.000Z",
  );
  assert.equal(order.state, "waiting_for_acceptance");
  assert.equal(order.totalCents, 1900);
  assert.equal(setup.getCreatedInput()?.items[0]?.unitPriceCentsSnapshot, 950);
});

test("client-provided price is ignored", async () => {
  const setup = deps();
  await submitVerifiedPickupOrder(baseRequest, setup.dependencies, "2026-08-14T18:00:00.000Z");
  assert.equal(setup.getCreatedInput()?.totalCents, 1900);
  assert.notEqual(setup.getCreatedInput()?.totalCents, 2);
});

test("invalid OTP prevents order creation", async () => {
  const setup = deps({
    otp: {
      async sendOtp() { return { challengeId: "c", channel: "whatsapp", expiresAt: "later" }; },
      async verifyOtp() { return { verified: false }; },
    },
  });
  await expectCode(
    submitVerifiedPickupOrder(baseRequest, setup.dependencies, "2026-08-14T18:00:00.000Z"),
    "OTP_FAILED",
  );
  assert.equal(setup.getCreatedInput(), undefined);
});

test("closed or paused shop blocks submission after OTP", async () => {
  const setup = deps({
    shop: { async getShopState() { return { scheduledOpen: true, override: "pause", orderCutoffMinutes: 30 }; } },
  });
  await expectCode(
    submitVerifiedPickupOrder(baseRequest, setup.dependencies, "2026-08-14T18:00:00.000Z"),
    "SHOP_NOT_ACCEPTING",
  );
});

test("full preorder slot is rejected", async () => {
  const setup = deps({
    slots: { async getSlotCapacity() { return { capacity: 6, acceptedOrderCount: 6 }; } },
  });
  await expectCode(
    submitVerifiedPickupOrder(
      { ...baseRequest, requestedPickupAt: "2026-08-14T19:15:00.000Z" },
      setup.dependencies,
      "2026-08-14T18:00:00.000Z",
    ),
    "SLOT_FULL",
  );
});

test("sold-out modifier is rejected server-side", async () => {
  const setup = deps();
  await expectCode(
    submitVerifiedPickupOrder(
      {
        ...baseRequest,
        cart: [{
          productId: "doner",
          quantity: 1,
          selections: [{ groupId: "sauce", optionIds: ["hot"] }],
        }],
      },
      setup.dependencies,
      "2026-08-14T18:00:00.000Z",
    ),
    "INVALID_CONFIGURATION",
  );
});

test("notification transport failure does not invalidate persisted order", async () => {
  const setup = deps({
    notifications: {
      async sendOrderNotification() { throw new Error("provider down"); },
    },
  });
  const order = await submitVerifiedPickupOrder(baseRequest, setup.dependencies, "2026-08-14T18:00:00.000Z");
  assert.equal(order.id, "order-1");
});
