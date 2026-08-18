import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const run = await readFile(new URL("apps/mcello/run.mjs", root), "utf8");
const development = await readFile(new URL("apps/mcello/runtime/development.mjs", root), "utf8");
const production = await readFile(new URL("apps/mcello/runtime/production.mjs", root), "utf8");
const worker = await readFile(new URL("apps/mcello/notification-worker.mjs", root), "utf8");
const gateway = await readFile(new URL("infra/selfhost/container-entrypoint.mjs", root), "utf8");
const manifest = JSON.parse(await readFile(new URL("apps/mcello/package.json", root), "utf8"));

test("local run entrypoint delegates only to the development composition root", () => {
  assert.equal(run.trim(), 'await import("./runtime/development.mjs");');
  assert.match(development, /startLocalNotificationWorker/);
  assert.match(development, /loadEnv\(path\.join\(repoRoot, "\.env\.local"\)\)/);
  assert.match(development, /@business-web\/supabase-adapter/);
  assert.match(development, /await import\("\.\.\/server\.mjs"\)/);
});

test("production composition starts the server without the local notification worker", () => {
  assert.equal(production.trim(), 'await import("../server.mjs");');
  assert.match(gateway, /apps\/mcello\/runtime\/production\.mjs/);
  assert.doesNotMatch(gateway, /apps\/mcello\/run\.mjs|runtime\/development\.mjs|notification-worker/);
  assert.doesNotMatch(production, /notification-worker|DevOrderNotificationProvider/);
});

test("development notification worker consumes explicit workspace APIs", () => {
  assert.match(worker, /@business-web\/notifications\/dev-order-notifications/);
  assert.match(worker, /@business-web\/supabase-adapter/);
  assert.doesNotMatch(worker, /\.\.\/\.\.\/packages\/.*\/src\//);
  assert.equal(manifest.dependencies?.["@business-web/notifications"], "0.0.1");
  assert.equal(manifest.dependencies?.["@business-web/supabase-adapter"], "0.0.1");
});

test("development-only composition split does not overclaim the remaining OTP boundary", async () => {
  const server = await readFile(new URL("apps/mcello/server.mjs", root), "utf8");
  assert.match(server, /DevOtpProvider/,
    "Dev OTP still lives in the shared server and is intentionally the next production/dev hardening slice");
});
