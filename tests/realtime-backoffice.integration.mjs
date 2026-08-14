import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

function envValue(name) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseUrl = envValue("SUPABASE_URL")?.replace(/\/$/, "");
const anonKey = envValue("SUPABASE_ANON_KEY");
const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
if (!baseUrl || !anonKey || !serviceRoleKey) throw new Error("Local Supabase env is missing");

const locationId = "00000000-0000-4000-8000-000000000001";
const categoryId = "00000000-0000-4000-8000-000000000010";
const productId = "00000000-0000-4000-8000-000000000100";
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

const adminToken = await signIn("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const staffToken = await signIn("kds-staff@mcello.local", "LocalOnly-Staff-2026!");

const operational = await rpc("staff_get_operational_catalog", { _location_id: locationId }, staffToken);
assert.equal(operational.response.ok, true, JSON.stringify(operational.data));
assert.ok(Array.isArray(operational.data.products));
assert.ok(Array.isArray(operational.data.modifierGroups));

const directSnoozeRead = await request(
  `/rest/v1/snoozes?location_id=eq.${locationId}&select=id,location_id,product_id,modifier_option_id,until_at`,
  { bearer: staffToken },
);
assert.equal(directSnoozeRead.response.ok, true, `staff must have direct SELECT for Realtime RLS: ${JSON.stringify(directSnoozeRead.data)}`);

const staffAdminAttempt = await rpc("admin_save_menu_product", {
  _id: null,
  _location_id: locationId,
  _category_id: categoryId,
  _slug: "staff-must-not-create",
  _name: "Staff must not create",
  _description: "authorization test",
  _base_price_cents: 100,
  _sort: 999,
  _status: "draft",
  _bestseller: false,
  _orderable_online: false,
  _owner_confirmed: false,
}, staffToken);
assert.equal(staffAdminAttempt.response.ok, false, "staff must not execute structural admin save");

const adminCreated = await rpc("admin_save_menu_product", {
  _id: null,
  _location_id: locationId,
  _category_id: categoryId,
  _slug: `admin-realtime-test-${Date.now()}`,
  _name: "DEV Admin Realtime Test",
  _description: "temporary integration row",
  _base_price_cents: 123,
  _sort: 999,
  _status: "draft",
  _bestseller: false,
  _orderable_online: false,
  _owner_confirmed: false,
}, adminToken);
assert.equal(adminCreated.response.ok, true, JSON.stringify(adminCreated.data));
const createdProduct = Array.isArray(adminCreated.data) ? adminCreated.data[0] : adminCreated.data;
assert.ok(createdProduct?.id);

const adminCatalog = await rpc("admin_get_catalog", { _location_id: locationId }, adminToken);
assert.equal(adminCatalog.response.ok, true, JSON.stringify(adminCatalog.data));
assert.equal(adminCatalog.data.products.some((product) => product.id === createdProduct.id), true);

// Run two independent subscriptions against the same staff JWT. This keeps RLS
// identical while isolating whether the server-side UUID location filter is the
// gate that suppresses the WAL change.
const realtimeUnfiltered = createSnoozeRealtimeProbe(staffToken, {
  name: "unfiltered",
  filter: undefined,
});
const realtimeFiltered = createSnoozeRealtimeProbe(staffToken, {
  name: "location-filtered",
  filter: `location_id=eq.${locationId}`,
});
await Promise.all([realtimeUnfiltered.ready, realtimeFiltered.ready]);
await sleep(1000);

const subscriptionDiagnostics = inspectRealtimeSubscriptionState();
console.log("Realtime subscription diagnostics (safe):", subscriptionDiagnostics);

const untilAt = new Date(Date.now() + 60 * 60_000).toISOString();
const snoozed = await rpc("staff_snooze_product", {
  _product_id: productId,
  _until_at: untilAt,
  _reason: "Realtime integration test",
}, staffToken);
assert.equal(snoozed.response.ok, true, JSON.stringify(snoozed.data));

const visibleAfterInsert = await request(
  `/rest/v1/snoozes?location_id=eq.${locationId}&product_id=eq.${productId}&select=id,location_id,product_id,until_at`,
  { bearer: staffToken },
);
assert.equal(visibleAfterInsert.response.ok, true, JSON.stringify(visibleAfterInsert.data));
assert.equal(visibleAfterInsert.data.length, 1, "staff JWT must see the inserted snooze through RLS after the RPC");

const [unfilteredResult, filteredResult] = await Promise.allSettled([
  realtimeUnfiltered.event,
  realtimeFiltered.event,
]);

assert.equal(
  unfilteredResult.status,
  "fulfilled",
  `unfiltered Realtime subscription did not receive the RLS-visible snooze; diagnostics=${JSON.stringify(subscriptionDiagnostics)}; reason=${unfilteredResult.status === "rejected" ? unfilteredResult.reason?.message : "unknown"}`,
);
assert.equal(unfilteredResult.value.eventType, "INSERT");
assert.equal(unfilteredResult.value.record.location_id, locationId);
assert.equal(unfilteredResult.value.record.product_id, productId);

assert.equal(
  filteredResult.status,
  "fulfilled",
  `unfiltered push succeeded but location_id server filter suppressed the same row; diagnostics=${JSON.stringify(subscriptionDiagnostics)}; reason=${filteredResult.status === "rejected" ? filteredResult.reason?.message : "unknown"}`,
);
assert.equal(filteredResult.value.eventType, "INSERT");
assert.equal(filteredResult.value.record.location_id, locationId);
assert.equal(filteredResult.value.record.product_id, productId);

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

const optionSnooze = await rpc("staff_snooze_modifier_option", {
  _option_id: optionId,
  _until_at: untilAt,
  _reason: "Option unavailable",
}, staffToken);
assert.equal(optionSnooze.response.ok, true, JSON.stringify(optionSnooze.data));
const productSnapshot = await rpc(
  "server_get_checkout_product",
  { _product_id: productId, _at: new Date().toISOString() },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(productSnapshot.response.ok, true, JSON.stringify(productSnapshot.data));
const option = productSnapshot.data.modifierGroups.flatMap((group) => group.options).find((candidate) => candidate.id === optionId);
assert.equal(option?.soldOut, true, "modifier snooze must flow into checkout snapshot");
await rpc("staff_unsnooze_modifier_option", { _option_id: optionId }, staffToken);

const cleanup = await request(`/rest/v1/menu_products?id=eq.${createdProduct.id}`, {
  method: "DELETE",
  apiKey: serviceRoleKey,
  bearer: serviceRoleKey,
});
assert.equal(cleanup.response.ok, true, JSON.stringify(cleanup.data));

console.log("Realtime + backoffice integration passed:", {
  realtime: "staff JWT -> unfiltered + location-filtered pushed database change",
  staffScope: "operational snooze only",
  adminScope: "structural catalog save",
});

function inspectRealtimeSubscriptionState() {
  try {
    const metadataSql = `
      select
        subscription_id::text || '|' ||
        entity::text || '|' ||
        claims_role::text || '|' ||
        coalesce(claims->>'sub','') || '|' ||
        coalesce(filters::text,'') || '|' ||
        coalesce(action_filter,'')
      from realtime.subscription
      where entity = 'public.snoozes'::regclass
      order by subscription_id
    `;
    const metadata = runLocalPsql(metadataSql).split("\n").filter(Boolean);

    const identitySql = `
      begin;
      select set_config(
        'request.jwt.claims',
        (select claims::text from realtime.subscription where entity = 'public.snoozes'::regclass limit 1),
        true
      ) is not null;
      set local role authenticated;
      select coalesce(public.current_user_id()::text, 'NULL') || '|' || public.is_staff()::text;
      rollback;
    `;
    const identity = runLocalPsql(identitySql)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("|") || line === "t" || line === "f");

    return { metadata, identity };
  } catch (error) {
    return { unavailable: String(error?.message || error) };
  }
}

function runLocalPsql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_business-web-factory",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function normalizeWireChange(message) {
  const wireEvent = String(message.event || "").toLowerCase();
  if (wireEvent === "postgres_changes") {
    const data = message.payload?.data ?? message.payload ?? {};
    return {
      eventType: String(data.type || data.eventType || data.event || "INSERT").toUpperCase(),
      record: data.record ?? data.new ?? {},
    };
  }
  if (["insert", "update", "delete"].includes(wireEvent)) {
    const payload = message.payload ?? {};
    return {
      eventType: wireEvent.toUpperCase(),
      record: payload.record ?? payload.new ?? {},
    };
  }
  return null;
}

