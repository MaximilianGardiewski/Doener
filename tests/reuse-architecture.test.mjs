import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const rootPackage = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const donor = await readFile(new URL("apps/lebtig/README.md", root), "utf8");
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

test("D022 keeps the Lebtig donor foundations documented instead of pretending a full source export", () => {
  assert.match(donor, /Lebtig donor reference/);
  assert.match(donor, /reusable foundations: Supabase auth, profiles\/roles, RLS, media, admin shell, CMS, navigation, pages, route QA, SEO plumbing/);
  assert.match(donor, /Do not claim complete extraction/);
});

test("D022 reuses foundations through shared packages rather than Mcello importing the donor app", async () => {
  assert.deepEqual(rootPackage.workspaces, ["apps/*", "packages/*"]);
  for (const file of sharedPackageFiles) {
    const pkg = JSON.parse(await readFile(new URL(file, root), "utf8"));
    assert.ok(pkg.name, `${file} must be an independently named shared package`);
  }
  assert.doesNotMatch(server, /apps\/lebtig|\.\.\/lebtig/);
});

test("D023 Mcello composes reusable Product-D-ready core boundaries", () => {
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
});
