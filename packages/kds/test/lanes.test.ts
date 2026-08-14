import test from "node:test";
import assert from "node:assert/strict";
import { laneForState, shouldAlarm } from "../src/lanes.ts";
import type { Order } from "../../ordering/src/model.ts";

test("KDS lane mapping matches the agreed flow", () => {
  assert.equal(laneForState("waiting_for_acceptance"), "incoming");
  assert.equal(laneForState("scheduled"), "planned");
  assert.equal(laneForState("preparing"), "preparing");
  assert.equal(laneForState("ready"), "ready");
  assert.equal(laneForState("completed"), "archive");
});

test("only unhandled incoming order alarms", () => {
  const order = {
    id: "o1",
    locationId: "mcello",
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    totalCents: 1000,
  } satisfies Order;
  assert.equal(shouldAlarm(order), true);
  assert.equal(shouldAlarm({ ...order, state: "preparing" }), false);
});
