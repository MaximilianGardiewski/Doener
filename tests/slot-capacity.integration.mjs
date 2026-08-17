import assert from "node:assert/strict";

function envValue(name) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

const baseUrl = envValue("SUPABASE_URL")?.replace(/\/$/, "");
const anonKey = envValue("SUPABASE_ANON_KEY");
const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
if (!baseUrl || !anonKey || !serviceRoleKey) throw new Error("Local Supabase env is missing");

const locationId = "00000000-0000-4000-8000-000000000001";
const productId = "00000000-0000-4000-8000-000000000100";
const groupId = "00000000-0000-4000-8000-000000000200";
const optionId = "00000000-0000-4000-8000-000000000202";
const slotMs = 15 * 60_000;
const pickupAt = new Date(Math.ceil((Date.now() + 60 * 60_000) / slotMs) * slotMs).toISOString();

async function request(path, { method = "GET", apiKey = serviceRoleKey, bearer = serviceRoleKey, body } = {}) {
  const headers = { apikey: apiKey, accept: "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers["content-type"] = "application/json";
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

async function rpc(name, args, apiKey = serviceRoleKey, bearer = serviceRoleKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", apiKey, bearer, body: args });
}

const patch = await request(`/rest/v1/ordering_settings?location_id=eq.${locationId}`, {
  method: "PATCH",
  body: { slot_capacity: 1 },
});
assert.equal(patch.response.ok, true, JSON.stringify(patch.data));

function payload(firstName) {
  return {
    locationId,
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: firstName,
    mobile: "+491700000001",
    requestedPickupAt: pickupAt,
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

let winningOrder;
try {
  const results = await Promise.all([
    rpc("server_create_verified_order", { _payload: payload("Slot Racer A") }),
    rpc("server_create_verified_order", { _payload: payload("Slot Racer B") }),
  ]);

  const successes = results.filter((result) => result.response.ok);
  const failures = results.filter((result) => !result.response.ok);
  assert.equal(successes.length, 1, "exactly one concurrent request may claim the final slot");
  assert.equal(failures.length, 1, "exactly one concurrent request must lose the slot race");
  assert.match(JSON.stringify(failures[0].data), /pickup slot capacity exhausted/i);

  winningOrder = Array.isArray(successes[0].data) ? successes[0].data[0] : successes[0].data;
  assert.equal(
    Date.parse(winningOrder.requested_pickup_at),
    Date.parse(pickupAt),
    "database may serialize timestamptz differently, but the pickup instant must match exactly",
  );

  const slotState = await rpc("server_get_slot_capacity", {
    _location_id: locationId,
    _pickup_at: pickupAt,
  });
  assert.equal(slotState.response.ok, true, JSON.stringify(slotState.data));
  assert.equal(slotState.data.capacity, 1);
  assert.equal(slotState.data.acceptedOrderCount, 1);
} finally {
  if (winningOrder?.public_token) {
    await rpc(
      "customer_cancel_pending_order",
      { _public_token: winningOrder.public_token },
      anonKey,
      null,
    );
  }
  await request(`/rest/v1/ordering_settings?location_id=eq.${locationId}`, {
    method: "PATCH",
    body: { slot_capacity: 6 },
  });
}

console.log("Atomic concurrent slot capacity guard passed:", { pickupAt, capacity: 1 });
