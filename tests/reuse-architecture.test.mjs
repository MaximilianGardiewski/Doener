import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const rootPackage = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const lebtigReadme = await readFile(new URL("apps/lebtig/README.md", root), "utf8");
const lebtigPackage = JSON.parse(await readFile(new URL("apps/lebtig/package.json", root), "utf8"));
const lebtigRoles = await readFile(new URL("apps/lebtig/src/domain/roles.ts", root), "utf8");
const lebtigCms = await readFile(new URL("apps/lebtig/src/domain/cms.ts", root), "utf8");
const server = await readFile(new URL("apps/mcello/server.mjs", root), "utf8");

const sharedPackageFiles = [
  "packages/core/package.json",
  "packages/auth/package.json",
  "packages/cms/package.json",
  "packages/menu-engine/package.json",
  "packages/ordering/package.json",
  "packages/kds/package.json",
  "packages/notifications/package.json",
  "packages/payments/package.json",
  "packages/analytics/package.json",
  "packages/supabase-adapter/package.json",
];

test("D022 promotes Lebtig from donor documentation to a real shared-package consumer", () => {
  assert.match(lebtigReadme, /zweiter BusinessWebFactory-Consumer/);
  assert.match(lebtigReadme, /abb54c73f42b784d7c66cd1e1d468b532a67f065/);
  assert.equal(lebtigPackage.name, "@business-web/lebtig");
  assert.equal(lebtigPackage.dependencies["@business-web/auth"], "0.0.1");
  assert.equal(lebtigPackage.dependencies["@business-web/cms"], "0.0.1");
  assert.match(lebtigRoles, /from "@business-web\/auth"/);
  assert.match(lebtigCms, /from "@business-web\/cms"/);
});

test("D022 keeps Mcello and Lebtig as sibling consumers rather than app-to-app dependencies", async () => {
  assert.deepEqual(rootPackage.workspaces, ["apps/*", "packages/*"]);
  for (const file of sharedPackageFiles) {
    const pkg = JSON.parse(await readFile(new URL(file, root), "utf8"));
    assert.ok(pkg.name, `${file} must be an independently named shared package`);
  }
  assert.doesNotMatch(server, /apps\/lebtig|\.\.\/lebtig/);
  assert.doesNotMatch(lebtigRoles, /apps\/mcello|\.\.\/\.\.\/mcello/);
  assert.doesNotMatch(lebtigCms, /apps\/mcello|\.\.\/\.\.\/mcello/);
});

test("D023 Mcello still composes Product-D-ready package boundaries without importing Lebtig", () => {
  for (const marker of [
    '../../packages/notifications/src/dev-otp.ts',
    '../../packages/core/src/location-context.ts',
    '../../packages/analytics/src/events.ts',
    '../../packages/ordering/src/checkout.ts',
    '../../packages/supabase-adapter/src/rest-rpc.ts',
    '../../packages/supabase-adapter/src/kds.ts',
  ]) {
    assert.equal(server.includes(marker), true, `Mcello must compose shared package boundary: ${marker}`);
  }
  assert.doesNotMatch(server, /@business-web\/lebtig/);
});
