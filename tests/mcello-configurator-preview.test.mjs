import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("apps/mcello/public/configurator-preview.html", root), "utf8");
const client = await readFile(new URL("apps/mcello/public/configurator-preview.js", root), "utf8");
const launcher = await readFile(new URL("scripts/preview-mcello-configurator.mjs", root), "utf8");
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

test("Configurator Device Lab embeds the real local presentation client instead of a copied configurator", () => {
  assert.match(html, /<iframe[^>]+id="mcelloPreview"[^>]+src="\/?\?presentation=mcello#bestellen"/i);
  assert.match(html, /data-device="desktop"/);
  assert.match(html, /data-device="tablet"/);
  assert.match(html, /data-device="phone"/);
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(client, /frame\.contentDocument/);
  assert.match(client, /querySelectorAll\("\[data-product\]"\)/);
  assert.match(client, /target\.click\(\)/);
});

test("Device Lab is local/private-LAN only and owns no commerce or backend state", () => {
  assert.match(client, /function isPreviewOrigin\(\)/);
  assert.match(client, /isPrivateIpv4/);
  assert.match(client, /isPrivateSslipHost/);
  assert.match(client, /protocol === "http:"/);
  assert.doesNotMatch(client, /\/api\//i);
  assert.doesNotMatch(client, /localStorage|sessionStorage|state\.cart|priceDelta|configuredPrice|configurationValid|supabase/i);
  assert.doesNotMatch(client, /fetch\s*\(/i);
});

test("one-command preview launcher starts only the existing local Mcello development composition", () => {
  assert.equal(pkg.scripts["preview:mcello:configurator"], "node scripts/preview-mcello-configurator.mjs");
  assert.match(launcher, /apps\/mcello\/run\.mjs/);
  assert.match(launcher, /http:\/\/127\.0\.0\.1:\$\{port\}\/configurator-preview\.html\?presentation=mcello/);
  assert.doesNotMatch(launcher, /vercel|deploy|https:\/\//i);
});
