import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const launcher = await readFile(new URL("../scripts/demo-mcello.ps1", import.meta.url), "utf8");

test("presentation launcher stays local and starts the proven Mcello demo surfaces", () => {
  for (const marker of [
    "scripts/demo-mcello.ps1",
  ]) {
    assert.ok(marker);
  }
  assert.match(launcher, /127\.0\.0\.1:4173/);
  assert.match(launcher, /dev-supabase\.ps1/);
  assert.match(launcher, /npm run preview:mcello/);
  assert.match(launcher, /api\/health/);
  assert.match(launcher, /local-supabase-ready/);
  assert.match(launcher, /kds\.html/);
  assert.match(launcher, /admin\.html/);
});

test("presentation launcher does not activate production or paid messaging", () => {
  assert.match(launcher, /No production deployment and no paid messaging provider will be used/);
  assert.match(launcher, /does not send a real WhatsApp message/);
  assert.match(launcher, /never falls back to SMS/);
  assert.doesNotMatch(launcher, /ALLOW_PAID_MESSAGING\s*=\s*YES/i);
  assert.doesNotMatch(launcher, /WHATSAPP_PROVIDER\s*=/i);
  assert.doesNotMatch(launcher, /SMS_PROVIDER\s*=/i);
  assert.doesNotMatch(launcher, /production deploy|deploy production/i);
});

test("presentation launcher refuses a half-ready local runtime", () => {
  assert.match(launcher, /backend -ne 'local-supabase-ready'/);
  assert.match(launcher, /localKdsStaff/);
  assert.match(launcher, /within 45 seconds/);
});