function createSnoozeRealtimeProbe(accessToken, { name, filter }) {
  let resolveReady;
  let rejectReady;
  let resolveEvent;
  let rejectEvent;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const event = new Promise((resolve, reject) => { resolveEvent = resolve; rejectEvent = reject; });
  const messageHistory = [];
  let settled = false;

  const parsed = new URL(baseUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = "/realtime/v1/websocket";
  parsed.search = new URLSearchParams({ apikey: anonKey, vsn: "1.0.0" }).toString();
  const socket = new WebSocket(parsed.toString());
  const joinRef = "1";
  const topic = `realtime:integration-snoozes-${name}`;
  const changeConfig = {
    event: "*",
    schema: "public",
    table: "snoozes",
  };
  if (filter) changeConfig.filter = filter;

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    socket.close();
    const compact = compactHistory(messageHistory);
    const error = new Error(`${name} timed out waiting for Realtime database change; messages=${JSON.stringify(compact)}`);
    rejectReady(error);
    rejectEvent(error);
  }, 15_000);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      topic,
      event: "phx_join",
      payload: {
        config: {
          broadcast: { ack: false, self: false, replication_ready: true },
          presence: { enabled: false },
          postgres_changes: [changeConfig],
          private: false,
        },
        access_token: accessToken,
      },
      ref: joinRef,
      join_ref: joinRef,
    }));
  });

  socket.addEventListener("message", (messageEvent) => {
    let message;
    try { message = JSON.parse(messageEvent.data); } catch { return; }
    messageHistory.push(message);

    if (message.event === "phx_reply" && message.ref === joinRef) {
      if (message.payload?.status !== "ok") {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        const error = new Error(`${name} Realtime join failed: ${JSON.stringify(message.payload)}`);
        rejectReady(error);
        rejectEvent(error);
        return;
      }
      const confirmed = message.payload?.response?.postgres_changes;
      if (Array.isArray(confirmed) && confirmed.length > 0) resolveReady();
      return;
    }

    if (message.event === "system") {
      if (message.payload?.status === "ok") resolveReady();
      else {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        const error = new Error(`${name} Realtime system error: ${JSON.stringify(message.payload)}`);
        rejectReady(error);
        rejectEvent(error);
      }
      return;
    }

    const change = normalizeWireChange(message);
    if (!change || change.record.product_id !== productId) return;
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    socket.close();
    resolveEvent(change);
  });

  socket.addEventListener("error", () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    const error = new Error(`${name} Realtime websocket error; messages=${JSON.stringify(compactHistory(messageHistory))}`);
    rejectReady(error);
    rejectEvent(error);
  });

  return { ready, event, messageHistory };
}

function compactHistory(messageHistory) {
  return messageHistory.slice(-20).map((entry) => ({
    event: entry.event,
    topic: entry.topic,
    status: entry.payload?.status,
    response: entry.payload?.response,
    extension: entry.payload?.extension,
    message: entry.payload?.message,
    table: entry.payload?.table ?? entry.payload?.data?.table,
    type: entry.payload?.type ?? entry.payload?.data?.type,
  }));
}
