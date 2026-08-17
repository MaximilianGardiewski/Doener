import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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
const suffix = randomUUID().slice(0, 8);
const categorySlug = `d020-cat-${suffix}`;
const productSlug = `d020-product-${suffix}`;
let categoryId = null;
let productId = null;
let groupId = null;
let uploadedObjectPath = null;
let imageRegistered = false;

async function request(path, { method = "GET", apiKey = anonKey, bearer, body, headers = {} } = {}) {
  const requestHeaders = { apikey: apiKey, accept: "application/json", ...headers };
  if (bearer) requestHeaders.authorization = `Bearer ${bearer}`;
  let payload = body;
  if (body !== undefined && !(body instanceof Uint8Array) && !Buffer.isBuffer(body)) {
    requestHeaders["content-type"] = requestHeaders["content-type"] || "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers: requestHeaders, body: payload });
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  let data = raw;
  if (contentType.includes("json") || raw.startsWith("{") || raw.startsWith("[") || raw === "null") {
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  }
  return { response, data };
}

async function rpc(name, args, bearer, apiKey = anonKey) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", apiKey, bearer, body: args });
}

async function signIn(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return result.data.access_token;
}

function encodedStoragePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function deleteRows(table, query, adminToken) {
  const result = await request(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    bearer: adminToken,
    headers: { prefer: "return=minimal" },
  });
  assert.equal(result.response.ok, true, `${table} cleanup failed: ${JSON.stringify(result.data)}`);
}

