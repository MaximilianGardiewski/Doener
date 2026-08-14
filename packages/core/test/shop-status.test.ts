import test from "node:test";
import assert from "node:assert/strict";
import { resolveShopCapabilities } from "../src/shop-status.ts";

test("closed shop still allows browse/configure/cart but blocks submit", () => {
  const state = resolveShopCapabilities({
    scheduledOpen: false,
    orderCutoffMinutes: 30,
  });
  assert.equal(state.status, "closed");
  assert.equal(state.canBrowse, true);
  assert.equal(state.canConfigure, true);
  assert.equal(state.canBuildCart, true);
  assert.equal(state.canSubmitOrder, false);
});

test("pause overrides open schedule", () => {
  const state = resolveShopCapabilities({
    scheduledOpen: true,
    override: "pause",
    orderCutoffMinutes: 30,
  });
  assert.equal(state.status, "paused");
  assert.equal(state.canSubmitOrder, false);
});

test("order cutoff blocks new submissions before close", () => {
  const state = resolveShopCapabilities({
    scheduledOpen: true,
    minutesUntilScheduledClose: 20,
    orderCutoffMinutes: 30,
  });
  assert.equal(state.status, "order_cutoff");
  assert.equal(state.canSubmitOrder, false);
});
