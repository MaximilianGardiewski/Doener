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

async function outboxFor(orderId) {
  const result = await request(
    `/rest/v1/order_notification_outbox?order_id=eq.${orderId}&select=id,kind,preferred_channel,fallback_channel,status,attempt_count,last_error&order=created_at.asc`,
    { apiKey: serviceRoleKey, bearer: serviceRoleKey },
  );
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return result.data;
}

async function signInStaff() {
  const login = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    apiKey: anonKey,
    body: { email: "kds-staff@mcello.local", password: "LocalOnly-Staff-2026!" },
  });
  assert.equal(login.response.ok, true, JSON.stringify(login.data));
  return login.data.access_token;
}

function payload(firstName) {
  return {
    locationId,
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: firstName,
    mobile: "+491700000003",
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

async function createOrder(name) {
  const result = await serviceRpc("server_create_verified_order", { _payload: payload(name) });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

// Earlier integration tests intentionally create orders too. Isolate the claim
// test by clearing only the local outbox with service-role authority.
const clear = await request("/rest/v1/order_notification_outbox?id=not.is.null", {
  method: "DELETE",
  apiKey: serviceRoleKey,
  bearer: serviceRoleKey,
});
assert.equal(clear.response.ok, true, JSON.stringify(clear.data));

const staffToken = await signInStaff();
const order = await createOrder("Outbox Lifecycle");
let jobs = await outboxFor(order.id);
assert.deepEqual(jobs.map((job) => job.kind), ["received"]);
assert.equal(jobs[0].preferred_channel, "whatsapp");
assert.equal(jobs[0].fallback_channel, "sms");
assert.equal(jobs[0].status, "pending");

const anonymousRead = await request("/rest/v1/order_notification_outbox?select=id,kind");
assert.equal(
  anonymousRead.response.ok && Array.isArray(anonymousRead.data) && anonymousRead.data.length > 0,
  false,
  "anonymous clients must never receive notification outbox rows",
);

const claimed = await serviceRpc("server_claim_notification_outbox", { _limit: 1 });
assert.equal(claimed.response.ok, true, JSON.stringify(claimed.data));
assert.equal(claimed.data.length, 1);
assert.equal(claimed.data[0].id, jobs[0].id);
assert.equal(claimed.data[0].status, "processing");
assert.equal(claimed.data[0].attempt_count, 1);
const sent = await serviceRpc("server_mark_notification_sent", { _id: jobs[0].id });
assert.equal(sent.response.ok, true, JSON.stringify(sent.data));

const acceptedAt = new Date(Date.now() + 20 * 60_000).toISOString();
const accepted = await rpc(
  "staff_accept_order",
  { _order_id: order.id, _accepted_pickup_at: acceptedAt },
  anonKey,
  staffToken,
);
assert.equal(accepted.response.ok, true, JSON.stringify(accepted.data));
const delayed = await rpc("staff_delay_order", { _order_id: order.id, _minutes: 5 }, anonKey, staffToken);
assert.equal(delayed.response.ok, true, JSON.stringify(delayed.data));
const ready = await rpc("staff_mark_order_ready", { _order_id: order.id }, anonKey, staffToken);
assert.equal(ready.response.ok, true, JSON.stringify(ready.data));
const completed = await rpc("staff_complete_order", { _order_id: order.id }, anonKey, staffToken);
assert.equal(completed.response.ok, true, JSON.stringify(completed.data));

jobs = await outboxFor(order.id);
assert.deepEqual(jobs.map((job) => job.kind), ["received", "accepted", "delayed", "ready"]);

const cancelledOrder = await createOrder("Outbox Cancel");
const cancelled = await rpc("customer_cancel_pending_order", { _public_token: cancelledOrder.public_token });
assert.equal(cancelled.response.ok, true, JSON.stringify(cancelled.data));
assert.deepEqual((await outboxFor(cancelledOrder.id)).map((job) => job.kind), ["received", "cancelled"]);

const rejectedOrder = await createOrder("Outbox Reject");
const rejected = await rpc(
  "staff_reject_order",
  { _order_id: rejectedOrder.id, _reason: "Zu viel los" },
  anonKey,
  staffToken,
);
assert.equal(rejected.response.ok, true, JSON.stringify(rejected.data));
assert.deepEqual((await outboxFor(rejectedOrder.id)).map((job) => job.kind), ["received", "rejected"]);

console.log("Notification outbox lifecycle passed:", {
  customerFlow: ["received", "accepted", "delayed", "ready"],
  cancelFlow: ["received", "cancelled"],
  rejectFlow: ["received", "rejected"],
  channelPolicy: "whatsapp -> sms",
});
