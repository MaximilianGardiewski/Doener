import assert from "node:assert/strict";

function envValue(name) {
  const value = process.env[name];
  return value?.replace(/^['"]|['"]$/g, "");
}

const baseUrl = envValue("SUPABASE_URL")?.replace(/\/$/, "");
const anonKey = envValue("SUPABASE_ANON_KEY");
const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
if (!baseUrl || !anonKey || !serviceRoleKey) throw new Error("Local Supabase env is missing");

const locationId = "00000000-0000-4000-8000-000000000001";

async function request(path, { apiKey = anonKey, bearer = apiKey, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${bearer}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

async function serviceRpc(payload, orderId = null) {
  return request("/rest/v1/rpc/server_record_analytics_event", {
    apiKey: serviceRoleKey,
    bearer: serviceRoleKey,
    method: "POST",
    body: { _payload: payload, _order_id: orderId },
  });
}

const productsResult = await request(
  `/rest/v1/menu_products?select=id&location_id=eq.${locationId}&status=eq.published&limit=2`,
  { apiKey: serviceRoleKey, bearer: serviceRoleKey },
);
assert.equal(productsResult.response.ok, true, JSON.stringify(productsResult.data));
assert.equal(productsResult.data.length >= 2, true, "expected two published products from provisional import");

const [sourceProduct, suggestedProduct] = productsResult.data;
const sessionId = crypto.randomUUID();
const menuEventId = crypto.randomUUID();
const now = new Date().toISOString();
const menuEvent = {
  clientEventId: menuEventId,
  anonymousSessionId: sessionId,
  locationId,
  eventName: "menu_view",
  occurredAt: now,
};

const anonTable = await request("/rest/v1/analytics_events?select=id&limit=1");
assert.equal(!anonTable.response.ok || anonTable.data.length === 0, true, "anonymous table reads must expose no events");

const anonRpc = await request("/rest/v1/rpc/server_record_analytics_event", {
  method: "POST",
  body: { _payload: menuEvent, _order_id: null },
});
assert.equal(anonRpc.response.ok, false, "anonymous clients must not execute the recording RPC");

const first = await serviceRpc(menuEvent);
assert.equal(first.response.ok, true, JSON.stringify(first.data));
const duplicate = await serviceRpc(menuEvent);
assert.equal(duplicate.response.ok, true, JSON.stringify(duplicate.data));
assert.equal(duplicate.data, first.data, "client event id must be idempotent");

const storedMenu = await request(
  `/rest/v1/analytics_events?select=id,event_type,anonymous_session_id&client_event_id=eq.${menuEventId}`,
  { apiKey: serviceRoleKey, bearer: serviceRoleKey },
);
assert.equal(storedMenu.response.ok, true, JSON.stringify(storedMenu.data));
assert.equal(storedMenu.data.length, 1);
assert.equal(storedMenu.data[0].event_type, "menu_view");
assert.equal(storedMenu.data[0].anonymous_session_id, sessionId);

const recommendation = await serviceRpc({
  clientEventId: crypto.randomUUID(),
  anonymousSessionId: sessionId,
  locationId,
  eventName: "recommendation_select",
  occurredAt: new Date().toISOString(),
  productId: suggestedProduct.id,
  sourceProductId: sourceProduct.id,
  surface: "cart",
});
assert.equal(recommendation.response.ok, true, JSON.stringify(recommendation.data));

const piiAttempt = await serviceRpc({ ...menuEvent, clientEventId: crypto.randomUUID(), mobile: "+491234567" });
assert.equal(piiAttempt.response.ok, false, "unsupported/PII fields must be rejected at the database boundary");

const orders = await request(
  `/rest/v1/orders?select=id&location_id=eq.${locationId}&limit=1`,
  { apiKey: serviceRoleKey, bearer: serviceRoleKey },
);
assert.equal(orders.response.ok, true, JSON.stringify(orders.data));
assert.equal(orders.data.length, 1, "earlier order-flow integration should have created an order");

const submitted = await serviceRpc({
  clientEventId: crypto.randomUUID(),
  anonymousSessionId: sessionId,
  locationId,
  eventName: "order_submitted",
  occurredAt: new Date().toISOString(),
}, orders.data[0].id);
assert.equal(submitted.response.ok, true, JSON.stringify(submitted.data));

console.log("Analytics event integration checks passed");
