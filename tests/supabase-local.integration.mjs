import assert from "node:assert/strict";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function createLocalAuthUser(email, password) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    apiKey: serviceRoleKey,
    bearerToken: serviceRoleKey,
    body: { email, password, email_confirm: true },
  });
  assert.equal(result.response.ok, true, `create user ${email}: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function signIn(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    apiKey: anonKey,
    body: { email, password },
  });
  assert.equal(result.response.ok, true, `sign in ${email}: ${JSON.stringify(result.data)}`);
  assert.ok(result.data.access_token);
  return result.data.access_token;
}

async function grantRole(userId, role) {
  const result = await request("/rest/v1/user_roles", {
    method: "POST",
    apiKey: serviceRoleKey,
    bearerToken: serviceRoleKey,
    body: { user_id: userId, role },
  });
  assert.equal(result.response.ok, true, `grant ${role}: ${JSON.stringify(result.data)}`);
}

const locationId = "00000000-0000-4000-8000-000000000001";
const productId = "00000000-0000-4000-8000-000000000100";
const groupId = "00000000-0000-4000-8000-000000000200";
const optionId = "00000000-0000-4000-8000-000000000202";
const nowIso = new Date().toISOString();

// First auth account bootstraps the sole admin. Second account stays role-less until
// service-role test setup grants only staff, proving staff RPC authorization separately.
await createLocalAuthUser("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const staffUser = await createLocalAuthUser("kds-staff@mcello.local", "LocalOnly-Staff-2026!");
await grantRole(staffUser.id, "staff");
const staffToken = await signIn("kds-staff@mcello.local", "LocalOnly-Staff-2026!");

const productResult = await rpc(
  "server_get_checkout_product",
  { _product_id: productId, _at: nowIso },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(productResult.response.ok, true, JSON.stringify(productResult.data));
assert.equal(productResult.data.name, "DEV – Konfigurierbares Testgericht");
assert.equal(productResult.data.basePriceCents, 800);
assert.equal(productResult.data.modifierGroups[0].options.length, 2);

const availabilityResult = await rpc(
  "server_is_product_available",
  { _product_id: productId, _at: nowIso },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(availabilityResult.response.ok, true, JSON.stringify(availabilityResult.data));
assert.equal(availabilityResult.data, true);

const shopResult = await rpc(
  "server_get_shop_state",
  { _location_id: locationId, _at: nowIso },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(shopResult.response.ok, true, JSON.stringify(shopResult.data));
assert.equal(shopResult.data.override, "force_open");
assert.equal(shopResult.data.orderCutoffMinutes, 30);

const slotResult = await rpc(
  "server_get_slot_capacity",
  { _location_id: locationId, _pickup_at: new Date(Date.now() + 60 * 60_000).toISOString() },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(slotResult.response.ok, true, JSON.stringify(slotResult.data));
assert.equal(slotResult.data.capacity, 6);
assert.equal(slotResult.data.acceptedOrderCount, 0);

function makePayload(firstName) {
  return {
    locationId,
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: firstName,
    mobile: "+491700000000",
    requestedPickupAt: null,
    totalCents: 900,
    submittedAt: new Date().toISOString(),
    items: [{
      productId,
      productNameSnapshot: "DEV – Konfigurierbares Testgericht",
      quantity: 1,
      unitPriceCentsSnapshot: 900,
      lineTotalCents: 900,
      selections: [{ groupId, optionIds: [optionId] }],
    }],
  };
}

async function createOrder(firstName) {
  const result = await rpc(
    "server_create_verified_order",
    { _payload: makePayload(firstName) },
    serviceRoleKey,
    serviceRoleKey,
  );
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

async function publicStatus(publicToken) {
  const result = await rpc("get_public_order_status", { _public_token: publicToken });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  assert.equal(Object.hasOwn(result.data, "mobile"), false);
  return result.data;
}

// Full KDS lifecycle: received -> accepted/preparing -> ready -> completed.
const kitchenOrder = await createOrder("Kitchen Flow");
assert.equal(kitchenOrder.state, "waiting_for_acceptance");
assert.match(kitchenOrder.public_token, /^[0-9a-f-]{36}$/i);
let status = await publicStatus(kitchenOrder.public_token);
assert.equal(status.state, "waiting_for_acceptance");
assert.equal(status.items[0].options[0].option, "DEV Extra");

const acceptedPickupAt = new Date(Date.now() + 20 * 60_000).toISOString();
const accepted = await rpc(
  "staff_accept_order",
  { _order_id: kitchenOrder.id, _accepted_pickup_at: acceptedPickupAt },
  anonKey,
  staffToken,
);
assert.equal(accepted.response.ok, true, JSON.stringify(accepted.data));
const acceptedRow = Array.isArray(accepted.data) ? accepted.data[0] : accepted.data;
assert.equal(acceptedRow.state, "preparing");
status = await publicStatus(kitchenOrder.public_token);
assert.equal(status.state, "preparing");
assert.ok(status.acceptedPickupAt);

const ready = await rpc(
  "staff_mark_order_ready",
  { _order_id: kitchenOrder.id },
  anonKey,
  staffToken,
);
assert.equal(ready.response.ok, true, JSON.stringify(ready.data));
status = await publicStatus(kitchenOrder.public_token);
assert.equal(status.state, "ready");

const cancelAfterAcceptance = await rpc(
  "customer_cancel_pending_order",
  { _public_token: kitchenOrder.public_token },
);
assert.equal(cancelAfterAcceptance.response.ok, false);

const completed = await rpc(
  "staff_complete_order",
  { _order_id: kitchenOrder.id },
  anonKey,
  staffToken,
);
assert.equal(completed.response.ok, true, JSON.stringify(completed.data));
status = await publicStatus(kitchenOrder.public_token);
assert.equal(status.state, "completed");

// Separate customer flow proves token cancellation while still awaiting acceptance.
const cancellableOrder = await createOrder("Cancel Flow");
const cancelResult = await rpc(
  "customer_cancel_pending_order",
  { _public_token: cancellableOrder.public_token },
);
assert.equal(cancelResult.response.ok, true, JSON.stringify(cancelResult.data));
assert.equal(cancelResult.data.state, "cancelled");
const cancelAgain = await rpc(
  "customer_cancel_pending_order",
  { _public_token: cancellableOrder.public_token },
);
assert.equal(cancelAgain.response.ok, false);

console.log("Local Supabase vertical slice passed:", {
  kitchenOrderNumber: status.orderNumber,
  kitchenFinalState: status.state,
  customerCancelState: cancelResult.data.state,
  staffRole: "staff-only",
});
