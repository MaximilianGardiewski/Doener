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
const locationId = "00000000-0000-4000-8000-000000000001";
const productId = "00000000-0000-4000-8000-000000000100";
const groupId = "00000000-0000-4000-8000-000000000200";
const mildOptionId = "00000000-0000-4000-8000-000000000201";
const extraOptionId = "00000000-0000-4000-8000-000000000202";
const invalidProductId = "00000000-0000-4000-8000-000000000999";

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

async function rpc(name, args, { apiKey = serviceRoleKey, bearer = serviceRoleKey } = {}) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", apiKey, bearer, body: args });
}

async function createUser(email, password) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    apiKey: serviceRoleKey,
    bearer: serviceRoleKey,
    body: { email, password, email_confirm: true },
  });
  assert.equal(result.response.ok, true, `create user: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function signIn(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    apiKey: anonKey,
    body: { email, password },
  });
  assert.equal(result.response.ok, true, `sign in: ${JSON.stringify(result.data)}`);
  return result.data.access_token;
}

async function grantRole(userId, role) {
  const result = await request("/rest/v1/user_roles", {
    method: "POST",
    apiKey: serviceRoleKey,
    bearer: serviceRoleKey,
    body: { user_id: userId, role },
  });
  assert.equal(result.response.ok, true, `grant role: ${JSON.stringify(result.data)}`);
}

async function orderRow(orderId) {
  const result = await request(
    `/rest/v1/orders?id=eq.${orderId}&select=id,public_token,order_number,state,mobile,customer_first_name,comment,requested_pickup_at,total_cents,submitted_at,payment_mode,payment_method,payment_status`,
    { apiKey: serviceRoleKey, bearer: serviceRoleKey },
  );
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  assert.equal(result.data.length, 1);
  return result.data[0];
}

async function receivedOutbox(orderId) {
  const result = await request(
    `/rest/v1/order_notification_outbox?order_id=eq.${orderId}&kind=eq.received&select=payload`,
    { apiKey: serviceRoleKey, bearer: serviceRoleKey },
  );
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  assert.equal(result.data.length, 1);
  return result.data[0];
}

function payloadFor({ firstName, mobile, requestedPickupAt = null, optionId = extraOptionId }) {
  return {
    locationId,
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: firstName,
    mobile,
    comment: "Ursprünglicher Hinweis",
    requestedPickupAt,
    totalCents: 1,
    submittedAt: new Date().toISOString(),
    items: [{
      productId,
      productNameSnapshot: "Manipulierter Name",
      quantity: 1,
      unitPriceCentsSnapshot: 1,
      lineTotalCents: 1,
      selections: [{ groupId, optionIds: [optionId] }],
      comment: "Alt",
    }],
  };
}

async function createVerified(payload) {
  const result = await rpc("server_create_verified_order", { _payload: payload });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

function alignedFutureSlot(minutes = 90, slotMinutes = 15) {
  const slotMs = slotMinutes * 60_000;
  const target = Date.now() + minutes * 60_000;
  return new Date(Math.ceil(target / slotMs) * slotMs).toISOString();
}

const staffEmail = "preaccept-edit-staff@mcello.local";
const staffPassword = "LocalOnly-Preaccept-2026!";
const staffUser = await createUser(staffEmail, staffPassword);
await grantRole(staffUser.id, "staff");
const staffToken = await signIn(staffEmail, staffPassword);

const initialPayload = payloadFor({
  firstName: "Edit Flow",
  mobile: "+491700000043",
});
const created = await createVerified(initialPayload);
assert.equal(created.state, "waiting_for_acceptance");
assert.equal(created.total_cents, 900, "database must ignore manipulated client prices and compute 800 + 100");

const before = await orderRow(created.id);
assert.equal(before.total_cents, 900);
assert.equal(before.mobile, initialPayload.mobile);
assert.equal(before.payment_mode, "pay_on_site");
assert.equal(before.payment_method, "cash_or_card");
assert.equal(before.payment_status, "due_on_site");
assert.equal((await receivedOutbox(created.id)).payload.totalCents, 900, "received outbox must freeze authoritative total");

const publicBefore = await rpc("get_public_order_status", { _public_token: created.public_token }, { apiKey: anonKey, bearer: undefined });
assert.equal(publicBefore.response.ok, true, JSON.stringify(publicBefore.data));
assert.equal(publicBefore.data.editable, true);
assert.equal(Object.hasOwn(publicBefore.data, "mobile"), false);
assert.equal(JSON.stringify(publicBefore.data).includes(productId), false, "public status must not expose stable catalog ids");

const anonymousEditContext = await rpc(
  "server_get_pending_order_edit_context",
  { _public_token: created.public_token },
  { apiKey: anonKey, bearer: undefined },
);
assert.equal(anonymousEditContext.response.ok, false, "raw edit reconstruction must stay service-role only");

const contextResult = await rpc("server_get_pending_order_edit_context", { _public_token: created.public_token });
assert.equal(contextResult.response.ok, true, JSON.stringify(contextResult.data));
assert.equal(contextResult.data.orderNumber, Number(created.order_number));
assert.equal(Object.hasOwn(contextResult.data, "locationId"), false, "edit draft must not leak internal location id");
assert.equal(Object.hasOwn(contextResult.data, "mobile"), false, "edit draft must not leak verified mobile");
assert.equal(Object.hasOwn(contextResult.data, "payment"), false, "edit draft must not expose immutable payment state");
assert.equal(contextResult.data.items.length, 1);
assert.equal(contextResult.data.items[0].productId, productId);
assert.equal(contextResult.data.items[0].selections[0].groupId, groupId);
assert.deepEqual(contextResult.data.items[0].selections[0].optionIds, [extraOptionId]);

const editPayload = {
  comment: "Neu gespeichert",
  requestedPickupAt: null,
  // Deliberately hostile immutable/client-authoritative fields. The DB edit RPC
  // must ignore all of them and derive identity/state/payment/price from the row/catalog.
  locationId: "00000000-0000-4000-8000-000000000002",
  mobile: "+499999999999",
  customerFirstName: "Manipuliert",
  source: "counter",
  fulfillmentType: "delivery",
  state: "completed",
  paymentMode: "online",
  submittedAt: new Date(0).toISOString(),
  totalCents: 999999,
  items: [{
    productId,
    quantity: 2,
    unitPriceCentsSnapshot: 999999,
    lineTotalCents: 999999,
    selections: [{ groupId, optionIds: [mildOptionId] }],
    comment: "Ohne Extra",
  }],
};

const editedResult = await rpc("server_replace_pending_order", {
  _public_token: created.public_token,
  _payload: editPayload,
});
assert.equal(editedResult.response.ok, true, JSON.stringify(editedResult.data));
assert.equal(editedResult.data.state, "waiting_for_acceptance");
assert.equal(editedResult.data.editable, true);
assert.equal(editedResult.data.totalCents, 1600, "edit must recompute 2 x 800 and ignore manipulated client totals");
assert.equal(editedResult.data.items[0].quantity, 2);
assert.equal(editedResult.data.items[0].options[0].option, "DEV Mild");
assert.equal(editedResult.data.items[0].comment, "Ohne Extra");

const after = await orderRow(created.id);
assert.equal(after.id, before.id);
assert.equal(after.public_token, before.public_token);
assert.equal(after.order_number, before.order_number);
assert.equal(after.mobile, before.mobile);
assert.equal(after.customer_first_name, before.customer_first_name);
assert.equal(after.submitted_at, before.submitted_at, "customer edit must not reset acceptance timeout");
assert.equal(after.total_cents, 1600);
assert.equal(after.comment, "Neu gespeichert");
assert.equal(after.payment_mode, before.payment_mode);
assert.equal(after.payment_method, before.payment_method);
assert.equal(after.payment_status, before.payment_status);
assert.equal(after.state, "waiting_for_acceptance");

const eventResult = await request(
  `/rest/v1/order_events?order_id=eq.${created.id}&event_type=eq.customer_edited&select=event_type,metadata`,
  { apiKey: serviceRoleKey, bearer: serviceRoleKey },
);
assert.equal(eventResult.response.ok, true, JSON.stringify(eventResult.data));
assert.equal(eventResult.data.length, 1);
assert.equal(eventResult.data[0].metadata.totalCents, 1600);

// Invalid catalog mutation must roll back the comment, total and existing line set.
const invalidEdit = await rpc("server_replace_pending_order", {
  _public_token: created.public_token,
  _payload: {
    comment: "DARF NICHT BLEIBEN",
    requestedPickupAt: null,
    items: [{
      productId: invalidProductId,
      quantity: 1,
      selections: [],
      comment: "Ungültig",
    }],
  },
});
assert.equal(invalidEdit.response.ok, false, "invalid product edit must fail atomically");
let afterRollback = await orderRow(created.id);
assert.equal(afterRollback.comment, "Neu gespeichert");
assert.equal(afterRollback.total_cents, 1600);
assert.equal(afterRollback.requested_pickup_at, null);

// Fill an aligned future slot to configured V1 capacity (6). Moving the
// existing ASAP order into that full slot must fail and leave it unchanged.
const fullSlot = alignedFutureSlot();
for (let index = 0; index < 6; index += 1) {
  const filler = await createVerified(payloadFor({
    firstName: `Slot Filler ${index + 1}`,
    mobile: `+4917000010${String(index).padStart(2, "0")}`,
    requestedPickupAt: fullSlot,
    optionId: mildOptionId,
  }));
  assert.equal(filler.requested_pickup_at, fullSlot);
}

const fullSlotEdit = await rpc("server_replace_pending_order", {
  _public_token: created.public_token,
  _payload: {
    comment: "DARF AUCH NICHT BLEIBEN",
    requestedPickupAt: fullSlot,
    items: [{
      productId,
      quantity: 2,
      selections: [{ groupId, optionIds: [mildOptionId] }],
      comment: "Ohne Extra",
    }],
  },
});
assert.equal(fullSlotEdit.response.ok, false, "moving an edit into a full slot must fail atomically");
afterRollback = await orderRow(created.id);
assert.equal(afterRollback.comment, "Neu gespeichert");
assert.equal(afterRollback.total_cents, 1600);
assert.equal(afterRollback.requested_pickup_at, null);

const acceptedPickupAt = new Date(Date.now() + 20 * 60_000).toISOString();
const accepted = await rpc(
  "staff_accept_order",
  { _order_id: created.id, _accepted_pickup_at: acceptedPickupAt },
  { apiKey: anonKey, bearer: staffToken },
);
assert.equal(accepted.response.ok, true, JSON.stringify(accepted.data));

const publicAfterAccept = await rpc("get_public_order_status", { _public_token: created.public_token }, { apiKey: anonKey, bearer: undefined });
assert.equal(publicAfterAccept.response.ok, true, JSON.stringify(publicAfterAccept.data));
assert.equal(publicAfterAccept.data.editable, false);

const editAfterAccept = await rpc("server_replace_pending_order", {
  _public_token: created.public_token,
  _payload: {
    comment: "Zu spät",
    requestedPickupAt: null,
    items: [{ productId, quantity: 1, selections: [{ groupId, optionIds: [mildOptionId] }] }],
  },
});
assert.equal(editAfterAccept.response.ok, false, "accepted order must be immutable to customer edit token");

const rowAfterRejectedEdit = await orderRow(created.id);
assert.equal(rowAfterRejectedEdit.total_cents, 1600);
assert.equal(rowAfterRejectedEdit.comment, "Neu gespeichert");
assert.equal(rowAfterRejectedEdit.state, "preparing");

console.log("Pre-accept edit boundary passed:", {
  orderNumber: after.order_number,
  totalBefore: before.total_cents,
  totalAfter: after.total_cents,
  privacyMinimalDraft: true,
  immutableIdentityPreserved: true,
  invalidProductRollback: true,
  fullSlotRollback: true,
  editAfterAcceptanceRejected: true,
});
