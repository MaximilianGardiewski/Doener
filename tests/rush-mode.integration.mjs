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
const mildOptionId = "00000000-0000-4000-8000-000000000201";
const createdOrderIds = [];

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

async function rpc(name, args, bearer = serviceRoleKey, apiKey = bearer === serviceRoleKey ? serviceRoleKey : anonKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", apiKey, bearer, body: args });
}

async function signIn(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return result.data.access_token;
}

async function patchSettings(body) {
  const result = await request(`/rest/v1/ordering_settings?location_id=eq.${locationId}`, {
    method: "PATCH",
    apiKey: serviceRoleKey,
    bearer: serviceRoleKey,
    body,
  });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
}

async function getSettings() {
  const result = await request(
    `/rest/v1/ordering_settings?location_id=eq.${locationId}&select=override,operator_message,rush_extra_minutes`,
    { apiKey: serviceRoleKey, bearer: serviceRoleKey },
  );
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  assert.equal(result.data.length, 1);
  return result.data[0];
}

function alignedFutureSlot(minutes = 90, slotMinutes = 15) {
  const slotMs = slotMinutes * 60_000;
  return new Date(Math.ceil((Date.now() + minutes * 60_000) / slotMs) * slotMs).toISOString();
}

function orderPayload(firstName, mobile, requestedPickupAt = null) {
  return {
    locationId,
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: firstName,
    mobile,
    requestedPickupAt,
    totalCents: 800,
    submittedAt: new Date().toISOString(),
    items: [{
      productId,
      quantity: 1,
      selections: [{ groupId, optionIds: [mildOptionId] }],
    }],
  };
}

async function createOrder(firstName, mobile, requestedPickupAt = null) {
  const result = await rpc("server_create_verified_order", {
    _payload: orderPayload(firstName, mobile, requestedPickupAt),
  });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  createdOrderIds.push(row.id);
  return row;
}

