import test from "node:test";
import assert from "node:assert/strict";
import { LocationScopeError, SingleLocationContext } from "../src/location-context.ts";

const configured = "00000000-0000-4000-8000-000000000001";

test("single-location context supplies the configured boundary", () => {
  const context = new SingleLocationContext(configured);
  assert.equal(context.resolve(), configured);
  assert.equal(context.resolve(configured), configured);
});

test("single-location context rejects a client-selected foreign location", () => {
  const context = new SingleLocationContext(configured);
  assert.throws(
    () => context.resolve("00000000-0000-4000-8000-000000000002"),
    (error: unknown) => error instanceof LocationScopeError && error.code === "LOCATION_SCOPE_MISMATCH",
  );
});

test("invalid configured location fails at application startup", () => {
  assert.throws(() => new SingleLocationContext("mcello"), /must be a UUID/);
});
