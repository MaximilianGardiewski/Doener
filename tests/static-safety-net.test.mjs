import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const tsconfig = JSON.parse(await readFile(new URL("tsconfig.json", root), "utf8"));
const scanner = await readFile(new URL("scripts/check-static.mjs", root), "utf8");

test("root check runs a real no-emit TypeScript compiler before the test suites", () => {
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit -p tsconfig.json");
  assert.match(pkg.scripts.check, /^npm run typecheck && /);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.allowImportingTsExtensions, true);
  assert.deepEqual(tsconfig.include, ["packages/**/*.ts"]);
});

test("static syntax check recursively scans app and script JavaScript instead of a manual filename list", () => {
  assert.equal(pkg.scripts["check:static"], "node scripts/check-static.mjs");
  assert.match(scanner, /const roots = \["apps", "scripts"\]/);
  assert.match(scanner, /extensions = new Set\(\["\.js", "\.mjs", "\.cjs"\]\)/);
  assert.match(scanner, /files\.push\(\.\.\.await collect\(absolute\)\)/);
  assert.doesNotMatch(pkg.scripts["check:static"], /apps\/mcello\/public\/app\.js/);
});

test("compiler and Node types are pinned for reproducible CI", () => {
  assert.equal(pkg.devDependencies.typescript, "6.0.3");
  assert.equal(pkg.devDependencies["@types/node"], "22.20.1");
});
