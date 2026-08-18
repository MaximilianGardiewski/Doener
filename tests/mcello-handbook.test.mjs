import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../apps/mcello/public/handbook.html", import.meta.url), "utf8");
const js = await readFile(new URL("../apps/mcello/public/handbook.js", import.meta.url), "utf8");
const shell = await readFile(new URL("../apps/mcello/public/operations-shell.js", import.meta.url), "utf8");
const sw = await readFile(new URL("../apps/mcello/public/sw.js", import.meta.url), "utf8");
const shared = await readFile(new URL("../apps/mcello/public/handbook/shared.md", import.meta.url), "utf8");
const staff = await readFile(new URL("../apps/mcello/public/handbook/staff.md", import.meta.url), "utf8");
const admin = await readFile(new URL("../apps/mcello/public/handbook/admin.md", import.meta.url), "utf8");

test("D073 handbook is integrated and Git/Markdown backed", () => {
  assert.match(html, /Mcello Handbuch/);
  assert.match(js, /\/handbook\/shared\.md/);
  assert.match(js, /\/handbook\/staff\.md/);
  assert.match(js, /\/handbook\/admin\.md/);
  assert.match(shared, /Git-Repository/);
  assert.match(staff, /Rush/);
  assert.match(admin, /Self-host/);
});

test("handbook remains presentation-only and does not broaden authorization", () => {
  assert.match(shell, /roles: \["admin", "staff"\]/);
  assert.match(shell, /\/handbook\.html\?role=\$\{role\}/);
  assert.doesNotMatch(js, /\/api\//);
  assert.doesNotMatch(js, /rpc\(|supabase|service_role/i);
  assert.match(shared, /Navigation und Handbuchanzeige ändern keine Berechtigungen/);
});

test("handbook assets are available through the existing offline app shell", () => {
  for (const asset of ["/handbook.html", "/handbook.js", "/handbook.css", "/handbook/shared.md", "/handbook/staff.md", "/handbook/admin.md"]) {
    assert.match(sw, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(sw, /url\.pathname === "\/handbook\.html"/);
});