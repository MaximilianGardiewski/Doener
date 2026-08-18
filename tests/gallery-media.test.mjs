import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260815014000_gallery_media.sql", import.meta.url), "utf8");
const index = await readFile(new URL("../apps/mcello/public/index.html", import.meta.url), "utf8");
const publicContent = await readFile(new URL("../apps/mcello/public/public-content.js", import.meta.url), "utf8");
const admin = await readFile(new URL("../apps/mcello/public/content.js", import.meta.url), "utf8");
const server = await readFile(new URL("../apps/mcello/server.mjs", import.meta.url), "utf8");
const bootstrap = await readFile(new URL("../scripts/bootstrap-local-staff.mjs", import.meta.url), "utf8");

test("gallery publishes only rights-confirmed media with useful alt text", () => {
  assert.match(migration, /m\.rights_confirmed/);
  assert.match(migration, /trim\(m\.alt_text\) <> ''/);
  assert.match(migration, /published media requires confirmed rights and alt text/);
  assert.match(migration, /category in \('food', 'venue', 'team', 'events'\)/);
  assert.match(publicContent, /snapshot\.galleryItems/);
  assert.match(publicContent, /alt="\$\{esc\(item\.altText\)\}"/);
});

test("gallery storage remains private and admin-scoped", () => {
  assert.match(bootstrap, /public: false/);
  assert.match(bootstrap, /error\?\.code === "NoSuchBucket"/);
  assert.match(bootstrap, /MCELLO_MEDIA_BUCKET_ONLY/);
  assert.match(migration, /create policy "mcello media admin insert"/);
  assert.match(migration, /create policy "mcello media admin select"/);
  assert.match(migration, /create policy "mcello media admin update"/);
  assert.match(migration, /create policy "mcello media admin delete"/);
  assert.match(migration, /public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/);
  assert.match(migration, /invalid gallery storage path/);
  assert.match(migration, /invalid gallery image type or size/);
  assert.doesNotMatch(admin, /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/);
});

test("public gallery has an honest empty state instead of bundled demo photos", () => {
  const gallerySection = index.match(/<section\b[^>]*\bid="galerie"[^>]*>[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(gallerySection, /id="galleryGrid"/);
  assert.match(gallerySection, /Noch keine freigegebenen Originalmedien/);
  assert.doesNotMatch(gallerySection, /placeholder\.svg/);
});

test("public media bytes are gated by the publication descriptor", () => {
  assert.match(server, /get_public_media_descriptor/);
  assert.match(server, /storageObjectPath/);
  assert.match(server, /x-content-type-options/);
  assert.match(migration, /grant execute on function public\.get_public_media_descriptor\(uuid\) to service_role/);
  assert.match(migration, /revoke all on function public\.get_public_media_descriptor\(uuid\) from public, anon, authenticated/);
});

test("gallery bootstrap preserves structured product and option allergens", () => {
  assert.match(migration, /'content', public\.get_public_content/);
  assert.match(migration, /from public\.product_allergens/);
  assert.match(migration, /from public\.modifier_option_allergens/);
});
