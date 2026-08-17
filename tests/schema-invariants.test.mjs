import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
const migrationNames = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
const sql = (await Promise.all(migrationNames.map((name) => readFile(new URL(name, migrationsDir), "utf8")))).join("\n");

test("bootstrap and last-admin race guards are present", () => {
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('business_web_factory:user_roles:bootstrap_admin'\)\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('business_web_factory:user_roles:last_admin'\)\)/);
});

test("Mcello operational defaults match discovery", () => {
  assert.match(sql, /acceptance_timeout_minutes integer not null default 5/);
  assert.match(sql, /slot_minutes integer not null default 15/);
  assert.match(sql, /delivery_enabled boolean not null default false/);
});

test("future effort capacity is prepared but optional", () => {
  assert.match(sql, /effort_weight numeric\(8,2\)/);
});

test("anonymous clients have no direct order policy", () => {
  const orderPolicyLines = sql
    .split("\n")
    .filter((line) => /create policy/i.test(line) && /orders/i.test(line));
  assert.equal(orderPolicyLines.some((line) => /\banon\b/i.test(line)), false);
});

test("bootstrap status is not exposed to anonymous users", () => {
  assert.doesNotMatch(sql, /grant execute on function public\.is_bootstrap_open\(\) to anon/i);
});

test("broad staff order updates are revoked in the hardening migration", async () => {
  const hardening = await readFile(
    new URL("../supabase/migrations/20260814190400_order_operation_rpcs.sql", import.meta.url),
    "utf8",
  );
  assert.match(hardening, /drop policy if exists "staff update orders" on public\.orders/i);
  assert.match(hardening, /revoke update on public\.orders from authenticated/i);
  assert.match(hardening, /staff_accept_order/);
  assert.match(hardening, /staff_mark_order_ready/);
  assert.match(hardening, /staff_complete_order/);
  assert.match(hardening, /staff_reject_order/);
  assert.match(hardening, /staff_delay_order/);
});

test("staff shop override RPC cannot edit structural ordering settings", async () => {
  const hardening = await readFile(
    new URL("../supabase/migrations/20260814190400_order_operation_rpcs.sql", import.meta.url),
    "utf8",
  );
  const fn = hardening.match(/create or replace function public\.staff_set_shop_override[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(fn, /set override = _override/);
  assert.doesNotMatch(fn, /slot_capacity\s*=/i);
  assert.doesNotMatch(fn, /order_cutoff_minutes\s*=/i);
  assert.doesNotMatch(fn, /preparation_lead_minutes\s*=/i);
});

test("verified order persistence is atomic and service-role only", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260814190500_order_persistence_and_public_status.sql", import.meta.url),
    "utf8",
  );
  const fn = migration.match(/create or replace function public\.server_create_verified_order[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(fn, /insert into public\.orders/i);
  assert.match(fn, /insert into public\.order_items/i);
  assert.match(fn, /insert into public\.order_item_options/i);
  assert.match(fn, /insert into public\.order_events/i);
  assert.match(migration, /revoke all on function public\.server_create_verified_order\(jsonb\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.server_create_verified_order\(jsonb\) to service_role/i);
});

test("public order status is token-scoped and excludes private contact data", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260814190500_order_persistence_and_public_status.sql", import.meta.url),
    "utf8",
  );
  const fn = migration.match(/create or replace function public\.get_public_order_status[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(fn, /where o\.public_token = _public_token/i);
  assert.doesNotMatch(fn, /o\.mobile/i);
  assert.doesNotMatch(fn, /order_events/i);
  assert.match(migration, /grant execute on function public\.get_public_order_status\(uuid\) to anon, authenticated, service_role/i);
});

test("public cancellation is limited to unaccepted orders", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260814190500_order_persistence_and_public_status.sql", import.meta.url),
    "utf8",
  );
  const fn = migration.match(/create or replace function public\.customer_cancel_pending_order[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(fn, /public_token = _public_token/i);
  assert.match(fn, /state = 'waiting_for_acceptance'/i);
  assert.match(fn, /event_type.*customer_cancelled|customer_cancelled/i);
});

test("KDS order tables are added to Supabase Realtime publication", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260814190500_order_persistence_and_public_status.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /alter publication supabase_realtime add table public\.orders/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.order_events/i);
});
