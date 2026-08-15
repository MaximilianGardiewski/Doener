import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const model = await readFile(new URL("../packages/ordering/src/model.ts", import.meta.url), "utf8");
const checkout = await readFile(new URL("../packages/ordering/src/checkout.ts", import.meta.url), "utf8");
const fulfillment = await readFile(new URL("../packages/ordering/src/fulfillment.ts", import.meta.url), "utf8");
const capacity = await readFile(new URL("../packages/ordering/src/capacity.ts", import.meta.url), "utf8");
const menuModel = await readFile(new URL("../packages/menu-engine/src/model.ts", import.meta.url), "utf8");
const publicApp = await readFile(new URL("../apps/mcello/public/app.js", import.meta.url), "utf8");
const coreMigration = await readFile(
  new URL("../supabase/migrations/20260814190100_platform_core_part1.sql", import.meta.url),
  "utf8",
);
const effortMigration = await readFile(
  new URL("../supabase/migrations/20260815023500_effort_weight_snapshot.sql", import.meta.url),
  "utf8",
);
const contractMigration = await readFile(
  new URL("../supabase/migrations/20260815023600_checkout_effort_contract.sql", import.meta.url),
  "utf8",
);
const deliveryMigration = await readFile(
  new URL("../supabase/migrations/20260815024500_delivery_boundary.sql", import.meta.url),
  "utf8",
);

test("D027 keeps reusable web/counter/table source contract while Mcello checkout stays web-only", () => {
  assert.match(model, /export type OrderSource = "web" \| "counter" \| "table"/);
  assert.match(coreMigration, /create type public\.order_source as enum \('web', 'counter', 'table'\)/i);
  assert.match(checkout, /source: "web";/);
  assert.doesNotMatch(checkout, /request\.source/);
  assert.match(contractMigration, /counter\/table remain future/i);
  assert.match(contractMigration, /prevent_order_source_reassignment/i);
  assert.match(contractMigration, /before update of source on public\.orders/i);
});

test("D006 prepares delivery zones while Mcello V1 remains pickup-only", () => {
  assert.match(model, /export type FulfillmentType = "pickup" \| "delivery"/);
  assert.match(fulfillment, /interface DeliveryZoneResolver/);
  assert.match(fulfillment, /kind: "postal_code"/);
  assert.match(fulfillment, /kind: "radius"/);
  assert.match(fulfillment, /class PickupOnlyFulfillmentPolicy/);
  assert.match(checkout, /requestedType: request\.fulfillmentType/);
  assert.match(deliveryMigration, /orders_v1_pickup_only/i);
  assert.match(deliveryMigration, /check \(fulfillment = 'pickup'\)/i);
  assert.match(deliveryMigration, /prevent_fulfillment_reassignment/i);
  assert.doesNotMatch(publicApp, /fulfillmentType/);
});

test("D040 exposes optional effort metadata but leaves V1 admission count-based", () => {
  assert.match(menuModel, /effortWeight\?: number/);
  assert.match(capacity, /effortWeight\?: number/);
  assert.match(capacity, /acceptedOrderCount < input\.capacity/);
  assert.match(checkout, /effortWeightSnapshot: product\.effortWeight/);
  assert.match(effortMigration, /effort_weight_snapshot numeric\(8,2\)/i);
  assert.match(effortMigration, /before insert on public\.order_items/i);
  assert.match(contractMigration, /'effortWeight', p\.effort_weight/);
});

test("D040 extension preserves the existing structured allergen checkout contract", () => {
  assert.match(contractMigration, /'allergens', coalesce\(\(/i);
  assert.match(contractMigration, /from public\.product_allergens pa/i);
  assert.match(contractMigration, /from public\.modifier_option_allergens moa/i);
});

test("database owns and freezes the persisted effort snapshot", () => {
  assert.match(effortMigration, /select effort_weight into new\.effort_weight_snapshot/i);
  assert.match(effortMigration, /from public\.menu_products/i);
  assert.match(effortMigration, /check \(effort_weight is null or effort_weight > 0\)/i);
  assert.match(effortMigration, /check \(effort_weight_snapshot is null or effort_weight_snapshot > 0\)/i);
  assert.match(effortMigration, /prevent_effort_snapshot_reassignment/i);
  assert.match(effortMigration, /before update of effort_weight_snapshot on public\.order_items/i);
});
