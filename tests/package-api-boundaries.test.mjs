import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const packagesRoot = new URL("packages/", root);

async function packageNames() {
  return (await readdir(packagesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function collectTs(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTs(path));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

test("every workspace package exposes one stable @business-web root API", async () => {
  for (const directory of await packageNames()) {
    const manifest = JSON.parse(await readFile(new URL(`packages/${directory}/package.json`, root), "utf8"));
    assert.match(manifest.name, /^@business-web\//, `${directory} uses the canonical package namespace`);
    assert.equal(manifest.exports?.["."], "./src/index.ts", `${manifest.name} must expose ./src/index.ts`);
    await readFile(new URL(`packages/${directory}/src/index.ts`, root), "utf8");
  }
});

test("package source never reaches into another package src directory by relative path", async () => {
  const offenders = [];
  for (const directory of await packageNames()) {
    const src = fileURLToPath(new URL(`packages/${directory}/src/`, root));
    for (const file of await collectTs(src)) {
      const source = await readFile(file, "utf8");
      if (/from\s+["']\.\.\/\.\.\/[^/"']+\/src\//.test(source)) offenders.push(file);
    }
  }
  assert.deepEqual(offenders, [], `cross-package source imports must use public package APIs: ${offenders.join(", ")}`);
});

test("package dependency graph declares the public APIs used by ordering and Supabase adapter", async () => {
  const ordering = JSON.parse(await readFile(new URL("packages/ordering/package.json", root), "utf8"));
  assert.deepEqual(Object.keys(ordering.dependencies || {}).sort(), [
    "@business-web/core",
    "@business-web/menu-engine",
    "@business-web/notifications",
    "@business-web/payments",
  ]);

  const supabase = JSON.parse(await readFile(new URL("packages/supabase-adapter/package.json", root), "utf8"));
  assert.equal(supabase.name, "@business-web/supabase-adapter");
  for (const dependency of [
    "@business-web/analytics",
    "@business-web/core",
    "@business-web/menu-engine",
    "@business-web/notifications",
    "@business-web/ordering",
    "@business-web/payments",
  ]) {
    assert.equal(supabase.dependencies?.[dependency], "0.0.1", `missing ${dependency}`);
  }
});

test("development notification implementations stay on explicit dev subpaths", async () => {
  const manifest = JSON.parse(await readFile(new URL("packages/notifications/package.json", root), "utf8"));
  const rootApi = await readFile(new URL("packages/notifications/src/index.ts", root), "utf8");
  assert.equal(manifest.exports["./dev-otp"], "./src/dev-otp.ts");
  assert.equal(manifest.exports["./dev-order-notifications"], "./src/dev-order-notifications.ts");
  assert.doesNotMatch(rootApi, /dev-otp|dev-order-notifications/);
});

test("self-host image installs production workspace links instead of relying on source-relative package coupling", async () => {
  const dockerfile = await readFile(new URL("infra/selfhost/Dockerfile", root), "utf8");
  assert.match(dockerfile, /npm install --omit=dev --ignore-scripts --package-lock=false/);
});
