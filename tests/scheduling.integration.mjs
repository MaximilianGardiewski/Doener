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

async function request(path, { method = "GET", apiKey = anonKey, bearer, body } = {}) {
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

async function rpc(name, args, apiKey = anonKey, bearer) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", apiKey, bearer, body: args });
}

async function serviceRpc(name, args) {
  return rpc(name, args, serviceRoleKey, serviceRoleKey);
}

async function servicePatch(table, query, body) {
  const result = await request(`/rest/v1/${table}?${query}`, {
    method: "PATCH",
    apiKey: serviceRoleKey,
    bearer: serviceRoleKey,
    body,
  });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
}

async function signInStaff() {
  const login = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    apiKey: anonKey,
    body: {
      email: "kds-staff@mcello.local",
      password: "LocalOnly-Staff-2026!",
    },
  });
  assert.equal(login.response.ok, true, JSON.stringify(login.data));
  return login.data.access_token;
}

function payload(firstName, requestedPickupAt = null) {
  return {
    locationId,
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: firstName,
    mobile: "+491700000002",
    requestedPickupAt,
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

async function createOrder(firstName, requestedPickupAt = null) {
  const result = await serviceRpc("server_create_verified_order", {
    _payload: payload(firstName, requestedPickupAt),
  });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

async function publicStatus(publicToken) {
  const result = await rpc("get_public_order_status", { _public_token: publicToken });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return result.data;
}

const slotsResult = await rpc("get_available_pickup_slots", {
  _location_id: locationId,
  _from: new Date().toISOString(),
  _days: 1,
});
assert.equal(slotsResult.response.ok, true, JSON.stringify(slotsResult.data));
assert.equal(slotsResult.data.slotMinutes, 15);
assert.ok(slotsResult.data.slots.length > 0, "at least one future dev slot should be available");
const slot = slotsResult.data.slots[0];
assert.ok(slot.remaining > 0);
assert.equal(Math.floor(Date.parse(slot.startsAt) / 1000) % (15 * 60), 0);

const staffToken = await signInStaff();

// Preorder: arbitrary ASAP accept RPC is forbidden; staff must confirm the exact requested slot.
const scheduled = await createOrder("Scheduled Flow", slot.startsAt);
const wrongAccept = await rpc(
  "staff_accept_order",
  { _order_id: scheduled.id, _accepted_pickup_at: new Date(Date.now() + 20 * 60_000).toISOString() },
  anonKey,
  staffToken,
);
assert.equal(wrongAccept.response.ok, false);

const confirmSlot = await rpc(
  "staff_accept_requested_slot",
  { _order_id: scheduled.id },
  anonKey,
  staffToken,
);
assert.equal(confirmSlot.response.ok, true, JSON.stringify(confirmSlot.data));
const confirmed = Array.isArray(confirmSlot.data) ? confirmSlot.data[0] : confirmSlot.data;
assert.equal(confirmed.state, "scheduled");
assert.equal(Date.parse(confirmed.accepted_pickup_at), Date.parse(slot.startsAt));

// With a deliberately large lead time, the idempotent maintenance worker activates it immediately.
await servicePatch("ordering_settings", `location_id=eq.${locationId}`, { preparation_lead_minutes: 180 });
const activation = await serviceRpc("server_process_order_maintenance", { _now: new Date().toISOString() });
assert.equal(activation.response.ok, true, JSON.stringify(activation.data));
assert.equal(activation.data.activated.some((item) => item.orderId === scheduled.id), true);
assert.equal((await publicStatus(scheduled.public_token)).state, "preparing");

// Timeout warning is emitted once, then the still-unhandled order auto-rejects.
await servicePatch("ordering_settings", `location_id=eq.${locationId}`, { acceptance_timeout_minutes: 2 });
const timeoutOrder = await createOrder("Timeout Flow");
const submittedAtMs = Date.parse(timeoutOrder.submitted_at);
const warningAt = new Date(submittedAtMs + 61_000).toISOString();
const rejectAt = new Date(submittedAtMs + 121_000).toISOString();

const warning = await serviceRpc("server_process_order_maintenance", { _now: warningAt });
assert.equal(warning.response.ok, true, JSON.stringify(warning.data));
assert.equal(warning.data.warnings.filter((item) => item.orderId === timeoutOrder.id).length, 1);

const warningAgain = await serviceRpc("server_process_order_maintenance", { _now: warningAt });
assert.equal(warningAgain.response.ok, true, JSON.stringify(warningAgain.data));
assert.equal(warningAgain.data.warnings.filter((item) => item.orderId === timeoutOrder.id).length, 0);

const rejected = await serviceRpc("server_process_order_maintenance", { _now: rejectAt });
assert.equal(rejected.response.ok, true, JSON.stringify(rejected.data));
assert.equal(rejected.data.rejected.some((item) => item.orderId === timeoutOrder.id), true);
const rejectedStatus = await publicStatus(timeoutOrder.public_token);
assert.equal(rejectedStatus.state, "rejected");
assert.equal(rejectedStatus.rejectionReason, "Nicht rechtzeitig bestätigt");

// Restore discovery defaults and clean the activated order from active KDS lanes.
await servicePatch("ordering_settings", `location_id=eq.${locationId}`, {
  acceptance_timeout_minutes: 5,
  preparation_lead_minutes: 25,
});
const ready = await rpc("staff_mark_order_ready", { _order_id: scheduled.id }, anonKey, staffToken);
assert.equal(ready.response.ok, true, JSON.stringify(ready.data));
const complete = await rpc("staff_complete_order", { _order_id: scheduled.id }, anonKey, staffToken);
assert.equal(complete.response.ok, true, JSON.stringify(complete.data));

console.log("Scheduling/maintenance slice passed:", {
  slotMinutes: slotsResult.data.slotMinutes,
  confirmedSlot: slot.startsAt,
  autoActivated: true,
  timeoutWarning: true,
  autoRejected: true,
});
