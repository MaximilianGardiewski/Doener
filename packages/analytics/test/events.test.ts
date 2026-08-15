import test from "node:test";
import assert from "node:assert/strict";
import { parseOrderAnalyticsContext, parsePublicAnalyticsEvent } from "../src/events.ts";

const ids = {
  event: "10000000-0000-4000-8000-000000000001",
  session: "10000000-0000-4000-8000-000000000002",
  location: "10000000-0000-4000-8000-000000000003",
  source: "10000000-0000-4000-8000-000000000004",
  product: "10000000-0000-4000-8000-000000000005",
};

const base = {
  clientEventId: ids.event,
  anonymousSessionId: ids.session,
  locationId: ids.location,
  occurredAt: "2026-08-15T04:00:00.000Z",
};

test("accepts a pseudonymous recommendation event with structured attribution", () => {
  const event = parsePublicAnalyticsEvent({
    ...base,
    eventName: "recommendation_select",
    productId: ids.product,
    sourceProductId: ids.source,
    surface: "cart",
  });
  assert.equal(event.eventName, "recommendation_select");
  assert.equal(event.productId, ids.product);
  assert.equal(event.surface, "cart");
});

test("rejects server-only order events from the public contract", () => {
  assert.throws(() => parsePublicAnalyticsEvent({ ...base, eventName: "order_submitted" }), /not public/);
});

test("recommendation events require source and surface attribution", () => {
  assert.throws(() => parsePublicAnalyticsEvent({
    ...base,
    eventName: "recommendation_impression",
    productId: ids.product,
  }), /sourceProductId and surface/);
});

test("non-recommendation events cannot smuggle attribution fields", () => {
  assert.throws(() => parsePublicAnalyticsEvent({
    ...base,
    eventName: "cart_add",
    productId: ids.product,
    sourceProductId: ids.source,
  }), /cannot carry recommendation attribution/);
});

test("order analytics context contains identifiers and time only", () => {
  assert.deepEqual(parseOrderAnalyticsContext({
    clientEventId: ids.event,
    anonymousSessionId: ids.session,
    occurredAt: "2026-08-15T04:00:00Z",
    mobile: "+491234567",
  }), {
    clientEventId: ids.event,
    anonymousSessionId: ids.session,
    occurredAt: "2026-08-15T04:00:00.000Z",
  });
});
