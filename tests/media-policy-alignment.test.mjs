import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const shared = await readFile(new URL("packages/cms/src/media.ts", root), "utf8");
const lebtig = await readFile(new URL("apps/lebtig/src/domain/media.ts", root), "utf8");
const mcello = await readFile(
  new URL("supabase/migrations/20260818010000_product_media_backoffice.sql", root),
  "utf8",
);

test("Mcello and shared CMS agree on the portable image MIME set", () => {
  for (const mime of ["image/jpeg", "image/png", "image/webp", "image/avif"]) {
    assert.match(shared, new RegExp(mime.replace("/", "\\/")));
    assert.match(mcello, new RegExp(mime.replace("/", "\\/")));
  }
  assert.match(lebtig, /COMMON_IMAGE_MIME_TYPES/);
});

test("app-specific media rules remain outside the generic shared metadata", () => {
  assert.doesNotMatch(shared, /rightsConfirmed|rights_confirmed|sourceKind|source_kind/);
  assert.match(mcello, /rights_confirmed/);
  assert.match(lebtig, /LEBTIG_MEDIA_MAX_BYTES = 5 \* 1024 \* 1024/);
  assert.match(lebtig, /LEBTIG_MEDIA_ALT_MAX_LENGTH = 180/);
});

test("shared media policy does not pretend storage usage queries are universal", () => {
  assert.doesNotMatch(shared, /pages|news|recipes|lunch_items|offer_items|menu_products|gallery_items/);
  assert.match(lebtig, /mediaUsageKey/);
});
