import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260815032000_admin_shop_override.sql", root), "utf8");
const staffMigration = await readFile(new URL("supabase/migrations/20260815012000_ordering_schedule_backoffice.sql", root), "utf8");
const stateMigration = await readFile(new URL("supabase/migrations/20260815030100_rush_mode_functions.sql", root), "utf8");
const html = await readFile(new URL("apps/mcello/public/schedule.html", root), "utf8");
const js = await readFile(new URL("apps/mcello/public/admin-shop-override.js", root), "utf8");

test("D044 exposes a full manual shop override only through an admin RPC", () => {
  assert.match(migration, /create or replace function public\.admin_set_shop_override/);
  assert.match(migration, /perform public\.require_admin\(_location_id\)/);
  assert.match(migration, /update public\.ordering_settings[\s\S]*override = _override/);
  assert.match(migration, /char_length\(_message\) > 180/);
  assert.match(migration, /revoke all on function public\.admin_set_shop_override[\s\S]*from public, anon/);
  assert.match(migration, /grant execute on function public\.admin_set_shop_override[\s\S]*to authenticated/);
});

test("staff operational override remains unable to force-open the shop", () => {
  assert.match(staffMigration, /create or replace function public\.staff_set_shop_override/);
  assert.match(staffMigration, /if _override not in \('auto', 'force_closed', 'paused', 'today_closed', 'rush'\)/);
  assert.doesNotMatch(
    staffMigration.match(/create or replace function public\.staff_set_shop_override[\s\S]*?\$\$;/)?.[0] || "",
    /'force_open'/,
    "staff override allow-list must not contain force_open",
  );
});

test("shop-state semantics keep force-open distinct from rush", () => {
  assert.match(stateMigration, /when settings\.override = 'force_open' then true/);
  assert.match(stateMigration, /when settings\.override = 'rush' then schedule\.is_open/);
  assert.match(stateMigration, /when settings\.override = 'force_open' then false/);
  assert.match(stateMigration, /when settings\.override in \('paused', 'force_closed', 'today_closed'\) then false/);
});

test("admin schedule UI exposes every D044 mode and sends only through the admin RPC", () => {
  for (const value of ["auto", "force_open", "force_closed", "paused", "rush", "today_closed"]) {
    assert.match(html, new RegExp(`<option value="${value}">`));
  }
  assert.match(html, /Manuell geöffnet · Admin-only/);
  assert.match(html, /Mitarbeiter[\s\S]*können den Shop nicht außerhalb des strukturellen Zeitplans erzwingen/);
  assert.match(js, /rpc\("admin_set_shop_override"/);
  assert.match(js, /_operator_message:/);
  assert.doesNotMatch(js, /staff_set_shop_override/);
});
