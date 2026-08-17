import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const mcelloPackage = JSON.parse(await readFile(new URL("../apps/mcello/package.json", import.meta.url), "utf8"));
const rootPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const status = await readFile(new URL("../apps/mcello/public/status.js", import.meta.url), "utf8");

async function missing(relative) {
  try {
    await access(new URL(relative, import.meta.url));
    return false;
  } catch {
    return true;
  }
}

test("root and package dev commands converge on the canonical runtime", () => {
  assert.match(rootPackage.scripts["preview:mcello"], /apps\/mcello\/run\.mjs/);
  assert.match(mcelloPackage.scripts.dev, /run\.mjs/);
  assert.doesNotMatch(mcelloPackage.scripts.dev, /dev-server\.mjs/);
});

test("stale shadow implementations stay removed", async () => {
  assert.equal(await missing("../apps/mcello/dev-server.mjs"), true);
  assert.equal(await missing("../apps/mcello/public/app-v2.js"), true);
  assert.equal(await missing("../apps/mcello/public/kds-v2.js"), true);
});

test("preview cannot be indexed accidentally before factual launch approval", () => {
  const header = vercel.headers?.flatMap((entry) => entry.headers || []).find((entry) => entry.key === "X-Robots-Tag");
  assert.equal(header?.value, "noindex, nofollow, noarchive");
});

test("completed customer status marks every progress step finished", () => {
  assert.match(status, /if \(state === "completed"\) return 3/);
});
