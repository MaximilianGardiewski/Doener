import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const js = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const seed = JSON.parse(await readFile(new URL("data/mcello/menu-seed.provisional.json", root), "utf8"));

const ids = ["warm-013","warm-014","warm-015","warm-016","warm-017","warm-018"];

test("Döner/Yufka Builder is limited to explicit first-party product ids", () => {
  const seeded = new Map(seed.items.map((item) => [item[0], item]));
  for (const id of ids) assert.ok(seeded.has(id));
  for (const id of ids) assert.match(js, new RegExp(id));
  assert.match(js, /dataset\.productBuilder = "doner-yufka"/);
});

test("current assembly layer count stays zero because those products have no structured modifiers", () => {
  const selected = seed.items.filter((item) => ids.includes(item[0]));
  assert.ok(selected.every((item) => Array.isArray(item[5]) && item[5].length === 0));
  assert.match(js, /dataset\.assemblyVisualLayers = "0"/);
});

test("assembly specialization is visual only and distinct from Pizza top-down", () => {
  assert.match(css, /data-product-builder="doner-yufka"/);
  assert.match(css, /perspective\(900px\)/);
  assert.doesNotMatch(css, /data-pizza-stage|top-down/);
  assert.doesNotMatch(js, /price|localStorage|sessionStorage|fetch\s*\(|cart\s*=|availableNow|soldOut/i);
});

test("Döner/Yufka assets remain in the versioned offline shell while business data stays network-only", () => {
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /doner-yufka-builder-v2\.js/);
  assert.match(sw, /doner-yufka-builder-v2\.css/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});
