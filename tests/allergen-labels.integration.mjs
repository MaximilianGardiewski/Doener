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

const staffCreate = await rpc("admin_save_allergen", {
  _id: null,
  _code: "NOPE",
  _name: "Staff darf das nicht",
}, staffToken);
assert.equal(staffCreate.response.ok, false, "staff must not create allergen definitions");

const allergenResult = await rpc("admin_save_allergen", {
  _id: null,
  _code: `DEV${Date.now()}`,
  _name: `DEV Test Allergen ${Date.now()}`,
}, adminToken);
assert.equal(allergenResult.response.ok, true, JSON.stringify(allergenResult.data));
const allergen = Array.isArray(allergenResult.data) ? allergenResult.data[0] : allergenResult.data;
assert.ok(allergen?.id);

const groupResult = await rpc("admin_save_modifier_group", {
  _id: null,
  _location_id: locationId,
  _name: `DEV Allergen Options ${Date.now()}`,
  _min_selections: 0,
  _max_selections: 1,
  _sort: 995,
}, adminToken);
assert.equal(groupResult.response.ok, true, JSON.stringify(groupResult.data));
const group = Array.isArray(groupResult.data) ? groupResult.data[0] : groupResult.data;
assert.ok(group?.id);

const optionResult = await rpc("admin_save_modifier_option_configured", {
  _id: null,
  _group_id: group.id,
  _name: "DEV allergen-bearing extra",
  _price_delta_cents: 125,
  _default_selected: false,
  _active: true,
  _sort: 10,
  _allergen_ids: [allergen.id],
}, adminToken);
assert.equal(optionResult.response.ok, true, JSON.stringify(optionResult.data));
assert.ok(optionResult.data?.id);
const optionId = optionResult.data.id;
assert.deepEqual(optionResult.data.allergenIds, [allergen.id]);

const slug = `dev-allergen-product-${Date.now()}`;
const productResult = await rpc("admin_save_menu_product_configured", {
  _id: null,
  _location_id: locationId,
  _category_id: categoryId,
  _slug: slug,
  _name: "DEV Structured Allergen Product",
  _description: "temporary integration row only",
  _base_price_cents: 999,
  _sort: 999,
  _status: "published",
  _bestseller: false,
  _orderable_online: true,
  _owner_confirmed: false,
  _modifier_group_ids: [group.id],
  _dietary_tags: ["VEGETARIAN", "spicy", "vegetarian"],
  _allergen_ids: [allergen.id],
}, adminToken);
assert.equal(productResult.response.ok, true, JSON.stringify(productResult.data));
assert.ok(productResult.data?.id);
const productId = productResult.data.id;
assert.deepEqual(productResult.data.dietaryTags, ["spicy", "vegetarian"]);
assert.deepEqual(productResult.data.allergenIds, [allergen.id]);

const staffLabelMutation = await rpc("admin_set_product_labels", {
  _product_id: productId,
  _dietary_tags: ["vegan"],
  _allergen_ids: [],
}, staffToken);
assert.equal(staffLabelMutation.response.ok, false, "staff must not edit structural product labels");

const checkout = await rpc(
  "server_get_checkout_product",
  { _product_id: productId, _at: new Date().toISOString() },
  serviceRoleKey,
  serviceRoleKey,
);
assert.equal(checkout.response.ok, true, JSON.stringify(checkout.data));
assert.deepEqual(checkout.data.dietaryTags, ["spicy", "vegetarian"]);
assert.equal(checkout.data.allergens.length, 1);
assert.equal(checkout.data.allergens[0].id, allergen.id);
const checkoutGroup = checkout.data.modifierGroups.find((candidate) => candidate.id === group.id);
assert.ok(checkoutGroup);
const checkoutOption = checkoutGroup.options.find((candidate) => candidate.id === optionId);
assert.ok(checkoutOption);
assert.equal(checkoutOption.allergens.length, 1);
assert.equal(checkoutOption.allergens[0].id, allergen.id);
assert.equal(checkoutOption.priceDeltaCents, 125);

const publicMenu = await rpc("get_public_menu", {
  _location_id: locationId,
  _at: new Date().toISOString(),
});
assert.equal(publicMenu.response.ok, true, JSON.stringify(publicMenu.data));
const publicProduct = publicMenu.data.categories
  .flatMap((category) => category.products || [])
  .find((product) => product.id === productId);
assert.ok(publicProduct, "published temporary product must appear in public menu snapshot");
assert.deepEqual(publicProduct.dietaryTags, ["spicy", "vegetarian"]);
assert.equal(publicProduct.allergens[0]?.id, allergen.id);
assert.equal(
  publicProduct.modifierGroups.flatMap((candidate) => candidate.options || []).find((candidate) => candidate.id === optionId)?.allergens[0]?.id,
  allergen.id,
);

const adminCatalog = await rpc("admin_get_catalog", { _location_id: locationId }, adminToken);
assert.equal(adminCatalog.response.ok, true, JSON.stringify(adminCatalog.data));
assert.equal(adminCatalog.data.allergens.some((candidate) => candidate.id === allergen.id), true);
assert.deepEqual(adminCatalog.data.products.find((candidate) => candidate.id === productId)?.allergenIds, [allergen.id]);
assert.deepEqual(adminCatalog.data.products.find((candidate) => candidate.id === productId)?.dietaryTags, ["spicy", "vegetarian"]);
assert.deepEqual(
  adminCatalog.data.modifierGroups
    .flatMap((candidate) => candidate.options || [])
    .find((candidate) => candidate.id === optionId)?.allergenIds,
  [allergen.id],
);

const invalidTag = await rpc("admin_set_product_labels", {
  _product_id: productId,
  _dietary_tags: ["not a stable key"],
  _allergen_ids: [allergen.id],
}, adminToken);
assert.equal(invalidTag.response.ok, false, "unstable/free-form dietary labels must be rejected by DB validation");

// Delete product/group first so FK assignments disappear before the temporary
// allergen definition is removed. Nothing from this test survives the run.
for (const [table, id] of [["menu_products", productId], ["modifier_groups", group.id], ["allergens", allergen.id]]) {
  const cleanup = await request(`/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE",
    apiKey: serviceRoleKey,
    bearer: serviceRoleKey,
  });
  assert.equal(cleanup.response.ok, true, `${table} cleanup failed: ${JSON.stringify(cleanup.data)}`);
}

console.log("Structured allergen + dietary-label integration passed:", {
  sourcePolicy: "no inferred Mcello allergen assignments",
  productAllergen: "explicit admin assignment",
  modifierAllergen: "explicit option contribution",
  dietaryTags: ["spicy", "vegetarian"],
  publicSnapshot: true,
  checkoutSnapshot: true,
  staffBoundary: "structural writes denied",
});
