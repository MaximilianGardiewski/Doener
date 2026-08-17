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
const createdOrderIds = [];

async function request(path, { method = "GET", apiKey = anonKey, bearer, body, prefer } = {}) {
  const headers = { apikey: apiKey, accept: "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (prefer) headers.prefer = prefer;
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

async function serviceRpc(name, args) {
  return request(`/rest/v1/rpc/${name}`, {
    method: "POST",
    apiKey: serviceRoleKey,
    bearer: serviceRoleKey,
    body: args,
  });
}

function payload(firstName) {
  return {
    locationId,
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: firstName,
    mobile: "+491700000099",
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
  const order = Array.isArray(result.data) ? result.data[0] : result.data;
  assert.ok(order?.id);
  createdOrderIds.push(order.id);
  return order;
}

async function outboxFor(orderId) {
  const result = await request(
    `/rest/v1/order_notification_outbox?order_id=eq.${orderId}&select=id,kind,status,attempt_count,claimed_at,last_error,dedupe_key&order=created_at.asc`,
    { apiKey: serviceRoleKey, bearer: serviceRoleKey },
  );
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return result.data;
}

async function patchOutbox(query, body) {
  const result = await request(`/rest/v1/order_notification_outbox?${query}`, {
    method: "PATCH",
    apiKey: serviceRoleKey,
    bearer: serviceRoleKey,
    body,
    prefer: "return=representation",
  });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return result.data;
}

async function clearClaimableBaseline() {
  await patchOutbox("status=in.(pending,processing)", {
    status: "sent",
    claimed_at: null,
    sent_at: new Date().toISOString(),
    last_error: null,
  });
}

try {
  await clearClaimableBaseline();

  const leaseOrder = await createOrder("Outbox Lease Recovery");
  let [leaseJob] = await outboxFor(leaseOrder.id);
  assert.equal(leaseJob.status, "pending");
  assert.ok(leaseJob.dedupe_key, "outbox job must expose a stable transport idempotency key");

  const firstClaim = await serviceRpc("server_claim_notification_outbox", { _limit: 1 });
  assert.equal(firstClaim.response.ok, true, JSON.stringify(firstClaim.data));
  assert.equal(firstClaim.data.length, 1);
  assert.equal(firstClaim.data[0].id, leaseJob.id);
  assert.equal(firstClaim.data[0].attempt_count, 1);
  assert.equal(firstClaim.data[0].dedupe_key, leaseJob.dedupe_key);

  await patchOutbox(`id=eq.${leaseJob.id}`, {
    claimed_at: new Date(Date.now() - 6 * 60_000).toISOString(),
  });

  const reclaimed = await serviceRpc("server_claim_notification_outbox", { _limit: 1 });
  assert.equal(reclaimed.response.ok, true, JSON.stringify(reclaimed.data));
  assert.equal(reclaimed.data.length, 1);
  assert.equal(reclaimed.data[0].id, leaseJob.id, "expired processing lease must become claimable again");
  assert.equal(reclaimed.data[0].attempt_count, 2);
  assert.equal(reclaimed.data[0].dedupe_key, leaseJob.dedupe_key, "retry must retain the same transport idempotency key");

  const sentLease = await serviceRpc("server_mark_notification_sent", { _id: leaseJob.id });
  assert.equal(sentLease.response.ok, true, JSON.stringify(sentLease.data));

  const exhaustedOrder = await createOrder("Outbox Lease Exhausted");
  let [exhaustedJob] = await outboxFor(exhaustedOrder.id);
  const exhaustedClaim = await serviceRpc("server_claim_notification_outbox", { _limit: 1 });
  assert.equal(exhaustedClaim.response.ok, true, JSON.stringify(exhaustedClaim.data));
  assert.equal(exhaustedClaim.data[0]?.id, exhaustedJob.id);

  await patchOutbox(`id=eq.${exhaustedJob.id}`, {
    attempt_count: 5,
    claimed_at: new Date(Date.now() - 6 * 60_000).toISOString(),
  });

  const afterBudget = await serviceRpc("server_claim_notification_outbox", { _limit: 1 });
  assert.equal(afterBudget.response.ok, true, JSON.stringify(afterBudget.data));
  assert.equal(afterBudget.data.length, 0, "expired fifth claim must not be retried a sixth time");
  [exhaustedJob] = await outboxFor(exhaustedOrder.id);
  assert.equal(exhaustedJob.status, "failed");
  assert.match(exhaustedJob.last_error || "", /lease expired after retry budget/i);

  const concurrentA = await createOrder("Outbox Concurrent A");
  const concurrentB = await createOrder("Outbox Concurrent B");
  const expectedIds = new Set([
    (await outboxFor(concurrentA.id))[0].id,
    (await outboxFor(concurrentB.id))[0].id,
  ]);

  const [claimA, claimB] = await Promise.all([
    serviceRpc("server_claim_notification_outbox", { _limit: 1 }),
    serviceRpc("server_claim_notification_outbox", { _limit: 1 }),
  ]);
  assert.equal(claimA.response.ok, true, JSON.stringify(claimA.data));
  assert.equal(claimB.response.ok, true, JSON.stringify(claimB.data));
  assert.equal(claimA.data.length, 1);
  assert.equal(claimB.data.length, 1);
  const claimedIds = new Set([claimA.data[0].id, claimB.data[0].id]);
  assert.equal(claimedIds.size, 2, "parallel workers must claim different jobs");
  assert.deepEqual(claimedIds, expectedIds);

  for (const id of claimedIds) {
    const marked = await serviceRpc("server_mark_notification_sent", { _id: id });
    assert.equal(marked.response.ok, true, JSON.stringify(marked.data));
  }

  console.log("Notification outbox lease integration passed:", {
    staleClaimRecovered: true,
    retryBudget: 5,
    stableIdempotencyKey: true,
    concurrentClaimsDistinct: true,
  });
} finally {
  for (const orderId of createdOrderIds) {
    await request(`/rest/v1/orders?id=eq.${orderId}`, {
      method: "DELETE",
      apiKey: serviceRoleKey,
      bearer: serviceRoleKey,
    }).catch(() => {});
  }
}
