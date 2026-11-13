import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const js = await readFile(new URL("apps/mcello/public/doner-yufka-cinematic-stage.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/doner-yufka-cinematic-stage.css", root), "utf8");
const publicContent = await readFile(new URL("apps/mcello/public/public-content.js", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const manifest = JSON.parse(await readFile(new URL("apps/mcello/public/media/concept/doner-v2/manifest.json", root), "utf8"));

const assets = ["upper-pide.webp","lower-pide.webp","veal-doner.webp","tomato.webp","cucumber.webp","red-onion.webp","iceberg-lettuce.webp","garlic-sauce.webp","spicy-sauce.webp"];

test("cinematic Döner stage is activated after the existing Builder Core", () => {
  assert.match(publicContent, /import "\.\/builder-core-v2\.js";\s*import "\.\/doner-yufka-cinematic-stage\.js";/);
  assert.match(js, /modal\.dataset\.productBuilder = "doner-yufka"/);
  assert.match(js, /PRODUCT_IDS/);
  assert.match(js, /warm-013.*warm-014.*warm-015/);
  assert.doesNotMatch(js, /warm-016|warm-017|warm-018/);
});

test("stage mirrors checked modifier inputs and keeps unsupported visuals explicit", () => {
  assert.match(js, /input\?\.checked/);
  assert.match(js, /missing-falafel/);
  assert.match(js, /missing-curry/);
  assert.match(js, /KI-Konzeptvisualisierung/);
  assert.doesNotMatch(js, /\.checked\s*=|fetch\s*\(|localStorage|sessionStorage|configuredPrice|configurationValid|cart\s*=/);
});

test("all nine concept layers are local, normalized and referenced by the service worker", () => {
  assert.equal(manifest.assets.length, 9);
  assert.equal(manifest.normalization.canvas[0], 768);
  assert.equal(manifest.normalization.alpha, false);
  for (const file of assets) {
    assert.ok(manifest.assets.some((asset) => asset.file === file));
    assert.ok(sw.includes(`/media/concept/doner-v2/${file}`));
    assert.ok(js.includes(file));
  }
  assert.match(sw, /mcello-public-shell-v35/);
});

test("Döner/Yufka remains usable in portrait and honors reduced motion", () => {
  assert.match(css, /data-builder-orientation="portrait"/);
  assert.match(css, /builder-orientation-gate/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /mix-blend-mode:\s*screen/);
});
