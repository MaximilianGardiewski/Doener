import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260815020500_analytics_event_data.sql", import.meta.url),
  "utf8",
);
const server = await readFile(new URL("../apps/mcello/server.mjs", import.meta.url), "utf8");
const client = await readFile(new URL("../apps/mcello/public/app.js", import.meta.url), "utf8");

test("analytics storage excludes free-form metadata and direct browser access", () => {
  const table = migration.match(/create table public\.analytics_events[\s\S]*?\n\);/i)?.[0] ?? "";
  assert.doesNotMatch(table, /\bmetadata\b/i);
  assert.match(migration, /alter table public\.analytics_events enable row level security/i);
  assert.match(migration, /revoke all on public\.analytics_events from public, anon, authenticated/i);
  assert.doesNotMatch(migration, /grant .*analytics_events to anon|grant .*analytics_events to authenticated/i);
});

test("recording RPC rejects unsupported fields and is service-role only", () => {
  const fn = migration.match(/create or replace function public\.server_record_analytics_event[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(fn, /analytics payload contains unsupported fields/i);
  assert.match(fn, /event_occurred_at < now\(\) - interval '24 hours'/i);
  assert.match(migration, /revoke all on function public\.server_record_analytics_event\(jsonb,uuid\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.server_record_analytics_event\(jsonb,uuid\) to service_role/i);
});

test("public events pass through the server and have a pseudonymous rate limit", () => {
  assert.match(server, /url\.pathname === "\/api\/analytics\/events"/);
  assert.match(server, /consumeAnalyticsQuota\(event\.anonymousSessionId\)/);
  assert.match(server, /event\.locationId !== DEV_LOCATION_ID/);
  assert.match(client, /analyticsSessionId: createUuid\(\)/);
  assert.doesNotMatch(client, /ANALYTICS_SESSION_KEY|localStorage\.setItem\([^\n]*analytics/i);
  assert.doesNotMatch(client.match(/function emitAnalytics[\s\S]*?\n\}/)?.[0] ?? "", /mobile|firstName|comment|email/i);
});

test("order submission is linked server-side and analytics cannot block checkout", () => {
  assert.match(server, /parseOrderAnalyticsContext\(body\.analytics\)/);
  assert.match(server, /Analytics is best-effort and must never block a valid order/);
  assert.match(server, /recordOrderSubmitted\(DEV_LOCATION_ID, order\.id, analyticsContext\)/);
});
