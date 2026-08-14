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

const realtimeEvent = waitForSnoozeRealtime(staffToken);
const untilAt = new Date(Date.now() + 60 * 60_000).toISOString();
const snoozed = await rpc("staff_snooze_product", {
  _product_id: productId,
  _until_at: untilAt,
  _reason: "Realtime integration test",
}, staffToken);
assert.equal(snoozed.response.ok, true, JSON.stringify(snoozed.data));
const pushed = await realtimeEvent;
assert.equal(pushed.eventType, "INSERT");
assert.equal(pushed.record.location_id, locationId);
assert.equal(pushed.record.product_id, productId);

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
  realtime: "staff JWT -> postgres_changes push",
  staffScope: "operational snooze only",
  adminScope: "structural catalog save",
});

function waitForSnoozeRealtime(accessToken) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(baseUrl);
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    parsed.pathname = "/realtime/v1/websocket";
    parsed.search = new URLSearchParams({ apikey: anonKey, vsn: "1.0.0" }).toString();
    const socket = new WebSocket(parsed.toString());
    const joinRef = "1";
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("timed out waiting for Realtime postgres_changes event"));
    }, 12_000);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({
        topic: "realtime:integration-snoozes",
        event: "phx_join",
        payload: {
          config: {
            broadcast: { ack: false, self: false },
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
      if (message.event === "phx_reply" && message.ref === joinRef) {
        if (message.payload?.status !== "ok") {
          clearTimeout(timer);
          socket.close();
          reject(new Error(`Realtime join failed: ${JSON.stringify(message.payload)}`));
          return;
        }
        // Signal the outer sequence that the subscription is live before the
        // mutation is issued. The promise remains pending for the actual event.
        return;
      }
      if (message.event !== "postgres_changes") return;
      const data = message.payload?.data ?? message.payload;
      const record = data.record ?? data.new ?? {};
      if (record.product_id !== productId) return;
      clearTimeout(timer);
      socket.close();
      resolve({ eventType: data.type || data.eventType || data.event || "INSERT", record });
    });

    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Realtime websocket error"));
    });
  });
}
