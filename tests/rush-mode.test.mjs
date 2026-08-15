import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../supabase/migrations/20260815030000_rush_mode_schema.sql", import.meta.url), "utf8");
const functions = await readFile(new URL("../supabase/migrations/20260815030100_rush_mode_functions.sql", import.meta.url), "utf8");
const acceptance = await readFile(new URL("../supabase/migrations/20260815030200_rush_asap_acceptance.sql", import.meta.url), "utf8");
const core = await readFile(new URL("../packages/core/src/shop-status.ts", import.meta.url), "utf8");
const kds = await readFile(new URL("../apps/mcello/public/kds.js", import.meta.url), "utf8");
const kdsHtml = await readFile(new URL("../apps/mcello/public/kds.html", import.meta.url), "utf8");
const opsHtml = await readFile(new URL("../apps/mcello/public/ops.html", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../apps/mcello/public/schedule.html", import.meta.url), "utf8");
const adminRush = await readFile(new URL("../apps/mcello/public/rush-settings.js", import.meta.url), "utf8");
const server = await readFile(new URL("../apps/mcello/server.mjs", import.meta.url), "utf8");

function hasAll(source, markers) {
  for (const marker of markers) assert.equal(source.includes(marker), true, `missing marker: ${marker}`);
}

test("rush is a distinct bounded operational setting", () => {
  hasAll(schema, [
    "add value if not exists 'rush'",
    "rush_extra_minutes integer not null default 10",
    "rush_extra_minutes between 5 and 60",
  ]);
  hasAll(core, ['| "rush"', 'status: "rush"', 'reason: "rush"']);
});

test("rush stays orderable but does not bypass schedule or cutoff", () => {
  hasAll(functions, [
    "override_text in ('force_closed', 'pause', 'today_closed')",
    "override_text = 'force_open'",
    "Both auto and rush stay subject to the real opening schedule and cutoff.",
    "if not scheduled_open then return false",
    "minutes_to_close <= cutoff_minutes",
    "when accepts and override_text = 'rush' then 'rush'",
  ]);
});

test("staff can toggle rush but cannot alter the structural rush buffer", () => {
  hasAll(functions, [
    "perform public.require_staff()",
    "'rush'::public.shop_override",
    "perform public.require_admin()",
    "admin_set_rush_extra_minutes",
  ]);
  assert.doesNotMatch(functions, /grant execute on function public\.admin_set_rush_extra_minutes\([^;]+\) to anon/i);
  assert.doesNotMatch(opsHtml, /rushExtraMinutes[^<]*type="number"/i, "staff UI must not expose structural buffer editing");
  hasAll(adminHtml, ['id="rushSettingsForm"', 'name="rushExtraMinutes"', 'min="5"', 'max="60"']);
  hasAll(adminRush, ["admin_get_rush_settings", "admin_set_rush_extra_minutes"]);
});

test("KDS displays effective rush ETAs but submits only existing base presets", () => {
  hasAll(kdsHtml, ['id="rush"', 'id="pause"']);
  hasAll(kds, [
    "effectiveAcceptanceMinutes(15)",
    "effectiveAcceptanceMinutes(20)",
    "effectiveAcceptanceMinutes(30)",
    'data-minutes="15"',
    'data-minutes="20"',
    'data-minutes="30"',
    "PostgreSQL applies the current Rush",
    'toggleOperationalMode(event.currentTarget, "rush")',
    'toggleOperationalMode(event.currentTarget, "pause")',
  ]);
  hasAll(server, [
    "if (![15, 20, 30].includes(minutes))",
    "new Date(Date.now() + minutes * 60_000).toISOString()",
  ]);
});

test("database adds rush only to ASAP acceptance and leaves preorder path separate", () => {
  hasAll(acceptance, [
    "current_order.requested_pickup_at is not null",
    "ASAP order cannot be accepted from current state",
    "settings.override = 'rush'::public.shop_override",
    "effective_pickup_at := _accepted_pickup_at + make_interval(mins => applied_rush_minutes)",
    "Preorders",
    "staff_accept_requested_slot()",
    "requested_pickup_at is null",
  ]);
  assert.doesNotMatch(acceptance, /update public\.orders[\s\S]*requested_pickup_at\s*=/i);
});

test("staff HTTP surface still does not advertise force-open", () => {
  const overrideRouteStart = server.indexOf('url.pathname === "/api/kds/shop-override"');
  assert.notEqual(overrideRouteStart, -1);
  const routeSlice = server.slice(overrideRouteStart, overrideRouteStart + 1800);
  assert.doesNotMatch(routeSlice, /"force_open"/);
});
