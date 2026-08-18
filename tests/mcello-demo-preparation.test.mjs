import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const prepare = await readFile(new URL("../scripts/prepare-mcello-demo.mjs", import.meta.url), "utf8");
const launcher = await readFile(new URL("../scripts/demo-mcello.ps1", import.meta.url), "utf8");

test("presentation preparation refuses non-local Supabase before any mutation", () => {
  assert.match(prepare, /supabaseUrl\.protocol, "http:"/);
  assert.match(prepare, /127\.0\.0\.1/);
  assert.match(prepare, /localhost/);
  assert.match(prepare, /::1/);
  assert.match(prepare, /Refusing to prepare a non-local Mcello instance/);
});

test("presentation force-open uses authenticated local admin instead of service-role mutation", () => {
  assert.match(prepare, /MCELLO_DEV_ADMIN_EMAIL/);
  assert.match(prepare, /MCELLO_DEV_ADMIN_PASSWORD/);
  assert.match(prepare, /admin_set_shop_override/);
  assert.match(prepare, /_override: "force_open"/);
  assert.match(prepare, /Lokaler Präsentationsmodus/);
  assert.doesNotMatch(prepare, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("one-command launcher prepares demo shop state before starting the preview", () => {
  const prepareIndex = launcher.indexOf("node scripts/prepare-mcello-demo.mjs");
  const previewIndex = launcher.indexOf("npm run preview:mcello");
  assert.ok(prepareIndex >= 0, "launcher must invoke localhost-only demo preparation");
  assert.ok(previewIndex > prepareIndex, "demo state must be prepared before preview startup");
  assert.match(launcher, /force_open/);
  assert.match(launcher, /disposable localhost Supabase stack/);
});
