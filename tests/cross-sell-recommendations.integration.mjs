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
if (!baseUrl || !anonKey) throw new Error("Local Supabase env is missing");

const locationId = "00000000-0000-4000-8000-000000000001";

async function request(path, { method = "GET", bearer, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      accept: "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { response, data };
}

async function rpc(name, args, bearer) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", bearer, body: args });
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
const catalogResult = await rpc("admin_get_catalog", { _location_id: locationId }, adminToken);
assert.equal(catalogResult.response.ok, true, JSON.stringify(catalogResult.data));

const publicCategoryIds = new Set((catalogResult.data.categories || [])
  .filter((category) => category.status === "published" && category.visible !== false)
  .map((category) => category.id));
const publishedProducts = (catalogResult.data.products || []).filter((product) => (
  product.status === "published" && publicCategoryIds.has(product.categoryId)
));
assert.ok(publishedProducts.length >= 2, "provisional import must provide two published products");
const sourceProduct = publishedProducts.find((product) => (product.modifierGroupIds || []).length > 0);
assert.ok(sourceProduct, "provisional catalog needs a published configurable product");
const targetProduct = publishedProducts.find((product) => product.id !== sourceProduct.id);
assert.ok(targetProduct, "provisional catalog needs a distinct recommendation target");
const sourceCategory = (catalogResult.data.categories || []).find((category) => category.id === sourceProduct.categoryId && category.status === "published");
assert.ok(sourceCategory, "source product needs a published category");
const sourceGroupIds = new Set(sourceProduct.modifierGroupIds || []);
const triggerOption = (catalogResult.data.modifierGroups || [])
  .filter((group) => sourceGroupIds.has(group.id))
  .flatMap((group) => group.options || [])
  .find((option) => option.active);
assert.ok(triggerOption, "provisional catalog needs one active modifier option for ingredient-rule coverage");

const initialConfig = await rpc("admin_get_cross_sell_config", { _location_id: locationId }, adminToken);
assert.equal(initialConfig.response.ok, true, JSON.stringify(initialConfig.data));
const originalIds = initialConfig.data.productCrossSells
  ?.find((entry) => entry.productId === sourceProduct.id)?.suggestedProductIds || [];
const createdRuleIds = [];

try {
  const staffWrite = await rpc("admin_set_product_cross_sells", {
    _location_id: locationId,
    _product_id: sourceProduct.id,
    _suggested_product_ids: [targetProduct.id],
  }, staffToken);
  assert.equal(staffWrite.response.ok, false, "staff must not edit curated recommendations");

  const selfPair = await rpc("admin_set_product_cross_sells", {
    _location_id: locationId,
    _product_id: sourceProduct.id,
    _suggested_product_ids: [sourceProduct.id],
  }, adminToken);
  assert.equal(selfPair.response.ok, false, "a product must not recommend itself");

  const curated = await rpc("admin_set_product_cross_sells", {
    _location_id: locationId,
    _product_id: sourceProduct.id,
    _suggested_product_ids: [targetProduct.id],
  }, adminToken);
  assert.equal(curated.response.ok, true, JSON.stringify(curated.data));

  const categoryRule = await rpc("admin_save_cross_sell_rule", {
    _id: null,
    _location_id: locationId,
    _name: "Integration category rule",
    _trigger_category_id: sourceCategory.id,
    _trigger_modifier_option_id: null,
    _suggested_category_id: null,
    _suggested_product_id: targetProduct.id,
    _max_suggestions: 2,
    _sort: 10,
    _enabled: true,
  }, adminToken);
  assert.equal(categoryRule.response.ok, true, JSON.stringify(categoryRule.data));
  createdRuleIds.push(categoryRule.data.id);

  const optionRule = await rpc("admin_save_cross_sell_rule", {
    _id: null,
    _location_id: locationId,
    _name: "Integration ingredient rule",
    _trigger_category_id: null,
    _trigger_modifier_option_id: triggerOption.id,
    _suggested_category_id: sourceCategory.id,
    _suggested_product_id: null,
    _max_suggestions: 3,
    _sort: 20,
    _enabled: true,
  }, adminToken);
  assert.equal(optionRule.response.ok, true, JSON.stringify(optionRule.data));
  createdRuleIds.push(optionRule.data.id);

  const anonTableRead = await request("/rest/v1/cross_sell_rules?select=id");
  assert.equal(anonTableRead.response.ok, false, "anonymous users must not read rule records directly");

  const publicConfig = await rpc("get_public_cross_sells", { _location_id: locationId });
  assert.equal(publicConfig.response.ok, true, JSON.stringify(publicConfig.data));
  const publicPair = publicConfig.data.productCrossSells.find((entry) => entry.productId === sourceProduct.id);
  assert.deepEqual(publicPair?.suggestedProductIds, [targetProduct.id]);
  assert.equal(publicConfig.data.crossSellRules.some((rule) => rule.id === categoryRule.data.id), true);
  assert.equal(publicConfig.data.crossSellRules.some((rule) => rule.id === optionRule.data.id), true);

  const staffDelete = await rpc("admin_delete_cross_sell_rule", {
    _id: categoryRule.data.id,
    _location_id: locationId,
  }, staffToken);
  assert.equal(staffDelete.response.ok, false, "staff must not delete recommendation rules");

  console.log("Cross-sell integration passed:", {
    curatedPairs: true,
    categoryRules: true,
    ingredientRules: true,
    staffDenied: true,
    anonymousRuleRowsPrivate: true,
  });
} finally {
  for (const id of createdRuleIds) {
    await rpc("admin_delete_cross_sell_rule", { _id: id, _location_id: locationId }, adminToken).catch(() => {});
  }
  await rpc("admin_set_product_cross_sells", {
    _location_id: locationId,
    _product_id: sourceProduct.id,
    _suggested_product_ids: originalIds,
  }, adminToken).catch(() => {});
}
