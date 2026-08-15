import assert from "node:assert/strict";

function envValue(name) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

const url = envValue("SUPABASE_URL");
const anonKey = envValue("SUPABASE_ANON_KEY");
const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required");
}
const baseUrl = url.replace(/\/$/, "");

async function request(path, { method = "GET", apiKey = anonKey, bearerToken, body } = {}) {
  const headers = { apikey: apiKey, accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { response, data };
}

async function rpc(name, args, apiKey = anonKey, bearerToken) {
  return request(`/rest/v1/rpc/${name}`, {
    method: "POST",
    apiKey,
    bearerToken,
    body: args,
  });
}

const locationId = "00000000-0000-4000-8000-000000000001";
const productId = "00000000-0000-4000-8000-000000000100";
const groupId = "00000000-0000-4000-8000-000000000200";
const optionId = "00000000-0000-4000-8000-000000000202";

const setEffort = await request(`/rest/v1/menu_products?id=eq.${productId}`, {
  method: "PATCH",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: { effort_weight: 1.75 },
});
assert.equal(setEffort.response.ok, true, JSON.stringify(setEffort.data));

const productResult = await rpc(
  "server_get_checkout_product",
  { _product_id: productId, _at: new Date().toISOString() },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(productResult.response.ok, true, JSON.stringify(productResult.data));
assert.equal(Number(productResult.data.effortWeight), 1.75);

const payload = {
  locationId,
  source: "table",
  fulfillmentType: "delivery",
  state: "waiting_for_acceptance",
  customerFirstName: "Prepared Boundaries",
  mobile: "+491700000098",
  requestedPickupAt: null,
  totalCents: 900,
  submittedAt: new Date().toISOString(),
  items: [{
    productId,
    productNameSnapshot: "DEV – Konfigurierbares Testgericht",
    quantity: 1,
    unitPriceCentsSnapshot: 900,
    lineTotalCents: 900,
    effortWeightSnapshot: 99,
    selections: [{ groupId, optionIds: [optionId] }],
  }],
};

const createdResult = await rpc(
  "server_create_verified_order",
  { _payload: payload },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(createdResult.response.ok, true, JSON.stringify(createdResult.data));
const created = Array.isArray(createdResult.data) ? createdResult.data[0] : createdResult.data;

// D027: the reusable enum knows future origins, but current checkout remains web-only.
assert.equal(created.source, "web");

const sourceMutation = await request(`/rest/v1/orders?id=eq.${created.id}`, {
  method: "PATCH",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: { source: "counter" },
});
assert.equal(sourceMutation.response.ok, false, "order origin must stay immutable even for service-role writes");

// D006: the reusable enum knows delivery, but current Mcello persistence remains pickup-only.
assert.equal(created.fulfillment, "pickup");

const fulfillmentMutation = await request(`/rest/v1/orders?id=eq.${created.id}`, {
  method: "PATCH",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: { fulfillment: "delivery" },
});
assert.equal(fulfillmentMutation.response.ok, false, "order fulfillment must stay pickup and immutable in V1");

const directDeliveryInsert = await request("/rest/v1/orders", {
  method: "POST",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: {
    location_id: locationId,
    source: "web",
    fulfillment: "delivery",
    state: "waiting_for_acceptance",
    customer_first_name: "Direct Delivery",
    mobile: "+491700000097",
    total_cents: 0,
  },
});
assert.equal(directDeliveryInsert.response.ok, false, "database constraint must reject direct V1 delivery inserts");

const itemResult = await request(
  `/rest/v1/order_items?order_id=eq.${created.id}&select=id,effort_weight_snapshot`,
  { apiKey: serviceRoleKey, bearerToken: serviceRoleKey },
);
assert.equal(itemResult.response.ok, true, JSON.stringify(itemResult.data));
assert.equal(Number(itemResult.data[0].effort_weight_snapshot), 1.75);

const snapshotMutation = await request(`/rest/v1/order_items?id=eq.${itemResult.data[0].id}`, {
  method: "PATCH",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: { effort_weight_snapshot: 7.25 },
});
assert.equal(snapshotMutation.response.ok, false, "persisted effort snapshot must be immutable");

// D040: snapshot is database-owned and survives later product-weight changes.
const changeEffort = await request(`/rest/v1/menu_products?id=eq.${productId}`, {
  method: "PATCH",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: { effort_weight: 3.5 },
});
assert.equal(changeEffort.response.ok, true, JSON.stringify(changeEffort.data));

const snapshotAfterChange = await request(
  `/rest/v1/order_items?order_id=eq.${created.id}&select=effort_weight_snapshot`,
  { apiKey: serviceRoleKey, bearerToken: serviceRoleKey },
);
assert.equal(snapshotAfterChange.response.ok, true, JSON.stringify(snapshotAfterChange.data));
assert.equal(Number(snapshotAfterChange.data[0].effort_weight_snapshot), 1.75);

const invalidEffort = await request(`/rest/v1/menu_products?id=eq.${productId}`, {
  method: "PATCH",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: { effort_weight: 0 },
});
assert.equal(invalidEffort.response.ok, false, "zero effort weight must fail the positive metadata constraint");

const cleanup = await request(`/rest/v1/menu_products?id=eq.${productId}`, {
  method: "PATCH",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: { effort_weight: null },
});
assert.equal(cleanup.response.ok, true, JSON.stringify(cleanup.data));
