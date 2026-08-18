import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const lan = await readFile(new URL("scripts/demo-mcello-lan.ps1", root), "utf8");
const wrapper = await readFile(new URL("scripts/demo-mcello-presentation-lan.ps1", root), "utf8");

test("LAN base launcher exposes customer and staff surfaces only on the private demo ingress", () => {
  assert.match(lan, /PHONE \/ CUSTOMER/);
  assert.match(lan, /\/kds\.html/);
  assert.match(lan, /\/ops\.html/);
  assert.match(lan, /\/admin\.html/);
  assert.match(lan, /127\.0\.0\.1:4173/);
});

test("presentation wrapper makes laptop host, smartphone customer and tablet staff/admin roles explicit", () => {
  assert.match(wrapper, /Laptop = HOST \| Smartphone = CUSTOMER \| Tablet = STAFF \/ ADMIN/);
  assert.match(wrapper, /SMARTPHONE \/ CUSTOMER/);
  assert.match(wrapper, /TABLET \/ STAFF \+ ADMIN/);
  assert.match(wrapper, /LAPTOP \/ HOST — ALLE ANSICHTEN/);
  assert.match(wrapper, /hostPresentationBaseUrl = 'http:\/\/127\.0\.0\.1'/);
  assert.match(wrapper, /\$hostPresentationBaseUrl\/\?presentation=mcello&reset=1/);
  assert.match(wrapper, /\$hostPresentationBaseUrl\/kds\.html/);
  assert.match(wrapper, /\$hostPresentationBaseUrl\/ops\.html/);
  assert.match(wrapper, /\$hostPresentationBaseUrl\/admin\.html/);
  assert.doesNotMatch(wrapper, /127\.0\.0\.1:4173\/\?presentation=mcello&reset=1/);
  assert.match(wrapper, /Start-Process \$view\.Url/);
});

test("presentation wrapper isolates laptop browser navigation from shared dev-port service workers", () => {
  assert.match(wrapper, /service workers\/PWA caches/);
  assert.match(wrapper, /LAN-Proxy auf Port 80/);
  assert.doesNotMatch(wrapper, /Url = 'http:\/\/127\.0\.0\.1:4173/);
});

test("presentation wrapper installs the real local Builder fixtures after the LAN runtime", () => {
  const runtime = wrapper.indexOf("demo-mcello-lan.ps1");
  const fixtures = wrapper.indexOf("import-mcello-presentation-builders.mjs");
  assert.ok(runtime >= 0);
  assert.ok(fixtures > runtime);
  assert.match(wrapper, /\?presentation=mcello&reset=1/);
  assert.doesNotMatch(wrapper, /vercel\.app/i);
});
