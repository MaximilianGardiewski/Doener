import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const slots = await readFile(
  new URL("../supabase/migrations/20260814190900_pickup_slots.sql", import.meta.url),
  "utf8",
);
const maintenance = await readFile(
  new URL("../supabase/migrations/20260814191000_order_maintenance.sql", import.meta.url),
  "utf8",
);
const acceptance = await readFile(
  new URL("../supabase/migrations/20260814191100_preorder_acceptance.sql", import.meta.url),
  "utf8",
);

test("public pickup slots are generated from configured slot length and filtered by shop/capacity", () => {
  assert.match(slots, /settings\.slot_minutes \* 60/i);
  assert.match(slots, /generate_series/i);
  assert.match(slots, /public\.server_shop_accepts_order\(_location_id, candidate\.starts_at\)/i);
  assert.match(slots, /capacity_state\.occupied < settings\.slot_capacity/i);
  assert.match(slots, /grant execute on function public\.get_available_pickup_slots\(uuid,timestamptz,integer\)\s+to anon, authenticated, service_role/i);
});

test("maintenance worker is service-only and handles warning rejection and scheduled activation", () => {
  assert.match(maintenance, /acceptance_timeout_warning/i);
  assert.match(maintenance, /order_auto_rejected_timeout/i);
  assert.match(maintenance, /rejection_reason = 'Nicht rechtzeitig bestätigt'/i);
  assert.match(maintenance, /state = 'preparing'/i);
  assert.match(maintenance, /scheduled_order_activated/i);
  assert.match(maintenance, /preparation_lead_minutes/i);
  assert.match(maintenance, /revoke all on function public\.server_process_order_maintenance\(timestamptz\)\s+from public, anon, authenticated/i);
  assert.match(maintenance, /grant execute on function public\.server_process_order_maintenance\(timestamptz\)\s+to service_role/i);
});

test("ASAP acceptance cannot hijack a preorder and preorder confirmation preserves requested slot", () => {
  const asapFn = acceptance.match(/create or replace function public\.staff_accept_order[\s\S]*?\$\$;/i)?.[0] ?? "";
  const slotFn = acceptance.match(/create or replace function public\.staff_accept_requested_slot[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(asapFn, /requested_pickup_at is null/i);
  assert.match(asapFn, /state = 'preparing'/i);
  assert.match(slotFn, /requested_pickup_at is not null/i);
  assert.match(slotFn, /accepted_pickup_at = requested_pickup_at/i);
  assert.match(slotFn, /state = 'scheduled'/i);
  assert.match(slotFn, /perform public\.require_staff\(\)/i);
});
