import assert from "node:assert/strict";

function envValue(name) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  return value.replace(/^['"]|['"]$/g, "");
}

const baseUrl = envValue("SUPABASE_URL")?.replace(/\/$/, "");
const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
if (!baseUrl || !serviceRoleKey) throw new Error("Local Supabase env is missing");

const mcelloLocationId = "00000000-0000-4000-8000-000000000001";
const secondLocationId = crypto.randomUUID();
const secondCategoryId = crypto.randomUUID();
const secondProductId = crypto.randomUUID();
const secondGroupId = crypto.randomUUID();
const secondMediaId = crypto.randomUUID();

async function request(pathname, { method = "GET", body, prefer } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { response, data, raw };
}

async function expectOk(pathname, options) {
  const result = await request(pathname, options);
  assert.equal(result.response.ok, true, result.raw);
  return result.data;
}

async function expectBoundaryFailure(pathname, options) {
  const result = await request(pathname, options);
  assert.equal(result.response.ok, false, `cross-location write unexpectedly succeeded: ${pathname}`);
  assert.equal(["23503", "23514"].includes(result.data?.code), true, result.raw);
}

try {
  await expectOk("/rest/v1/locations", {
    method: "POST",
    body: {
      id: secondLocationId,
      slug: `location-boundary-${secondLocationId.slice(0, 8)}`,
      name: "Location boundary integration",
      timezone: "Europe/Berlin",
      active: true,
    },
  });
  await expectOk("/rest/v1/menu_categories", {
    method: "POST",
    body: {
      id: secondCategoryId,
      location_id: secondLocationId,
      slug: "isolated-category",
      name: "Isolated category",
      status: "published",
      visible: true,
    },
  });
  await expectOk("/rest/v1/menu_products", {
    method: "POST",
    body: {
      id: secondProductId,
      location_id: secondLocationId,
      category_id: secondCategoryId,
      slug: "isolated-product",
      name: "Isolated product",
      base_price_cents: 100,
      status: "published",
      orderable_online: true,
      owner_confirmed: false,
    },
  });
  await expectOk("/rest/v1/modifier_groups", {
    method: "POST",
    body: {
      id: secondGroupId,
      location_id: secondLocationId,
      name: "Isolated modifier",
      min_selections: 0,
      max_selections: 1,
    },
  });
  await expectOk("/rest/v1/media_assets", {
    method: "POST",
    body: {
      id: secondMediaId,
      location_id: secondLocationId,
      bucket_id: "mcello-media",
      object_path: `${secondLocationId}/gallery/isolation.webp`,
      original_filename: "isolation.webp",
      mime_type: "image/webp",
      byte_size: 1,
      alt_text: "",
      source_kind: "owner_upload",
      rights_confirmed: false,
    },
  });
  await expectBoundaryFailure("/rest/v1/media_assets", {
    method: "POST",
    body: {
      id: crypto.randomUUID(),
      location_id: secondLocationId,
      bucket_id: "mcello-media",
      object_path: `${mcelloLocationId}/gallery/wrong-location.webp`,
      original_filename: "wrong-location.webp",
      mime_type: "image/webp",
      byte_size: 1,
      alt_text: "",
      source_kind: "owner_upload",
      rights_confirmed: false,
    },
  });

  const mcelloProducts = await expectOk(
    `/rest/v1/menu_products?location_id=eq.${mcelloLocationId}&select=id&limit=1`,
  );
  assert.equal(mcelloProducts.length, 1, "provisional import must provide one Mcello product");
  const mcelloProductId = mcelloProducts[0].id;

  await expectBoundaryFailure("/rest/v1/menu_products", {
    method: "POST",
    body: {
      id: crypto.randomUUID(),
      location_id: mcelloLocationId,
      category_id: secondCategoryId,
      slug: `cross-location-${crypto.randomUUID()}`,
      name: "Must fail",
      base_price_cents: 100,
      status: "draft",
    },
  });
  await expectBoundaryFailure("/rest/v1/product_modifier_groups", {
    method: "POST",
    body: { product_id: mcelloProductId, group_id: secondGroupId, sort: 10 },
  });
  await expectBoundaryFailure("/rest/v1/availability_rules", {
    method: "POST",
    body: { location_id: secondLocationId, product_id: mcelloProductId, enabled: true },
  });
  await expectBoundaryFailure("/rest/v1/gallery_items", {
    method: "POST",
    body: {
      location_id: mcelloLocationId,
      media_id: secondMediaId,
      category: "food",
      status: "draft",
    },
  });
  await expectBoundaryFailure(`/rest/v1/menu_products?id=eq.${mcelloProductId}`, {
    method: "PATCH",
    body: { image_media_id: secondMediaId },
  });
  await expectBoundaryFailure(`/rest/v1/menu_categories?id=eq.${secondCategoryId}`, {
    method: "PATCH",
    body: { location_id: mcelloLocationId },
  });
  await expectBoundaryFailure("/rest/v1/analytics_events", {
    method: "POST",
    body: {
      client_event_id: crypto.randomUUID(),
      location_id: secondLocationId,
      anonymous_session_id: crypto.randomUUID(),
      event_type: "product_view",
      product_id: mcelloProductId,
      occurred_at: new Date().toISOString(),
    },
  });

  const secondSnapshot = await expectOk("/rest/v1/rpc/get_public_menu", {
    method: "POST",
    body: { _location_id: secondLocationId, _at: new Date().toISOString() },
  });
  const mcelloSnapshot = await expectOk("/rest/v1/rpc/get_public_menu", {
    method: "POST",
    body: { _location_id: mcelloLocationId, _at: new Date().toISOString() },
  });
  const secondIds = secondSnapshot.categories.flatMap((category) => category.products.map((product) => product.id));
  const mcelloIds = mcelloSnapshot.categories.flatMap((category) => category.products.map((product) => product.id));
  assert.deepEqual(secondIds, [secondProductId]);
  assert.equal(mcelloIds.includes(secondProductId), false);
} finally {
  await request(`/rest/v1/locations?id=eq.${secondLocationId}`, { method: "DELETE" });
}

console.log("Location boundary integration checks passed");
