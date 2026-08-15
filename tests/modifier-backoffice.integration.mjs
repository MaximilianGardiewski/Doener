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

async function request(path, { method = "GET", apiKey = anonKey, bearer, body, headers: extraHeaders = {} } = {}) {
  const headers = { apikey: apiKey, accept: "application/json", ...extraHeaders };
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

const initialCatalog = await rpc("admin_get_catalog", { _location_id: locationId }, adminToken);
assert.equal(initialCatalog.response.ok, true, JSON.stringify(initialCatalog.data));
assert.ok(Array.isArray(initialCatalog.data.modifierGroups), "admin catalog must expose central modifier groups");
const initialProduct = initialCatalog.data.products.find((product) => product.id === productId);
assert.ok(initialProduct, "seed product required for assignment proof");
const initialGroupIds = [...(initialProduct.modifierGroupIds || [])];

const staffCreate = await rpc("admin_save_modifier_group", {
  _id: null,
  _location_id: locationId,
  _name: "Staff darf das nicht",
  _min_selections: 0,
  _max_selections: 1,
  _sort: 999,
}, staffToken);
assert.equal(staffCreate.response.ok, false, "staff must not create structural modifier groups");

const groupResult = await rpc("admin_save_modifier_group", {
  _id: null,
  _location_id: locationId,
  _name: "DEV Test Extras",
  _min_selections: 0,
  _max_selections: 2,
  _sort: 990,
}, adminToken);
assert.equal(groupResult.response.ok, true, JSON.stringify(groupResult.data));
const group = Array.isArray(groupResult.data) ? groupResult.data[0] : groupResult.data;
assert.ok(group?.id);

const freeOptionResult = await rpc("admin_save_modifier_option", {
  _id: null,
  _group_id: group.id,
  _name: "DEV Ohne Zwiebeln",
  _price_delta_cents: 0,
  _default_selected: false,
  _active: true,
  _sort: 10,
}, adminToken);
assert.equal(freeOptionResult.response.ok, true, JSON.stringify(freeOptionResult.data));
const freeOption = Array.isArray(freeOptionResult.data) ? freeOptionResult.data[0] : freeOptionResult.data;
assert.ok(freeOption?.id);

const paidOptionResult = await rpc("admin_save_modifier_option", {
  _id: null,
  _group_id: group.id,
  _name: "DEV Extra Käse",
  _price_delta_cents: 150,
  _default_selected: false,
  _active: true,
  _sort: 20,
}, adminToken);
assert.equal(paidOptionResult.response.ok, true, JSON.stringify(paidOptionResult.data));
const paidOption = Array.isArray(paidOptionResult.data) ? paidOptionResult.data[0] : paidOptionResult.data;
assert.ok(paidOption?.id);

const assignment = await rpc("admin_set_product_modifier_groups", {
  _product_id: productId,
  _group_ids: [...initialGroupIds, group.id],
}, adminToken);
assert.equal(assignment.response.ok, true, JSON.stringify(assignment.data));
assert.equal(assignment.data.modifierGroupIds.includes(group.id), true);

const updatedCatalog = await rpc("admin_get_catalog", { _location_id: locationId }, adminToken);
assert.equal(updatedCatalog.response.ok, true, JSON.stringify(updatedCatalog.data));
const catalogGroup = updatedCatalog.data.modifierGroups.find((candidate) => candidate.id === group.id);
assert.ok(catalogGroup);
assert.equal(catalogGroup.options.length, 2);
assert.equal(catalogGroup.options.find((option) => option.id === paidOption.id)?.priceDeltaCents, 150);
assert.equal(updatedCatalog.data.products.find((product) => product.id === productId)?.modifierGroupIds.includes(group.id), true);

const checkoutSnapshot = await rpc(
  "server_get_checkout_product",
  { _product_id: productId, _at: new Date().toISOString() },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(checkoutSnapshot.response.ok, true, JSON.stringify(checkoutSnapshot.data));
const checkoutGroup = checkoutSnapshot.data.modifierGroups.find((candidate) => candidate.id === group.id);
assert.ok(checkoutGroup, "new central group must flow into the checkout configurator snapshot");
assert.equal(checkoutGroup.maxSelections, 2);
assert.equal(checkoutGroup.options.find((option) => option.id === paidOption.id)?.priceDeltaCents, 150);

const staffOperational = await rpc("staff_get_operational_catalog", { _location_id: locationId }, staffToken);
assert.equal(staffOperational.response.ok, true, JSON.stringify(staffOperational.data));
assert.ok(staffOperational.data.modifierGroups.some((candidate) => candidate.id === group.id), "staff must see the option operationally without gaining structural write rights");

// Browser admin calls these RPCs cross-origin from the local Mcello runtime.
// The public anon key is not a secret; the admin JWT remains the authorization authority.
const corsProbe = await request("/rest/v1/rpc/admin_get_catalog", {
  method: "POST",
  bearer: adminToken,
  body: { _location_id: locationId },
  headers: { Origin: "http://127.0.0.1:4173" },
});
assert.equal(corsProbe.response.ok, true, JSON.stringify(corsProbe.data));
const allowOrigin = corsProbe.response.headers.get("access-control-allow-origin");
assert.ok(allowOrigin === "*" || allowOrigin === "http://127.0.0.1:4173", `expected browser-compatible CORS, got ${allowOrigin}`);

// Restore shared seed state before removing the temporary central group.
const restore = await rpc("admin_set_product_modifier_groups", {
  _product_id: productId,
  _group_ids: initialGroupIds,
}, adminToken);
assert.equal(restore.response.ok, true, JSON.stringify(restore.data));

const cleanup = await request(`/rest/v1/modifier_groups?id=eq.${group.id}`, {
  method: "DELETE",
  apiKey: serviceRoleKey,
  bearer: serviceRoleKey,
});
assert.equal(cleanup.response.ok, true, JSON.stringify(cleanup.data));

console.log("Modifier backoffice integration passed:", {
  group: "central reusable group",
  options: 2,
  paidExtraCents: 150,
  assignment: "admin -> product -> checkout snapshot",
  staffBoundary: "read/operate yes, structural write no",
  browserCors: allowOrigin,
});
