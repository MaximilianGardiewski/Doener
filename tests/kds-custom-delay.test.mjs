import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const kds = await readFile(new URL("../apps/mcello/public/kds.js", import.meta.url), "utf8");
const kdsHtml = await readFile(new URL("../apps/mcello/public/kds.html", import.meta.url), "utf8");
const server = await readFile(new URL("../apps/mcello/server.mjs", import.meta.url), "utf8");
const outboxMigration = await readFile(
  new URL("../supabase/migrations/20260814191200_notification_outbox.sql", import.meta.url),
  "utf8",
);

test("KDS keeps quick delays and adds an inline bounded custom delay", () => {
  assert.match(kds, /data-action="delay"/);
  for (const minutes of [5, 10, 15]) {
    assert.match(kds, new RegExp(`data-minutes="${minutes}"`));
    assert.match(kds, new RegExp(`>\\+${minutes}<\\/button>`));
  }
  assert.match(kds, /data-custom-delay-input/);
  assert.match(kds, /type="number" min="1" max="120" step="1"/);
  assert.match(kds, /data-custom-delay="true"/);
  assert.match(kds, /Number\.isInteger\(minutes\)/);
  assert.match(kds, /minutes < 1 \|\| minutes > 120/);
  assert.doesNotMatch(kds, /\bprompt\s*\(/);
  assert.match(kdsHtml, /\.custom-delay/);
});

test("server independently validates custom delay before invoking KDS adapter", () => {
  assert.match(server, /body\.action === "delay"/);
  assert.match(server, /Number\.isInteger\(minutes\) \|\| minutes < 1 \|\| minutes > 120/);
  assert.match(server, /await kds\.delay\(body\.orderId, minutes\)/);
});

test("delay transitions enqueue the existing delayed customer notification", () => {
  assert.match(outboxMigration, /'delayed'/);
  assert.match(outboxMigration, /pickup_eta_delayed|accepted_pickup_at/is);
  assert.match(outboxMigration, /preferred_channel[\s\S]*'whatsapp'/i);
  assert.match(outboxMigration, /fallback_channel[\s\S]*'sms'/i);
});
