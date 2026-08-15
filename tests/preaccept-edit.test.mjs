import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260815025500_preaccept_order_edit.sql", import.meta.url),
  "utf8",
);
const hardening = await readFile(
  new URL("../supabase/migrations/20260815025600_preaccept_order_edit_hardening.sql", import.meta.url),
  "utf8",
);

test("pre-accept edit keeps reconstruction and replacement behind service role", () => {
  for (const signature of [
    "server_get_pending_order_edit_context(uuid)",
    "server_replace_pending_order(uuid,jsonb)",
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, "\\$&")} to service_role`));
  }
  assert.doesNotMatch(migration, /grant execute on function public\.server_replace_pending_order\([^;]+\) to anon/i);
  assert.doesNotMatch(migration, /grant execute on function public\.server_get_pending_order_edit_context\([^;]+\) to anon/i);
});

test("customer edit is row-locked and limited to pending web pickup orders", () => {
  assert.match(hardening, /where public_token = _public_token\s+for update/);
  assert.match(hardening, /order_row\.state <> 'waiting_for_acceptance'/);
  assert.match(hardening, /order_row\.source <> 'web'/);
  assert.match(hardening, /order_row\.fulfillment <> 'pickup'/);
  assert.doesNotMatch(hardening, /submitted_at\s*=/, "editing must not reset the original acceptance timeout clock");
});

test("edit path reuses authoritative shop slot availability and price boundaries", () => {
  assert.match(migration, /server_validate_web_order_gate/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /_exclude_order_id is null or o\.id <> _exclude_order_id/);
  assert.match(migration, /server_write_verified_order_items/);
  assert.match(hardening, /server_is_product_available\(new\.product_id, availability_at\)/);
  assert.match(migration, /item_unit_price := product_row\.base_price_cents/);
  assert.match(migration, /item_unit_price := item_unit_price \+ option_row\.price_delta_cents/);
});

test("stable modifier ids remain internal while public status only exposes an editable flag", () => {
  assert.match(migration, /modifier_group_id uuid references public\.modifier_groups/);
  assert.match(migration, /modifier_option_id uuid references public\.modifier_options/);
  assert.match(migration, /'editable'/);
  const publicStatus = migration.slice(migration.indexOf("create or replace function public.get_public_order_status"));
  assert.doesNotMatch(publicStatus, /'mobile',\s*o\.mobile/);
  assert.doesNotMatch(publicStatus, /'productId'/);
  assert.doesNotMatch(publicStatus, /'modifierGroupId'|'modifierOptionId'/);
});

test("received notification total is corrected before create transaction commits", () => {
  assert.match(hardening, /order_notification_outbox/);
  assert.match(hardening, /jsonb_set\(payload, '\{totalCents\}'/);
  assert.match(hardening, /dedupe_key = created_order\.id::text \|\| ':received'/);
});
