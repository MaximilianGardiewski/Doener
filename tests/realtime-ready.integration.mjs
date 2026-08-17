import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

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
const categoryId = "00000000-0000-4000-8000-000000000010";
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

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "supabase_db_business-web-factory", "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function realtimeProbe(accessToken) {
  let resolveReady;
  let rejectReady;
  let resolveEvent;
  let rejectEvent;
  let settled = false;
  const history = [];
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const event = new Promise((resolve, reject) => { resolveEvent = resolve; rejectEvent = reject; });

  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/realtime/v1/websocket";
  url.search = new URLSearchParams({ apikey: anonKey, vsn: "1.0.0" }).toString();

  const socket = new WebSocket(url.toString());
  const topic = `realtime:ready-proof-${Date.now()}`;
  const joinRef = "1";
  let channelJoined = false;

  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    socket.close();
    const error = new Error(`Realtime readiness/push timeout; messages=${JSON.stringify(history.slice(-20))}`);
    rejectReady(error);
    rejectEvent(error);
  }, 20_000);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      topic,
      event: "phx_join",
      payload: {
        config: {
          broadcast: { ack: false, self: false, replication_ready: true },
          presence: { enabled: false },
          postgres_changes: [{
            event: "*",
            schema: "public",
            table: "snoozes",
            filter: `location_id=eq.${locationId}`,
          }],
          private: false,
        },
        access_token: accessToken,
      },
      ref: joinRef,
      join_ref: joinRef,
    }));
  });

  socket.addEventListener("message", (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    history.push({
      event: message.event,
      status: message.payload?.status,
      extension: message.payload?.extension,
      message: message.payload?.message,
      response: message.payload?.response,
    });

    if (message.event === "phx_reply" && message.ref === joinRef) {
      if (message.payload?.status !== "ok") {
        const error = new Error(`Realtime join rejected: ${JSON.stringify(message.payload)}`);
        rejectReady(error);
        rejectEvent(error);
        return;
      }
      channelJoined = true;
      // Deliberately DO NOT resolve ready here. A Phoenix join acknowledges the
      // channel request before the legacy postgres_changes manager has finished
      // persisting the subscription row used by apply_rls/list_changes.
      return;
    }

    if (message.event === "system") {
      if (message.payload?.status !== "ok") {
        const error = new Error(`Realtime system error: ${JSON.stringify(message.payload)}`);
        rejectReady(error);
        rejectEvent(error);
        return;
      }
      if (message.payload?.extension === "postgres_changes") {
        resolveReady({ channelJoined, history });
      }
      return;
    }

    const wireEvent = String(message.event || "").toLowerCase();
    let change = null;
    if (wireEvent === "postgres_changes") {
      const data = message.payload?.data ?? message.payload ?? {};
      change = {
        eventType: String(data.type || data.eventType || data.event || "").toUpperCase(),
        record: data.record ?? data.new ?? {},
      };
    } else if (["insert", "update", "delete"].includes(wireEvent)) {
      const payload = message.payload ?? {};
      change = { eventType: wireEvent.toUpperCase(), record: payload.record ?? payload.new ?? {} };
    }

    if (!change || change.record.product_id !== productId || settled) return;
    settled = true;
    clearTimeout(timeout);
    socket.close();
    resolveEvent(change);
  });

  socket.addEventListener("error", () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    const error = new Error("Realtime websocket error");
    rejectReady(error);
    rejectEvent(error);
  });

  return { ready, event, history, close: () => socket.close() };
}

const adminToken = await signIn("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const staffToken = await signIn("kds-staff@mcello.local", "LocalOnly-Staff-2026!");

// Backend authorization remains the authority, independently of Realtime.
const staffCatalog = await rpc("staff_get_operational_catalog", { _location_id: locationId }, staffToken);
assert.equal(staffCatalog.response.ok, true, JSON.stringify(staffCatalog.data));

const staffStructuralWrite = await rpc("admin_save_menu_product", {
  _id: null,
  _location_id: locationId,
  _category_id: categoryId,
  _slug: "staff-must-not-create-realtime-proof",
  _name: "Staff must not create",
  _description: "authorization proof",
  _base_price_cents: 100,
  _sort: 999,
  _status: "draft",
  _bestseller: false,
  _orderable_online: false,
  _owner_confirmed: false,
}, staffToken);
assert.equal(staffStructuralWrite.response.ok, false, "staff must not receive admin catalog rights");

const adminCatalog = await rpc("admin_get_catalog", { _location_id: locationId }, adminToken);
assert.equal(adminCatalog.response.ok, true, JSON.stringify(adminCatalog.data));

const probe = realtimeProbe(staffToken);
const readyState = await probe.ready;
assert.equal(readyState.channelJoined, true);
assert.equal(
  readyState.history.some((entry) => entry.extension === "postgres_changes" && entry.status === "ok"),
  true,
  "Postgres subscription readiness must be explicitly confirmed before mutating data",
);

// This is the key regression guard for the race we found: after Realtime says
// "Subscribed to PostgreSQL", its RLS subscription row must already exist.
const subscriptionCount = Number(psql(`
  select count(*)
  from realtime.subscription
  where entity = 'public.snoozes'::regclass
`));
assert.ok(subscriptionCount >= 1, `expected persisted realtime.subscription after readiness, got ${subscriptionCount}`);

const untilAt = new Date(Date.now() + 60 * 60_000).toISOString();
const snoozed = await rpc("staff_snooze_product", {
  _product_id: productId,
  _until_at: untilAt,
  _reason: "Realtime readiness integration proof",
}, staffToken);
assert.equal(snoozed.response.ok, true, JSON.stringify(snoozed.data));

const change = await probe.event;
assert.equal(change.eventType, "INSERT");
assert.equal(change.record.location_id, locationId);
assert.equal(change.record.product_id, productId);

const staffVisible = await request(
  `/rest/v1/snoozes?location_id=eq.${locationId}&product_id=eq.${productId}&select=id,location_id,product_id,until_at`,
  { bearer: staffToken },
);
assert.equal(staffVisible.response.ok, true, JSON.stringify(staffVisible.data));
assert.equal(staffVisible.data.length, 1, "same staff JWT must see the row through RLS");

const unavailable = await rpc(
  "server_is_product_available",
  { _product_id: productId, _at: new Date().toISOString() },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(unavailable.response.ok, true, JSON.stringify(unavailable.data));
assert.equal(unavailable.data, false, "active product snooze must block checkout availability");

const unsnoozed = await rpc("staff_unsnooze_product", { _product_id: productId }, staffToken);
assert.equal(unsnoozed.response.ok, true, JSON.stringify(unsnoozed.data));

console.log("Realtime readiness + backoffice boundary proof passed:", {
  readiness: "postgres_changes system confirmation",
  subscriptionRows: subscriptionCount,
  push: "filtered snooze INSERT delivered",
  staffScope: "operational only",
  adminScope: "structural read/write authority",
});
