import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptOrder,
  activateScheduledOrder,
  customerCancel,
  delayOrder,
  hasAcceptanceTimedOut,
  isCustomerEditable,
  markReady,
  completeOrder,
  requestVerification,
  verifyOrder,
  type Order,
} from "../src/model.ts";
import { hasSlotCapacity } from "../src/capacity.ts";

function draft(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    locationId: "mcello",
    source: "web",
    fulfillmentType: "pickup",
    state: "draft",
    totalCents: 1850,
    ...overrides,
  };
}

test("order becomes binding only after staff acceptance", () => {
  const verification = requestVerification(draft(), "2026-08-14T16:00:00.000Z");
  const pending = verifyOrder(verification.order, "2026-08-14T16:01:00.000Z");
  assert.equal(pending.order.state, "waiting_for_acceptance");
  assert.equal(isCustomerEditable(pending.order), true);

  const accepted = acceptOrder(
    pending.order,
    "2026-08-14T16:02:00.000Z",
    "2026-08-14T16:22:00.000Z",
  );
  assert.equal(accepted.order.state, "preparing");
  assert.equal(isCustomerEditable(accepted.order), false);
});

test("customer can cancel only pre-accept", () => {
  const pending = verifyOrder(
    requestVerification(draft(), "2026-08-14T16:00:00.000Z").order,
    "2026-08-14T16:01:00.000Z",
  ).order;
  assert.equal(customerCancel(pending, "2026-08-14T16:02:00.000Z").order.state, "cancelled");
});

test("future accepted order is scheduled then activated", () => {
  const pending = verifyOrder(
    requestVerification(draft({ requestedPickupAt: "2026-08-14T18:00:00.000Z" }), "2026-08-14T16:00:00.000Z").order,
    "2026-08-14T16:01:00.000Z",
  ).order;
  const accepted = acceptOrder(pending, "2026-08-14T16:02:00.000Z", "2026-08-14T18:00:00.000Z").order;
  assert.equal(accepted.state, "scheduled");
  assert.equal(activateScheduledOrder(accepted, "2026-08-14T17:35:00.000Z").order.state, "preparing");
});

test("delay changes accepted pickup ETA", () => {
  const preparing = draft({
    state: "preparing",
    acceptedPickupAt: "2026-08-14T17:00:00.000Z",
  });
  const delayed = delayOrder(preparing, "2026-08-14T16:45:00.000Z", 10);
  assert.equal(delayed.order.acceptedPickupAt, "2026-08-14T17:10:00.000Z");
});

test("preparing -> ready -> completed", () => {
  const ready = markReady(draft({ state: "preparing" }), "2026-08-14T17:00:00.000Z").order;
  assert.equal(ready.state, "ready");
  assert.equal(completeOrder(ready, "2026-08-14T17:05:00.000Z").order.state, "completed");
});

test("default five minute acceptance timeout is detectable", () => {
  const pending = draft({
    state: "waiting_for_acceptance",
    submittedAt: "2026-08-14T16:00:00.000Z",
  });
  assert.equal(hasAcceptanceTimedOut(pending, "2026-08-14T16:04:59.000Z"), false);
  assert.equal(hasAcceptanceTimedOut(pending, "2026-08-14T16:05:00.000Z"), true);
});

test("slot capacity uses V1 count model", () => {
  assert.equal(hasSlotCapacity({ capacity: 6, acceptedOrderCount: 5 }), true);
  assert.equal(hasSlotCapacity({ capacity: 6, acceptedOrderCount: 6 }), false);
});
