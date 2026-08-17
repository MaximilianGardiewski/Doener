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

async function shopState(at = "2030-01-01T12:00:00+01:00") {
  const result = await rpc("server_get_shop_state", { _location_id: locationId, _at: at });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return result.data;
}

async function acceptsOrder(at = "2030-01-01T12:00:00+01:00") {
  const result = await rpc("server_shop_accepts_order", { _location_id: locationId, _at: at });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return Boolean(result.data);
}

const adminToken = await signIn("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const staffToken = await signIn("kds-staff@mcello.local", "LocalOnly-Staff-2026!");
const initial = await rpc("admin_get_ordering_schedule", { _location_id: locationId }, adminToken, anonKey);
assert.equal(initial.response.ok, true, JSON.stringify(initial.data));

const initialWeekly = (initial.data.openingHours || []).map((row) => ({
  weekday: Number(row.weekday),
  opensAt: row.opensAt,
  closesAt: row.closesAt,
  closed: Boolean(row.closed),
  sort: Number(row.sort || 0),
}));
const initialOverride = initial.data.orderingSettings?.override || "auto";
const initialMessage = initial.data.orderingSettings?.operatorMessage || null;
const allClosed = Array.from({ length: 7 }, (_, index) => ({
  weekday: index + 1,
  opensAt: null,
  closesAt: null,
  closed: true,
  sort: 0,
}));

try {
  const closeSchedule = await rpc("admin_replace_weekly_opening_hours", {
    _location_id: locationId,
    _rows: allClosed,
  }, adminToken, anonKey);
  assert.equal(closeSchedule.response.ok, true, JSON.stringify(closeSchedule.data));

  const staffAdminAttempt = await rpc("admin_set_shop_override", {
    _location_id: locationId,
    _override: "force_open",
    _operator_message: "Staff darf das nicht",
  }, staffToken, anonKey);
  assert.equal(staffAdminAttempt.response.ok, false, "staff must not execute the admin override RPC");

  const staffLegacyAttempt = await rpc("staff_set_shop_override", {
    _location_id: locationId,
    _override: "force_open",
    _operator_message: "Staff darf das auch hier nicht",
  }, staffToken, anonKey);
  assert.equal(staffLegacyAttempt.response.ok, false, "staff must not force-open through the operational RPC");

  const forceOpen = await rpc("admin_set_shop_override", {
    _location_id: locationId,
    _override: "force_open",
    _operator_message: "Admin-Sonderöffnung",
  }, adminToken, anonKey);
  assert.equal(forceOpen.response.ok, true, JSON.stringify(forceOpen.data));
  assert.equal(forceOpen.data.override, "force_open");
  assert.equal(forceOpen.data.operatorMessage, "Admin-Sonderöffnung");
  assert.equal(await acceptsOrder(), true, "admin force-open must override a closed weekly schedule");
  const openState = await shopState();
  assert.equal(openState.override, "force_open");
  assert.equal(openState.operatorMessage, "Admin-Sonderöffnung");

  for (const [override, message] of [
    ["force_closed", "Admin geschlossen"],
    ["pause", "Kurze Bestellpause"],
    ["today_closed", "Heute geschlossen"],
  ]) {
    const changed = await rpc("admin_set_shop_override", {
      _location_id: locationId,
      _override: override,
      _operator_message: message,
    }, adminToken, anonKey);
    assert.equal(changed.response.ok, true, JSON.stringify(changed.data));
    assert.equal(await acceptsOrder(), false, `${override} must block new orders`);
    const state = await shopState();
    assert.equal(state.override, override);
    assert.equal(state.operatorMessage, message);
  }

  const rush = await rpc("admin_set_shop_override", {
    _location_id: locationId,
    _override: "rush",
    _operator_message: "Rush ohne Öffnungsplan",
  }, adminToken, anonKey);
  assert.equal(rush.response.ok, true, JSON.stringify(rush.data));
  assert.equal(await acceptsOrder(), false, "rush must not bypass a closed structural schedule");

  const automatic = await rpc("admin_set_shop_override", {
    _location_id: locationId,
    _override: "auto",
    _operator_message: null,
  }, adminToken, anonKey);
  assert.equal(automatic.response.ok, true, JSON.stringify(automatic.data));
  assert.equal(await acceptsOrder(), false, "auto must obey the closed structural schedule");

  const tooLong = await rpc("admin_set_shop_override", {
    _location_id: locationId,
    _override: "force_closed",
    _operator_message: "x".repeat(181),
  }, adminToken, anonKey);
  assert.equal(tooLong.response.ok, false, "operator message must remain bounded");
} finally {
  const restoreHours = await rpc("admin_replace_weekly_opening_hours", {
    _location_id: locationId,
    _rows: initialWeekly,
  }, adminToken, anonKey);
  assert.equal(restoreHours.response.ok, true, JSON.stringify(restoreHours.data));

  const restoreOverride = await rpc("admin_set_shop_override", {
    _location_id: locationId,
    _override: initialOverride,
    _operator_message: initialMessage,
  }, adminToken, anonKey);
  assert.equal(restoreOverride.response.ok, true, JSON.stringify(restoreOverride.data));
}

console.log("Admin-only shop override integration passed.");
