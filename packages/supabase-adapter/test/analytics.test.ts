import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseAnalyticsRecorder } from "../src/analytics.ts";

test("analytics adapter keeps public events behind the server RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const recorder = new SupabaseAnalyticsRecorder({
    async rpc(name, args) {
      calls.push({ name, args });
      return "event-id";
    },
  });
  await recorder.record({
    clientEventId: "10000000-0000-4000-8000-000000000001",
    anonymousSessionId: "10000000-0000-4000-8000-000000000002",
    locationId: "10000000-0000-4000-8000-000000000003",
    eventName: "menu_view",
    occurredAt: "2026-08-15T04:00:00.000Z",
  });
  assert.equal(calls[0]?.name, "server_record_analytics_event");
  assert.equal(calls[0]?.args._order_id, null);
});

test("submitted order attribution is server-only and order-linked", async () => {
  let args: Record<string, unknown> | undefined;
  const recorder = new SupabaseAnalyticsRecorder({
    async rpc(_name, value) { args = value; return "event-id"; },
  });
  await recorder.recordOrderSubmitted(
    "10000000-0000-4000-8000-000000000003",
    "10000000-0000-4000-8000-000000000004",
    {
      clientEventId: "10000000-0000-4000-8000-000000000001",
      anonymousSessionId: "10000000-0000-4000-8000-000000000002",
      occurredAt: "2026-08-15T04:00:00.000Z",
    },
  );
  assert.equal(args?._order_id, "10000000-0000-4000-8000-000000000004");
  assert.equal((args?._payload as { eventName?: string }).eventName, "order_submitted");
});
