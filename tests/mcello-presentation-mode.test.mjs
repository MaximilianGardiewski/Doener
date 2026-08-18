import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const mode = await readFile(new URL("apps/mcello/public/presentation-mode.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/presentation-mode.css", root), "utf8");
const publicContent = await readFile(new URL("apps/mcello/public/public-content.js", root), "utf8");
const launcher = await readFile(new URL("scripts/demo-mcello.ps1", root), "utf8");
const lanWrapper = await readFile(new URL("scripts/demo-mcello-presentation-lan.ps1", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

test("presentation mode is explicit and restricted to local/private HTTP demo origins", () => {
  assert.match(mode, /presentation=mcello/);
  assert.match(mode, /localhost|127\.0\.0\.1/);
  assert.match(mode, /privateLanHost|localDemoOrigin/);
  assert.match(mode, /protocol !== "http:"/);
});

test("presentation reset clears only browser-local demo state and uses the real cart key", () => {
  assert.match(mode, /localStorage\.removeItem\("mcello-cart-v1"\)/);
  assert.doesNotMatch(mode, /fetch\s*\(|\/api\//);
});

test("presentation mode remains visibly labeled instead of masquerading as production", () => {
  assert.match(mode, /MCELLO PRESENTATION · lokale Demo · Produktdaten teilweise vorläufig/);
  assert.match(mode, /Demo neu starten/);
  assert.match(css, /data-presentation-mode="mcello"/);
  assert.match(publicContent, /import "\.\/presentation-mode\.js";/);
});

test("desktop launcher opens a clean presentation URL and shell caches presentation assets", () => {
  assert.match(launcher, /\?presentation=mcello&reset=1/);
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /"\/presentation-mode\.js"/);
  assert.match(sw, /"\/presentation-mode\.css"/);
});

test("recommended LAN command installs Builder fixtures after the private LAN runtime is ready", () => {
  assert.match(packageJson.scripts["demo:mcello:lan"], /demo-mcello-presentation-lan\.ps1/);
  const runtimeIndex = lanWrapper.indexOf('demo-mcello-lan.ps1');
  const builderIndex = lanWrapper.indexOf('import-mcello-presentation-builders.mjs');
  assert.ok(runtimeIndex >= 0);
  assert.ok(builderIndex > runtimeIndex);
  assert.match(lanWrapper, /\?presentation=mcello&reset=1/);
});