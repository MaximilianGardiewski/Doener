import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const admin = await readFile(new URL("apps/mcello/public/admin.html", root), "utf8");
const ops = await readFile(new URL("apps/mcello/public/ops.html", root), "utf8");
const kds = await readFile(new URL("apps/mcello/public/kds.html", root), "utf8");
const shellJs = await readFile(new URL("apps/mcello/public/operations-shell.js", root), "utf8");
const shellCss = await readFile(new URL("apps/mcello/public/operations-shell.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("D072 attaches one shared Operations shell to Admin, Ops and KDS", () => {
  assert.match(admin, /data-operations-area="admin" data-operations-role="admin"/);
  assert.match(ops, /data-operations-area="ops" data-operations-role="staff"/);
  assert.match(kds, /data-operations-area="kds" data-operations-role="staff"/);
  for (const page of [admin, ops, kds]) {
    assert.match(page, /operations-shell\.css/);
    assert.match(page, /operations-shell\.js/);
  }
});

test("D072 navigation keeps structural Admin destinations out of the Staff link set", () => {
  assert.match(shellJs, /roles: \["admin"\]/);
  assert.match(shellJs, /roles: \["admin", "staff"\]/);
  for (const path of ["/admin.html", "/content.html", "/product-media.html", "/labels.html", "/schedule.html"]) {
    assert.match(shellJs, new RegExp(path.replace(".", "\\.")));
  }
  assert.match(shellJs, /role === "admin" \? "Admin" : "Betrieb"/);
  assert.doesNotMatch(shellJs, /fetch\s*\(|\/api\/|\.rpc\s*\(|supabase|auth/i);
});

test("D072 shell provides desktop sidebar, tablet rail, phone drawer and reduced motion", () => {
  assert.match(shellCss, /grid-template-columns: var\(--mc-ops-rail\) minmax\(0, 1fr\)/);
  assert.match(shellCss, /max-width: 1100px/);
  assert.match(shellCss, /--mc-ops-rail: 88px/);
  assert.match(shellCss, /max-width: 760px/);
  assert.match(shellCss, /transform: translateX\(-105%\)/);
  assert.match(shellCss, /body\.mc-ops-menu-open \.mc-ops-nav/);
  assert.match(shellCss, /prefers-reduced-motion: reduce/);
});

test("D072 shell assets remain available through the PWA shell cache", () => {
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /"\/operations-shell\.js"/);
  assert.match(sw, /"\/operations-shell\.css"/);
});