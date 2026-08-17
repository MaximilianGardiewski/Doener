import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const admin = await readFile(new URL("../apps/mcello/public/admin.js", import.meta.url), "utf8");

test("active product editor uses one configured recommendation transaction and preserves separately managed labels", () => {
  assert.match(admin, /admin_save_menu_product_recommended/);
  assert.match(admin, /_modifier_group_ids: groupIds/);
  assert.match(admin, /_dietary_tags: existing\?\.dietaryTags \|\| \[\]/);
  assert.match(admin, /_allergen_ids: existing\?\.allergenIds \|\| \[\]/);
  assert.match(admin, /_suggested_product_ids: crossSellIds/);
  assert.doesNotMatch(admin, /\/api\/admin\/product\/save/);
  assert.doesNotMatch(admin, /admin_set_product_modifier_groups/);
});

test("admin structural writes derive the location from the authenticated session", () => {
  assert.match(admin, /locationId: data\.locationId/);
  assert.match(admin, /_location_id: session\.locationId/);
  assert.doesNotMatch(admin, /00000000-0000-4000-8000-000000000001/);
});
