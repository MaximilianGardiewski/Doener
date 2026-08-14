import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const outbox = await readFile(new URL("../supabase/migrations/20260814191200_notification_outbox.sql", import.meta.url), "utf8");
const priority = await readFile(new URL("../supabase/migrations/20260814191300_notification_priority.sql", import.meta.url), "utf8");

test("order state changes enqueue durable WhatsApp-first jobs with SMS fallback", () => {
  assert.match(outbox, /preferred_channel[\s\S]*default 'whatsapp'/i);
  assert.match(outbox, /fallback_channel/i);
  assert.match(outbox, /'whatsapp',[\s\n]*'sms'/i);
  for (const kind of ["received", "accepted", "delayed", "ready", "rejected", "cancelled"]) {
    assert.match(outbox, new RegExp(`'${kind}'`, "i"));
  }
});

test("notification rows and worker RPCs are service-role only", () => {
  assert.match(outbox, /revoke all on public\.order_notification_outbox from public, anon, authenticated/i);
  assert.match(outbox, /server_claim_notification_outbox/i);
  assert.match(outbox, /server_mark_notification_sent/i);
  assert.match(outbox, /server_mark_notification_failed/i);
  assert.match(outbox, /grant execute on function public\.server_claim_notification_outbox\(integer\) to service_role/i);
});

test("outbox claims use SKIP LOCKED and prioritize active customer journeys", () => {
  assert.match(priority, /for update of n skip locked/i);
  assert.match(priority, /waiting_for_acceptance','scheduled','preparing','ready/i);
  assert.match(priority, /n\.created_at/i);
});
