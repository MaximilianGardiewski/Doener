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

async function rpc(name, args, bearer, apiKey = anonKey) {
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

function unwrapRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

const adminToken = await signIn("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const staffToken = await signIn("kds-staff@mcello.local", "LocalOnly-Staff-2026!");
const initialResult = await rpc("admin_get_ordering_schedule", { _location_id: locationId }, adminToken);
assert.equal(initialResult.response.ok, true, JSON.stringify(initialResult.data));
const initial = initialResult.data;
assert.equal(initial.timezone, "Europe/Berlin");
assert.ok(initial.orderingSettings);

const restoreWeeklyRows = (initial.openingHours || []).map((row) => ({
  weekday: Number(row.weekday),
  opensAt: row.opensAt,
  closesAt: row.closesAt,
  closed: Boolean(row.closed),
  sort: Number(row.sort || 0),
}));
const initialSettings = initial.orderingSettings;
let specialId = null;
let ruleId = null;

try {
  const staffHoursAttempt = await rpc("admin_replace_weekly_opening_hours", {
    _location_id: locationId,
    _rows: [{ weekday: 2, opensAt: "10:00", closesAt: "22:00", closed: false, sort: 10 }],
  }, staffToken);
  assert.equal(staffHoursAttempt.response.ok, false, "staff must not structurally change opening hours");

  const staffSettingsAttempt = await rpc("admin_save_ordering_settings", {
    _location_id: locationId,
    _order_cutoff_minutes: 30,
    _acceptance_timeout_minutes: 5,
    _slot_minutes: 15,
    _slot_capacity: 3,
    _preparation_lead_minutes: 25,
    _online_ordering_enabled: true,
    _pickup_enabled: true,
    _delivery_enabled: false,
  }, staffToken);
  assert.equal(staffSettingsAttempt.response.ok, false, "staff must not structurally change capacity/cutoff settings");

  const directStaffSettingsWrite = await request(
    `/rest/v1/ordering_settings?location_id=eq.${locationId}`,
    {
      method: "PATCH",
      bearer: staffToken,
      body: { slot_capacity: 999 },
    },
  );
  assert.equal(directStaffSettingsWrite.response.ok, false, "staff must not bypass RPC boundaries with direct table updates");

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
  }, adminToken);
  assert.equal(savedHours.response.ok, true, JSON.stringify(savedHours.data));
  assert.equal(savedHours.data.rows, 7);

  const overlapAttempt = await rpc("admin_replace_weekly_opening_hours", {
    _location_id: locationId,
    _rows: [
      { weekday: 2, opensAt: "10:00", closesAt: "15:00", closed: false, sort: 10 },
      { weekday: 2, opensAt: "14:00", closesAt: "18:00", closed: false, sort: 20 },
    ],
  }, adminToken);
  assert.equal(overlapAttempt.response.ok, false, "overlapping weekly intervals must be rejected atomically");

  const settingsSave = await rpc("admin_save_ordering_settings", {
    _location_id: locationId,
    _order_cutoff_minutes: 30,
    _acceptance_timeout_minutes: 5,
    _slot_minutes: 15,
    _slot_capacity: 3,
    _preparation_lead_minutes: 25,
    _online_ordering_enabled: true,
    _pickup_enabled: true,
    _delivery_enabled: false,
  }, adminToken);
  assert.equal(settingsSave.response.ok, true, JSON.stringify(settingsSave.data));

  // Local seed uses force_open so checkout/KDS tests work without claiming real
  // Mcello hours. Schedule/cutoff assertions must explicitly exercise auto mode.
  const autoMode = await rpc("staff_set_shop_override", {
    _location_id: locationId,
    _override: "auto",
    _operator_message: null,
  }, staffToken);
  assert.equal(autoMode.response.ok, true, JSON.stringify(autoMode.data));

  const midday = "2030-01-01T12:00:00+01:00"; // Tuesday in Europe/Berlin.
  const beforeCutoff = "2030-01-01T21:20:00+01:00";
  const insideCutoff = "2030-01-01T21:45:00+01:00";

  const openState = await rpc("get_public_shop_state", { _location_id: locationId, _at: midday });
  assert.equal(openState.response.ok, true, JSON.stringify(openState.data));
  assert.equal(openState.data.scheduledOpen, true);
  assert.equal(openState.data.acceptingOrders, true);
  assert.equal(openState.data.status, "open");

  const beforeCutoffResult = await rpc("server_shop_accepts_order", { _location_id: locationId, _at: beforeCutoff }, serviceRoleKey, serviceRoleKey);
  assert.equal(beforeCutoffResult.response.ok, true, JSON.stringify(beforeCutoffResult.data));
  assert.equal(beforeCutoffResult.data, true, "40 minutes before close should accept with a 30-minute cutoff");

  const cutoffResult = await rpc("server_shop_accepts_order", { _location_id: locationId, _at: insideCutoff }, serviceRoleKey, serviceRoleKey);
  assert.equal(cutoffResult.response.ok, true, JSON.stringify(cutoffResult.data));
  assert.equal(cutoffResult.data, false, "15 minutes before close must be blocked by the 30-minute cutoff");

  const slots = await rpc("get_available_pickup_slots", {
    _location_id: locationId,
    _from: "2030-01-01T11:30:00+01:00",
    _days: 1,
  });
  assert.equal(slots.response.ok, true, JSON.stringify(slots.data));
  assert.equal(slots.data.slotMinutes, 15);
  assert.ok(slots.data.slots.length > 0);
  assert.equal(slots.data.slots[0].capacity, 3);

  const special = await rpc("admin_save_special_opening_hour", {
    _id: null,
    _location_id: locationId,
    _day: "2030-01-01",
    _opens_at: null,
    _closes_at: null,
    _closed: true,
    _public_note: "DEV Integration geschlossen",
  }, adminToken);
  assert.equal(special.response.ok, true, JSON.stringify(special.data));
  specialId = unwrapRow(special.data)?.id;
  assert.ok(specialId);

  const specialClosedState = await rpc("get_public_shop_state", { _location_id: locationId, _at: midday });
  assert.equal(specialClosedState.response.ok, true, JSON.stringify(specialClosedState.data));
  assert.equal(specialClosedState.data.scheduledOpen, false);
  assert.equal(specialClosedState.data.acceptingOrders, false);

  const deleteSpecial = await rpc("admin_delete_special_opening_hour", { _id: specialId }, adminToken);
  assert.equal(deleteSpecial.response.ok, true, JSON.stringify(deleteSpecial.data));
  specialId = null;

  const rule = await rpc("admin_save_availability_rule", {
    _id: null,
    _location_id: locationId,
    _product_id: productId,
    _category_id: null,
    _weekday: 2,
    _starts_at: "18:00",
    _ends_at: "20:00",
    _valid_from: "2030-01-01",
    _valid_until: "2030-01-01",
    _enabled: true,
  }, adminToken);
  assert.equal(rule.response.ok, true, JSON.stringify(rule.data));
  ruleId = unwrapRow(rule.data)?.id;
  assert.ok(ruleId);

  const productBefore = await rpc("server_is_product_available", {
    _product_id: productId,
    _at: "2030-01-01T17:00:00+01:00",
  }, serviceRoleKey, serviceRoleKey);
  const productInside = await rpc("server_is_product_available", {
    _product_id: productId,
    _at: "2030-01-01T19:00:00+01:00",
  }, serviceRoleKey, serviceRoleKey);
  assert.equal(productBefore.response.ok, true, JSON.stringify(productBefore.data));
  assert.equal(productInside.response.ok, true, JSON.stringify(productInside.data));
  assert.equal(productBefore.data, false, "time-based availability must be evaluated at requested pickup time");
  assert.equal(productInside.data, true, "product must become available inside its configured future window");

  const pause = await rpc("staff_set_shop_override", {
    _location_id: locationId,
    _override: "pause",
    _operator_message: "DEV: Online-Bestellungen kurz pausiert",
  }, staffToken);
  assert.equal(pause.response.ok, true, JSON.stringify(pause.data));

  const pausedState = await rpc("get_public_shop_state", { _location_id: locationId, _at: midday });
  assert.equal(pausedState.response.ok, true, JSON.stringify(pausedState.data));
  assert.equal(pausedState.data.status, "pause");
  assert.equal(pausedState.data.acceptingOrders, false);
  assert.equal(pausedState.data.operatorMessage, "DEV: Online-Bestellungen kurz pausiert");

  const staffForceOpen = await rpc("staff_set_shop_override", {
    _location_id: locationId,
    _override: "force_open",
    _operator_message: "should fail",
  }, staffToken);
  assert.equal(staffForceOpen.response.ok, false, "staff may not force-open outside structural schedule");

  const backToAuto = await rpc("staff_set_shop_override", {
    _location_id: locationId,
    _override: "auto",
    _operator_message: null,
  }, staffToken);
  assert.equal(backToAuto.response.ok, true, JSON.stringify(backToAuto.data));

  const scheduleSnapshot = await rpc("admin_get_ordering_schedule", { _location_id: locationId }, adminToken);
  assert.equal(scheduleSnapshot.response.ok, true, JSON.stringify(scheduleSnapshot.data));
  assert.equal(scheduleSnapshot.data.orderingSettings.slotCapacity, 3);
  assert.equal(scheduleSnapshot.data.availabilityRules.some((candidate) => candidate.id === ruleId), true);
  assert.equal(scheduleSnapshot.data.openingHours.some((row) => row.weekday === 2 && row.opensAt === "10:00" && row.closesAt === "22:00"), true);

  console.log("Ordering schedule integration passed:", {
    weeklyHours: "Tuesday 10:00-22:00 DEV fixture",
    cutoffMinutes: 30,
    slotCapacity: 3,
    specialClosedOverride: true,
    timedProductWindow: "18:00-20:00",
    staffPause: true,
    staffForceOpenDenied: true,
    directStaffSettingsWriteDenied: true,
  });
} finally {
  if (ruleId) await rpc("admin_delete_availability_rule", { _id: ruleId }, adminToken).catch(() => {});
  if (specialId) await rpc("admin_delete_special_opening_hour", { _id: specialId }, adminToken).catch(() => {});

  await rpc("admin_replace_weekly_opening_hours", {
    _location_id: locationId,
    _rows: restoreWeeklyRows,
  }, adminToken).catch(() => {});

  if (initialSettings) {
    await rpc("admin_save_ordering_settings", {
      _location_id: locationId,
      _order_cutoff_minutes: initialSettings.orderCutoffMinutes,
      _acceptance_timeout_minutes: initialSettings.acceptanceTimeoutMinutes,
      _slot_minutes: initialSettings.slotMinutes,
      _slot_capacity: initialSettings.slotCapacity,
      _preparation_lead_minutes: initialSettings.preparationLeadMinutes,
      _online_ordering_enabled: initialSettings.onlineOrderingEnabled,
      _pickup_enabled: initialSettings.pickupEnabled,
      _delivery_enabled: initialSettings.deliveryEnabled,
    }, adminToken).catch(() => {});

    // Restore the exact pre-test operational state, including development-only
    // force_open if the seed had it. service_role is used only by this local test.
    await request(`/rest/v1/ordering_settings?location_id=eq.${locationId}`, {
      method: "PATCH",
      apiKey: serviceRoleKey,
      bearer: serviceRoleKey,
      body: {
        override: initialSettings.override,
        operator_message: initialSettings.operatorMessage,
      },
    }).catch(() => {});
  }
}
