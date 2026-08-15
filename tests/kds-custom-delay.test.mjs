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

function requireTokens(source, tokens) {
  for (const token of tokens) {
    assert.equal(source.includes(token), true, `missing semantic marker: ${token}`);
  }
}

test("KDS keeps quick delays and adds an inline bounded custom delay", () => {
  requireTokens(kds, [
    'data-action="delay"',
    'data-minutes="5"',
    'data-minutes="10"',
    'data-minutes="15"',
    'data-custom-delay-input',
    'min="1"',
    'max="120"',
    'step="1"',
    'data-custom-delay="true"',
    'Number.isInteger(minutes)',
    'minutes < 1 || minutes > 120',
  ]);
  assert.equal(/\bprompt\s*\(/.test(kds), false, "custom delay must not use browser prompt()");
  assert.equal(kdsHtml.includes(".custom-delay"), true);
});

test("server independently validates custom delay before invoking KDS adapter", () => {
  requireTokens(server, [
    'body.action === "delay"',
    'Number.isInteger(minutes)',
    'minutes < 1 || minutes > 120',
    'await kds.delay(body.orderId, minutes)',
  ]);
});

test("delay transitions enqueue the existing delayed customer notification", () => {
  requireTokens(outboxMigration, [
    "'delayed'",
    "accepted_pickup_at",
    "'whatsapp'",
    "'sms'",
  ]);
});
