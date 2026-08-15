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

const payload = {
  locationId,
  source: "web",
  fulfillmentType: "pickup",
  state: "waiting_for_acceptance",
  customerFirstName: "Payment Boundary",
  mobile: "+491700000099",
  requestedPickupAt: null,
  totalCents: 900,
  submittedAt: new Date().toISOString(),
  payment: {
    mode: "pay_on_site",
    method: "cash_or_card",
    status: "due_on_site",
    currency: "EUR",
    amountCents: 900,
  },
  items: [{
    productId,
    productNameSnapshot: "DEV – Konfigurierbares Testgericht",
    quantity: 1,
    unitPriceCentsSnapshot: 900,
    lineTotalCents: 900,
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
assert.equal(created.payment_mode, "pay_on_site");
assert.equal(created.payment_method, "cash_or_card");
assert.equal(created.payment_status, "due_on_site");
assert.equal(created.payment_currency, "EUR");
assert.equal(created.payment_provider_reference, null);

const statusResult = await rpc("get_public_order_status", { _public_token: created.public_token });
assert.equal(statusResult.response.ok, true, JSON.stringify(statusResult.data));
assert.deepEqual(statusResult.data.payment, {
  mode: "pay_on_site",
  method: "cash_or_card",
  status: "due_on_site",
  currency: "EUR",
});
assert.equal(Object.hasOwn(statusResult.data.payment, "providerReference"), false);

const onlineMutation = await request(`/rest/v1/orders?id=eq.${created.id}`, {
  method: "PATCH",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: {
    payment_mode: "online",
    payment_method: "provider",
    payment_status: "pending",
    payment_provider_reference: "tampered-provider-reference",
  },
});
assert.equal(onlineMutation.response.ok, false, "service_role must not bypass the V1 online-payment constraint");

const providerReferenceMutation = await request(`/rest/v1/orders?id=eq.${created.id}`, {
  method: "PATCH",
  apiKey: serviceRoleKey,
  bearerToken: serviceRoleKey,
  body: { payment_provider_reference: "tampered-provider-reference" },
});
assert.equal(providerReferenceMutation.response.ok, false, "provider reference must remain null in pay-on-site V1");

const persisted = await request(
  `/rest/v1/orders?id=eq.${created.id}&select=payment_mode,payment_method,payment_status,payment_currency,payment_provider_reference`,
  { apiKey: serviceRoleKey, bearerToken: serviceRoleKey },
);
assert.equal(persisted.response.ok, true, JSON.stringify(persisted.data));
assert.deepEqual(persisted.data, [{
  payment_mode: "pay_on_site",
  payment_method: "cash_or_card",
  payment_status: "due_on_site",
  payment_currency: "EUR",
  payment_provider_reference: null,
}]);
