import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../supabase/migrations/20260814190800_atomic_order_gate.sql", import.meta.url),
  "utf8",
);

test("web orders are protected by a before-insert database gate", () => {
  assert.match(sql, /create trigger t_orders_protect_web_gate\s+before insert on public\.orders/i);
  assert.match(sql, /new\.source <> 'web'/i);
  assert.match(sql, /new\.state <> 'waiting_for_acceptance'/i);
});

test("same pickup slot is transaction-serialized before capacity count", () => {
  const lockIndex = sql.search(/pg_advisory_xact_lock/i);
  const countIndex = sql.search(/select count\(\*\)::integer into occupied/i);
  assert.ok(lockIndex >= 0);
  assert.ok(countIndex > lockIndex, "slot lock must happen before capacity recount");
  assert.match(sql, /occupied >= settings\.slot_capacity/i);
});

test("scheduled pickup must be future and aligned to configured slot duration", () => {
  assert.match(sql, /new\.requested_pickup_at <= now\(\)/i);
  assert.match(sql, /not aligned to configured slot duration/i);
  assert.match(sql, /settings\.slot_minutes \* 60/i);
});

test("database gate respects ordering enablement and manual pause/closure overrides", () => {
  assert.match(sql, /not settings\.online_ordering_enabled/i);
  assert.match(sql, /not settings\.pickup_enabled/i);
  assert.match(sql, /'force_closed', 'pause', 'today_closed'/i);
  assert.match(sql, /override_text = 'force_open'/i);
});
