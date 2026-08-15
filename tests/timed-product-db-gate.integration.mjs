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

function unwrap(data) {
  return Array.isArray(data) ? data[0] : data;
}

const adminToken = await signIn("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const stamp = Date.now();
let categoryId = null;
let productId = null;
let ruleId = null;
let createdOrderId = null;

try {
  const categoryResult = await rpc("admin_save_menu_category", {
    _id: null,
    _location_id: locationId,
    _slug: `dev-timed-gate-${stamp}`,
    _name: `DEV Timed Gate ${stamp}`,
    _description: "temporary integration category",
    _sort: 9999,
    _status: "published",
    _visible: true,
  }, adminToken);
  assert.equal(categoryResult.response.ok, true, JSON.stringify(categoryResult.data));
  categoryId = unwrap(categoryResult.data)?.id;
  assert.ok(categoryId);

  const productResult = await rpc("admin_save_menu_product_configured", {
    _id: null,
    _location_id: locationId,
    _category_id: categoryId,
    _slug: `dev-timed-product-${stamp}`,
    _name: "DEV Timed Product",
    _description: "temporary integration product",
    _base_price_cents: 1234,
    _sort: 9999,
    _status: "published",
    _bestseller: false,
    _orderable_online: true,
    _owner_confirmed: false,
    _modifier_group_ids: [],
    _dietary_tags: [],
    _allergen_ids: [],
  }, adminToken);
  assert.equal(productResult.response.ok, true, JSON.stringify(productResult.data));
  productId = unwrap(productResult.data)?.id;
  assert.ok(productId);

  const ruleResult = await rpc("admin_save_availability_rule", {
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
  assert.equal(ruleResult.response.ok, true, JSON.stringify(ruleResult.data));
  ruleId = unwrap(ruleResult.data)?.id;
  assert.ok(ruleId);

  const payloadAt = (requestedPickupAt) => ({
    locationId,
    source: "web",
    fulfillmentType: "pickup",
    state: "waiting_for_acceptance",
    customerFirstName: "DEV",
    mobile: "+491700000000",
    requestedPickupAt,
    totalCents: 1234,
    submittedAt: new Date().toISOString(),
    items: [{
      productId,
      productNameSnapshot: "client value ignored",
      quantity: 1,
      unitPriceCentsSnapshot: 1234,
      lineTotalCents: 1234,
      selections: [],
      sort: 0,
    }],
  });

  const outsideWindow = await rpc(
    "server_create_verified_order",
    { _payload: payloadAt("2030-01-01T17:00:00+01:00") },
    serviceRoleKey,
    serviceRoleKey,
  );
  assert.equal(outsideWindow.response.ok, false, "database must reject a web item outside its configured pickup-time window");
  assert.match(JSON.stringify(outsideWindow.data), /product unavailable for order pickup time/i);

  const insideWindow = await rpc(
    "server_create_verified_order",
    { _payload: payloadAt("2030-01-01T19:00:00+01:00") },
    serviceRoleKey,
    serviceRoleKey,
  );
  assert.equal(insideWindow.response.ok, true, JSON.stringify(insideWindow.data));
  createdOrderId = unwrap(insideWindow.data)?.id;
  assert.ok(createdOrderId);

  console.log("Timed product DB gate passed:", {
    outsideWindow: "rejected at 17:00",
    allowedWindow: "accepted at 19:00",
    enforcement: "order_items trigger -> server_is_product_available",
  });
} finally {
  for (const [table, id] of [
    ["orders", createdOrderId],
    ["availability_rules", ruleId],
    ["menu_products", productId],
    ["menu_categories", categoryId],
  ]) {
    if (!id) continue;
    await request(`/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      apiKey: serviceRoleKey,
      bearer: serviceRoleKey,
    }).catch(() => {});
  }
}
