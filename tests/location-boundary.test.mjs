import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const server = await readFile(new URL("../apps/mcello/server.mjs", import.meta.url), "utf8");
const importer = await readFile(new URL("../scripts/import-provisional-menu.mjs", import.meta.url), "utf8");
const migration = await readFile(
  new URL("../supabase/migrations/20260815021500_location_boundary_invariants.sql", import.meta.url),
  "utf8",
);

test("Mcello server resolves one configured location instead of scattering a development constant", () => {
  assert.match(server, /new SingleLocationContext\([\s\S]*MCELLO_LOCATION_ID/);
  assert.doesNotMatch(server, /DEV_LOCATION_ID/);
  assert.match(server, /locationContext\.resolve\(body\.locationId\)/);
  assert.match(server, /error instanceof LocationScopeError/);
  assert.match(server, /error: error\.code/);
});

test("provisional import namespaces stable IDs for non-canonical locations", () => {
  assert.match(importer, /MCELLO_LOCATION_ID/);
  assert.match(importer, /MCELLO_MENU_SEED_NAMESPACE/);
  assert.match(importer, /LOCATION_ID === DEFAULT_MCELLO_LOCATION_ID \? "mcello"/);
});

test("database rejects cross-location links even for privileged writes", () => {
  assert.match(migration, /create or replace function public\.enforce_location_boundary\(\)/i);
  for (const table of [
    "menu_products",
    "product_modifier_groups",
    "availability_rules",
    "snoozes",
    "gallery_items",
    "editorial_posts",
    "order_items",
    "media_assets",
    "analytics_events",
  ]) {
    assert.match(migration, new RegExp(`on public\\.${table}`, "i"));
  }
  assert.match(migration, /create or replace function public\.prevent_location_reassignment\(\)/i);
  assert.match(migration, /before update of location_id/i);
  assert.match(migration, /revoke all on function public\.enforce_location_boundary\(\) from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.prevent_location_reassignment\(\) from public, anon, authenticated/i);
});