const adminToken = await signIn("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const staffToken = await signIn("kds-staff@mcello.local", "LocalOnly-Staff-2026!");

const initialScheduleResult = await rpc("admin_get_ordering_schedule", { _location_id: locationId }, adminToken, anonKey);
assert.equal(initialScheduleResult.response.ok, true, JSON.stringify(initialScheduleResult.data));
const initialSchedule = initialScheduleResult.data;
const restoreWeeklyRows = (initialSchedule.openingHours || []).map((row) => ({
  weekday: Number(row.weekday),
  opensAt: row.opensAt,
  closesAt: row.closesAt,
  closed: Boolean(row.closed),
  sort: Number(row.sort || 0),
}));
const initialSettings = await getSettings();

try {
  // Fixture creation is isolated from real/unknown opening hours. force_open is
  // service-role test setup only and is restored before leaving this test.
  await patchSettings({ override: "force_open", operator_message: null });
  const asapOrder = await createOrder("Rush ASAP", "+491700000120");
  const preorderSlot = alignedFutureSlot();
  const preorder = await createOrder("Rush Preorder", "+491700000121", preorderSlot);

  const setBuffer = await rpc("admin_set_rush_extra_minutes", {
    _location_id: locationId,
    _minutes: 12,
  }, adminToken, anonKey);
  assert.equal(setBuffer.response.ok, true, JSON.stringify(setBuffer.data));
  assert.equal(setBuffer.data.rushExtraMinutes, 12);

  const staffBufferAttempt = await rpc("admin_set_rush_extra_minutes", {
    _location_id: locationId,
    _minutes: 55,
  }, staffToken, anonKey);
  assert.equal(staffBufferAttempt.response.ok, false, "staff must not change structural Rush buffer");

  const directStaffBufferAttempt = await request(`/rest/v1/ordering_settings?location_id=eq.${locationId}`, {
    method: "PATCH",
    bearer: staffToken,
    body: { rush_extra_minutes: 55 },
  });
  assert.equal(directStaffBufferAttempt.response.ok, false, "staff RLS must block direct Rush-buffer writes");

  const weeklyRows = [
    { weekday: 1, opensAt: null, closesAt: null, closed: true, sort: 0 },
    { weekday: 2, opensAt: "10:00", closesAt: "22:00", closed: false, sort: 10 },
    { weekday: 3, opensAt: null, closesAt: null, closed: true, sort: 0 },
    { weekday: 4, opensAt: null, closesAt: null, closed: true, sort: 0 },
    { weekday: 5, opensAt: null, closesAt: null, closed: true, sort: 0 },
    { weekday: 6, opensAt: null, closesAt: null, closed: true, sort: 0 },
    { weekday: 7, opensAt: null, closesAt: null, closed: true, sort: 0 },
  ];
  const savedHours = await rpc("admin_replace_weekly_opening_hours", {
    _location_id: locationId,
    _rows: weeklyRows,
  }, adminToken, anonKey);
  assert.equal(savedHours.response.ok, true, JSON.stringify(savedHours.data));

  const rush = await rpc("staff_set_shop_override", {
    _location_id: locationId,
    _override: "rush",
    _operator_message: "DEV Rush",
  }, staffToken, anonKey);
  assert.equal(rush.response.ok, true, JSON.stringify(rush.data));

  const state = await rpc("server_get_shop_state", {
    _location_id: locationId,
    _at: "2030-01-01T12:00:00+01:00",
  });
  assert.equal(state.response.ok, true, JSON.stringify(state.data));
  assert.equal(state.data.override, "rush");
  assert.equal(state.data.rushExtraMinutes, 12);

  const rushOpen = await rpc("server_shop_accepts_order", {
    _location_id: locationId,
    _at: "2030-01-01T12:00:00+01:00",
  });
  assert.equal(rushOpen.response.ok, true, JSON.stringify(rushOpen.data));
  assert.equal(rushOpen.data, true, "Rush must remain orderable inside normal opening hours");

  const publicRush = await rpc("get_public_shop_state", {
    _location_id: locationId,
    _at: "2030-01-01T12:00:00+01:00",
  }, null, anonKey);
  assert.equal(publicRush.response.ok, true, JSON.stringify(publicRush.data));
  assert.equal(publicRush.data.status, "rush");
  assert.equal(publicRush.data.acceptingOrders, true);
  assert.equal(publicRush.data.rushExtraMinutes, 12);

  const rushCutoff = await rpc("server_shop_accepts_order", {
    _location_id: locationId,
    _at: "2030-01-01T21:45:00+01:00",
  });
  assert.equal(rushCutoff.response.ok, true, JSON.stringify(rushCutoff.data));
  assert.equal(rushCutoff.data, false, "Rush must not bypass the configured close cutoff");

  const rushClosedDay = await rpc("server_shop_accepts_order", {
    _location_id: locationId,
    _at: "2030-01-07T12:00:00+01:00",
  });
  assert.equal(rushClosedDay.response.ok, true, JSON.stringify(rushClosedDay.data));
  assert.equal(rushClosedDay.data, false, "Rush must not force-open a scheduled-closed day");

  const pause = await rpc("staff_set_shop_override", {
    _location_id: locationId,
    _override: "pause",
    _operator_message: "DEV Pause",
  }, staffToken, anonKey);
  assert.equal(pause.response.ok, true, JSON.stringify(pause.data));
  const paused = await rpc("server_shop_accepts_order", {
    _location_id: locationId,
    _at: "2030-01-01T12:00:00+01:00",
  });
  assert.equal(paused.response.ok, true, JSON.stringify(paused.data));
  assert.equal(paused.data, false, "Pause must remain a hard order stop");

  const backToRush = await rpc("staff_set_shop_override", {
    _location_id: locationId,
    _override: "rush",
    _operator_message: "DEV Rush",
  }, staffToken, anonKey);
  assert.equal(backToRush.response.ok, true, JSON.stringify(backToRush.data));

  const staffForceOpen = await rpc("staff_set_shop_override", {
    _location_id: locationId,
    _override: "force_open",
    _operator_message: "must fail",
  }, staffToken, anonKey);
  assert.equal(staffForceOpen.response.ok, false, "staff must still be unable to force-open");

  const baseAcceptedAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const acceptedAsap = await rpc("staff_accept_order", {
    _order_id: asapOrder.id,
    _accepted_pickup_at: baseAcceptedAt,
  }, staffToken, anonKey);
  assert.equal(acceptedAsap.response.ok, true, JSON.stringify(acceptedAsap.data));
  const acceptedAsapRow = Array.isArray(acceptedAsap.data) ? acceptedAsap.data[0] : acceptedAsap.data;
  const expectedRushEta = new Date(Date.parse(baseAcceptedAt) + 12 * 60_000).toISOString();
  assert.equal(new Date(acceptedAsapRow.accepted_pickup_at).toISOString(), expectedRushEta);
  assert.equal(acceptedAsapRow.state, "preparing");

  const acceptedPreorder = await rpc("staff_accept_requested_slot", {
    _order_id: preorder.id,
  }, staffToken, anonKey);
  assert.equal(acceptedPreorder.response.ok, true, JSON.stringify(acceptedPreorder.data));
  const acceptedPreorderRow = Array.isArray(acceptedPreorder.data) ? acceptedPreorder.data[0] : acceptedPreorder.data;
  assert.equal(new Date(acceptedPreorderRow.accepted_pickup_at).toISOString(), new Date(preorderSlot).toISOString(), "Rush must never shift a promised preorder slot");
  assert.equal(acceptedPreorderRow.state, "scheduled");

  const acceptedEvent = await request(
    `/rest/v1/order_events?order_id=eq.${asapOrder.id}&event_type=eq.order_accepted&select=metadata`,
    { apiKey: serviceRoleKey, bearer: serviceRoleKey },
  );
  assert.equal(acceptedEvent.response.ok, true, JSON.stringify(acceptedEvent.data));
  assert.equal(acceptedEvent.data.length, 1);
  assert.equal(acceptedEvent.data[0].metadata.rushExtraMinutes, 12);

  console.log("Rush mode integration passed:", {
    rushExtraMinutes: 12,
    rushOpen: true,
    cutoffStillEnforced: true,
    pauseStillBlocks: true,
    asapEtaShiftMinutes: 12,
    preorderSlotPreserved: true,
  });
} finally {
  if (restoreWeeklyRows.length) {
    const restoreHours = await rpc("admin_replace_weekly_opening_hours", {
      _location_id: locationId,
      _rows: restoreWeeklyRows,
    }, adminToken, anonKey);
    assert.equal(restoreHours.response.ok, true, `restore hours: ${JSON.stringify(restoreHours.data)}`);
  }

  const restoreBuffer = await rpc("admin_set_rush_extra_minutes", {
    _location_id: locationId,
    _minutes: Number(initialSettings.rush_extra_minutes),
  }, adminToken, anonKey);
  assert.equal(restoreBuffer.response.ok, true, `restore Rush buffer: ${JSON.stringify(restoreBuffer.data)}`);

  await patchSettings({
    override: initialSettings.override,
    operator_message: initialSettings.operator_message,
  });

  if (createdOrderIds.length) {
    const filter = createdOrderIds.join(",");
    const deleted = await request(`/rest/v1/orders?id=in.(${filter})`, {
      method: "DELETE",
      apiKey: serviceRoleKey,
      bearer: serviceRoleKey,
    });
    assert.equal(deleted.response.ok, true, `cleanup Rush orders: ${JSON.stringify(deleted.data)}`);
  }
}
