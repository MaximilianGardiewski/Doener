import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260815015000_cross_sell_recommendations.sql", import.meta.url), "utf8");
const app = await readFile(new URL("../apps/mcello/public/app.js", import.meta.url), "utf8");
const admin = await readFile(new URL("../apps/mcello/public/admin.js", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../apps/mcello/public/admin.html", import.meta.url), "utf8");
const index = await readFile(new URL("../apps/mcello/public/index.html", import.meta.url), "utf8");
const server = await readFile(new URL("../apps/mcello/server.mjs", import.meta.url), "utf8");

test("cross-sell rules are location-scoped and structurally constrained", () => {
  assert.match(migration, /create table public\.cross_sell_rules/);
  assert.match(migration, /num_nonnulls\(trigger_category_id, trigger_modifier_option_id\) = 1/);
  assert.match(migration, /num_nonnulls\(suggested_category_id, suggested_product_id\) = 1/);
  assert.match(migration, /enforce_product_cross_sell_scope/);
  assert.match(migration, /enforce_cross_sell_rule_scope/);
  assert.match(migration, /cross_sell_rules_location_enabled_sort_idx/);
  assert.match(migration, /product_cross_sells_suggested_product_idx/);
});

test("recommendation administration stays admin-only", () => {
  assert.match(migration, /create policy "admin manage cross sell rules"/);
  assert.match(migration, /perform public\.require_admin\(\)/);
  assert.match(migration, /revoke all on function public\.admin_set_product_cross_sells/);
  assert.match(migration, /revoke all on function public\.admin_save_cross_sell_rule/);
  assert.match(migration, /grant execute on function public\.admin_save_cross_sell_rule[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /grant select[^;]*cross_sell_rules[^;]*to anon/);
});

test("public recommendation contract exposes only deterministic configuration", () => {
  assert.match(migration, /create or replace function public\.get_public_cross_sells/);
  assert.match(migration, /source\.status = 'published'/);
  assert.match(migration, /suggested\.status = 'published'/);
  assert.match(migration, /r\.enabled/);
  assert.match(migration, /grant execute on function public\.get_public_cross_sells\(uuid\) to anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /insert into public\.cross_sell_rules[\s\S]{0,500}values\s*\(\s*'/i, "migration must not seed invented Mcello recommendations");
  assert.match(server, /rpc\.rpc\("get_public_cross_sells"/);
  assert.match(server, /sendJson\(res, 200, \{ \.\.\.menu, \.\.\.crossSells \}\)/);
});

test("public ordering UI resolves curated and category or ingredient rules", () => {
  assert.match(app, /product\.crossSellIds/);
  assert.match(app, /rule\.triggerCategoryId/);
  assert.match(app, /rule\.triggerModifierOptionId/);
  assert.match(app, /rule\.suggestedCategoryId/);
  assert.match(app, /rule\.suggestedProductId/);
  assert.match(app, /renderProductRecommendations/);
  assert.match(app, /renderCartRecommendations/);
  assert.match(index, /id="productRecommendations"/);
  assert.match(index, /id="cartRecommendations"/);
});

test("admin UI supports direct pairings and structured rules", () => {
  assert.match(adminHtml, /id="crossSellRuleAdmin"/);
  assert.match(adminHtml, /id="newCrossSellRule"/);
  assert.match(admin, /name="crossSellIds" multiple/);
  assert.match(admin, /admin_save_menu_product_recommended/);
  assert.match(admin, /admin_save_cross_sell_rule/);
  assert.match(admin, /admin_delete_cross_sell_rule/);
  assert.match(admin, /table: "product_cross_sells"/);
  assert.match(admin, /table: "cross_sell_rules"/);
});
