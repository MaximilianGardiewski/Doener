import test from "node:test";
import assert from "node:assert/strict";
import {
  FulfillmentBoundaryError,
  PickupOnlyFulfillmentPolicy,
  type DeliveryZoneResolver,
  type DeliveryZoneRule,
} from "../src/fulfillment.ts";

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