const adminToken = await signIn("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const staffToken = await signIn("kds-staff@mcello.local", "LocalOnly-Staff-2026!");

try {
  const category = await rpc("admin_save_menu_category", {
    _id: null,
    _location_id: locationId,
    _slug: categorySlug,
    _name: `D020 Test ${suffix}`,
    _description: "Technische D020-Acceptance-Kategorie",
    _sort: 9910,
    _status: "published",
    _visible: true,
  }, adminToken);
  assert.equal(category.response.ok, true, JSON.stringify(category.data));
  categoryId = category.data.id;

  const group = await rpc("admin_save_modifier_group", {
    _id: null,
    _location_id: locationId,
    _name: `D020 Extras ${suffix}`,
    _min_selections: 0,
    _max_selections: 2,
    _sort: 9910,
  }, adminToken);
  assert.equal(group.response.ok, true, JSON.stringify(group.data));
  groupId = group.data.id;

  const option = await rpc("admin_save_modifier_option", {
    _id: null,
    _group_id: groupId,
    _name: "Test-Extra",
    _price_delta_cents: 125,
    _default_selected: false,
    _active: true,
    _sort: 10,
  }, adminToken);
  assert.equal(option.response.ok, true, JSON.stringify(option.data));

  const product = await rpc("admin_save_menu_product_configured", {
    _id: null,
    _location_id: locationId,
    _category_id: categoryId,
    _slug: productSlug,
    _name: `D020 Produkt ${suffix}`,
    _description: "Erste Beschreibung",
    _base_price_cents: 900,
    _sort: 9910,
    _status: "published",
    _bestseller: false,
    _orderable_online: true,
    _owner_confirmed: true,
    _modifier_group_ids: [groupId],
    _dietary_tags: [],
    _allergen_ids: [],
  }, adminToken);
  assert.equal(product.response.ok, true, JSON.stringify(product.data));
  productId = product.data.id;

  const updated = await rpc("admin_save_menu_product_configured", {
    _id: productId,
    _location_id: locationId,
    _category_id: categoryId,
    _slug: productSlug,
    _name: `D020 Produkt ${suffix}`,
    _description: "Geänderte D020-Beschreibung",
    _base_price_cents: 1050,
    _sort: 9910,
    _status: "published",
    _bestseller: true,
    _orderable_online: true,
    _owner_confirmed: true,
    _modifier_group_ids: [groupId],
    _dietary_tags: [],
    _allergen_ids: [],
  }, adminToken);
  assert.equal(updated.response.ok, true, JSON.stringify(updated.data));

  const catalog = await rpc("admin_get_catalog", { _location_id: locationId }, adminToken);
  assert.equal(catalog.response.ok, true, JSON.stringify(catalog.data));
  const savedProduct = catalog.data.products.find((row) => row.id === productId);
  assert.equal(savedProduct.description, "Geänderte D020-Beschreibung");
  assert.equal(savedProduct.basePriceCents, 1050);
  assert.deepEqual(savedProduct.modifierGroupIds, [groupId]);
  const savedGroup = catalog.data.modifierGroups.find((row) => row.id === groupId);
  assert.equal(savedGroup.options.some((row) => row.name === "Test-Extra" && row.priceDeltaCents === 125), true);

  const staffStructural = await rpc("admin_save_menu_category", {
    _id: categoryId,
    _location_id: locationId,
    _slug: categorySlug,
    _name: "Staff darf das nicht",
    _description: "",
    _sort: 9910,
    _status: "published",
    _visible: true,
  }, staffToken);
  assert.equal(staffStructural.response.ok, false, "staff must not edit structural catalog data");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZK1sAAAAASUVORK5CYII=", "base64");
  uploadedObjectPath = `${locationId}/products/${randomUUID()}.png`;
  const upload = await request(`/storage/v1/object/mcello-media/${encodedStoragePath(uploadedObjectPath)}`, {
    method: "POST",
    bearer: adminToken,
    body: png,
    headers: { "content-type": "image/png", "x-upsert": "false" },
  });
  assert.equal(upload.response.ok, true, JSON.stringify(upload.data));

  const register = await rpc("admin_register_product_image_upload", {
    _product_id: productId,
    _location_id: locationId,
    _bucket_id: "mcello-media",
    _object_path: uploadedObjectPath,
    _original_filename: "d020-test.png",
    _mime_type: "image/png",
    _byte_size: png.length,
    _width: 1,
    _height: 1,
    _alt_text: "D020 technisches Test-Produktbild",
    _source_kind: "owner_upload",
    _rights_confirmed: true,
  }, adminToken);
  assert.equal(register.response.ok, true, JSON.stringify(register.data));
  imageRegistered = true;
  const mediaId = register.data.mediaId;
  assert.ok(mediaId);

  const staffMediaEdit = await rpc("admin_save_product_image_metadata", {
    _product_id: productId,
    _location_id: locationId,
    _alt_text: "Staff darf das nicht",
    _source_kind: "owner_upload",
    _rights_confirmed: true,
  }, staffToken);
  assert.equal(staffMediaEdit.response.ok, false, "staff must not edit product media metadata");

  const mediaSnapshot = await rpc("admin_get_product_media", { _location_id: locationId }, adminToken);
  assert.equal(mediaSnapshot.response.ok, true, JSON.stringify(mediaSnapshot.data));
  const mediaProduct = mediaSnapshot.data.products.find((row) => row.id === productId);
  assert.equal(mediaProduct.image.id, mediaId);
  assert.equal(mediaProduct.image.rightsConfirmed, true);

  const publicMenu = await rpc("get_public_menu", { _location_id: locationId, _at: new Date().toISOString() }, anonKey, anonKey);
  assert.equal(publicMenu.response.ok, true, JSON.stringify(publicMenu.data));
  const publicCategory = publicMenu.data.categories.find((row) => row.id === categoryId);
  const publicProduct = publicCategory.products.find((row) => row.id === productId);
  assert.equal(publicProduct.imageMediaId, mediaId);
  assert.equal(publicProduct.imageAltText, "D020 technisches Test-Produktbild");

  const descriptor = await rpc("get_public_media_descriptor", { _media_id: mediaId }, anonKey, anonKey);
  assert.equal(descriptor.response.ok, true, JSON.stringify(descriptor.data));
  assert.equal(descriptor.data.bucketId, "mcello-media");
  assert.equal(descriptor.data.objectPath, uploadedObjectPath);

  const hideImage = await rpc("admin_save_product_image_metadata", {
    _product_id: productId,
    _location_id: locationId,
    _alt_text: "D020 technisches Test-Produktbild",
    _source_kind: "owner_upload",
    _rights_confirmed: false,
  }, adminToken);
  assert.equal(hideImage.response.ok, true, JSON.stringify(hideImage.data));

  const hiddenMenu = await rpc("get_public_menu", { _location_id: locationId, _at: new Date().toISOString() }, anonKey, anonKey);
  const hiddenProduct = hiddenMenu.data.categories.find((row) => row.id === categoryId).products.find((row) => row.id === productId);
  assert.equal(hiddenProduct.imageMediaId, null, "unconfirmed rights must remove product image from public menu contract");

  const restoreRights = await rpc("admin_save_product_image_metadata", {
    _product_id: productId,
    _location_id: locationId,
    _alt_text: "D020 technisches Test-Produktbild",
    _source_kind: "owner_upload",
    _rights_confirmed: true,
  }, adminToken);
  assert.equal(restoreRights.response.ok, true, JSON.stringify(restoreRights.data));

  const staffRemove = await rpc("admin_remove_product_image", { _product_id: productId, _location_id: locationId }, staffToken);
  assert.equal(staffRemove.response.ok, false, "staff must not remove a product image");

  const removed = await rpc("admin_remove_product_image", { _product_id: productId, _location_id: locationId }, adminToken);
  assert.equal(removed.response.ok, true, JSON.stringify(removed.data));
  assert.equal(removed.data.removed, true);
  assert.equal(removed.data.deleteObject, true, "unshared test image metadata should be deleted");
  imageRegistered = false;

  const deleteObject = await request(`/storage/v1/object/mcello-media/${encodedStoragePath(uploadedObjectPath)}`, {
    method: "DELETE",
    bearer: adminToken,
  });
  assert.equal(deleteObject.response.ok, true, JSON.stringify(deleteObject.data));
  uploadedObjectPath = null;

  console.log("D020 complete admin catalog + product media integration passed.");
} finally {
  if (imageRegistered && productId) {
    const removed = await rpc("admin_remove_product_image", { _product_id: productId, _location_id: locationId }, adminToken).catch(() => null);
    if (removed?.response?.ok) imageRegistered = false;
  }
  if (uploadedObjectPath) {
    await request(`/storage/v1/object/mcello-media/${encodedStoragePath(uploadedObjectPath)}`, {
      method: "DELETE",
      bearer: adminToken,
    }).catch(() => undefined);
  }
  if (productId) await deleteRows("menu_products", `id=eq.${encodeURIComponent(productId)}`, adminToken).catch(() => undefined);
  if (groupId) await deleteRows("modifier_groups", `id=eq.${encodeURIComponent(groupId)}`, adminToken).catch(() => undefined);
  if (categoryId) await deleteRows("menu_categories", `id=eq.${encodeURIComponent(categoryId)}`, adminToken).catch(() => undefined);
}
