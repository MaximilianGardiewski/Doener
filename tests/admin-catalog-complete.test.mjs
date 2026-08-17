import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const adminHtml = await readFile(new URL("apps/mcello/public/admin.html", root), "utf8");
const adminJs = await readFile(new URL("apps/mcello/public/admin.js", root), "utf8");
const mediaHtml = await readFile(new URL("apps/mcello/public/product-media.html", root), "utf8");
const mediaJs = await readFile(new URL("apps/mcello/public/product-media.js", root), "utf8");
const publicContent = await readFile(new URL("apps/mcello/public/public-content.js", root), "utf8");
const migration = await readFile(new URL("supabase/migrations/20260818010000_product_media_backoffice.sql", root), "utf8");

const existingStructuralControls = [
  /\+ Kategorie/,
  /\+ Produkt/,
  /\+ Zutaten-\/Extra-Gruppe/,
  /Kategorien/,
  /Produkte/,
  /Zutaten, Saucen & Extras/,
];

test("D020 admin surface covers catalog fields and reusable configuration groups", () => {
  for (const pattern of existingStructuralControls) assert.match(adminHtml, pattern);
  assert.match(adminHtml, /href="\/product-media\.html"/);
  assert.match(adminHtml, /Beschreibungen, Preise, Produktbilder/);
  assert.match(adminJs, /admin_save_menu_category/);
  assert.match(adminJs, /admin_save_menu_product_recommended/);
  assert.match(adminJs, /admin_save_modifier_group/);
  assert.match(adminJs, /admin_save_modifier_option/);
});

test("D020 product media UI reuses private Storage and never exposes a service key", () => {
  assert.match(mediaHtml, /Produktbilder/);
  assert.match(mediaHtml, /Bildrechte bestätigt/);
  assert.match(mediaJs, /storage\/v1\/\$\{objectRoute\}/);
  assert.match(mediaJs, /admin_register_product_image_upload/);
  assert.match(mediaJs, /admin_save_product_image_metadata/);
  assert.match(mediaJs, /admin_remove_product_image/);
  assert.match(mediaJs, /10 \* 1024 \* 1024/);
  assert.doesNotMatch(mediaJs, /SERVICE_ROLE|service_role|SUPABASE_SERVICE_ROLE/);
});

test("D020 product media RPCs are admin-only and location scoped", () => {
  for (const name of [
    "admin_get_product_media",
    "admin_register_product_image_upload",
    "admin_save_product_image_metadata",
    "admin_remove_product_image",
  ]) {
    const start = migration.indexOf(`function public.${name}`);
    assert.notEqual(start, -1, `${name} missing`);
    const body = migration.slice(start, migration.indexOf("$$;", start) + 3);
    assert.match(body, /perform public\.require_admin\(\)/, `${name} must enforce admin role`);
  }
  assert.match(migration, /p\.id = _product_id and p\.location_id = _location_id/);
  assert.match(migration, /m\.location_id = _location_id/);
  assert.match(migration, /\/products\//);
  assert.match(migration, /uploaded storage object not found/);
});

test("public product images require rights and alt text before streaming", () => {
  assert.match(migration, /m\.rights_confirmed/);
  assert.match(migration, /trim\(m\.alt_text\) <> ''/);
  assert.match(migration, /p\.image_media_id = m\.id/);
  assert.match(migration, /p\.status = 'published'/);
  assert.match(migration, /c\.status = 'published'/);
  assert.match(migration, /'imageMediaId'/);
  assert.match(migration, /'imageAltText'/);
  assert.match(publicContent, /api\/media\/\$\{encodeURIComponent\(product\.imageMediaId\)\}/);
  assert.match(publicContent, /#featuredGrid/);
  assert.match(publicContent, /#modalImage/);
});
