import assert from "node:assert/strict";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required");
}

async function rpc(name, args, apiKey, bearerToken) {
  const headers = {
    apikey: apiKey,
    "content-type": "application/json",
    accept: "application/json",
  };
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { response, data };
}

const payload = {
  locationId: "00000000-0000-4000-8000-000000000001",
  source: "web",
  fulfillmentType: "pickup",
  state: "waiting_for_acceptance",
  customerFirstName: "Integration",
  mobile: "+491700000000",
  requestedPickupAt: null,
  totalCents: 900,
  submittedAt: new Date().toISOString(),
  items: [{
    productId: "00000000-0000-4000-8000-000000000100",
    productNameSnapshot: "DEV – Konfigurierbares Testgericht",
    quantity: 1,
    unitPriceCentsSnapshot: 900,
    lineTotalCents: 900,
    selections: [{
      groupId: "00000000-0000-4000-8000-000000000200",
      optionIds: ["00000000-0000-4000-8000-000000000202"],
    }],
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
assert.equal(created.state, "waiting_for_acceptance");
assert.equal(created.total_cents, 900);
assert.match(created.public_token, /^[0-9a-f-]{36}$/i);

const statusResult = await rpc(
  "get_public_order_status",
  { _public_token: created.public_token },
  anonKey,
);
assert.equal(statusResult.response.ok, true, JSON.stringify(statusResult.data));
const status = statusResult.data;
assert.equal(status.state, "waiting_for_acceptance");
assert.equal(status.totalCents, 900);
assert.equal(Object.hasOwn(status, "mobile"), false);
assert.equal(status.items.length, 1);
assert.equal(status.items[0].options[0].option, "DEV Extra");

const cancelResult = await rpc(
  "customer_cancel_pending_order",
  { _public_token: created.public_token },
  anonKey,
);
assert.equal(cancelResult.response.ok, true, JSON.stringify(cancelResult.data));
assert.equal(cancelResult.data.state, "cancelled");

const cancelAgain = await rpc(
  "customer_cancel_pending_order",
  { _public_token: created.public_token },
  anonKey,
);
assert.equal(cancelAgain.response.ok, false);

console.log("Local Supabase vertical slice passed:", {
  orderNumber: status.orderNumber,
  initialState: status.state,
  finalState: cancelResult.data.state,
});
