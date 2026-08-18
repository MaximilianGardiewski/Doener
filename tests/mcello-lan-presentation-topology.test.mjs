import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const lan = await readFile(new URL("scripts/demo-mcello-lan.ps1", root), "utf8");
const wrapper = await readFile(new URL("scripts/demo-mcello-presentation-lan.ps1", root), "utf8");

test("LAN presentation keeps laptop host, smartphone customer and tablet staff roles explicit", () => {
  assert.match(lan, /PHONE \/ CUSTOMER/);
  assert.match(lan, /IPAD \/ Mcello STAFF/);
  assert.match(lan, /\/kds\.html/);
  assert.match(lan, /\/ops\.html/);
  assert.match(lan, /\/admin\.html/);
});

test("presentation wrapper installs the real local Builder fixtures after the LAN runtime", () => {
  const runtime = wrapper.indexOf("demo-mcello-lan.ps1");
  const fixtures = wrapper.indexOf("import-mcello-presentation-builders.mjs");
  assert.ok(runtime >= 0);
  assert.ok(fixtures > runtime);
  assert.match(wrapper, /\?presentation=mcello&reset=1/);
});
