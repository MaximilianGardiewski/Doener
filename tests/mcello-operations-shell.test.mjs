import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [admin, ops, kds, shellJs, shellCss, sw] = await Promise.all([
  readFile(new URL("apps/mcello/public/admin.html", root), "utf8"),
  readFile(new URL("apps/mcello/public/ops.html", root), "utf8"),
  readFile(new URL("apps/mcello/public/kds.html", root), "utf8"),
  readFile(new URL("apps/mcello/public/operations-shell.js", root), "utf8"),
  readFile(new URL("apps/mcello/public/operations-shell.css", root), "utf8"),
  readFile(new URL("apps/mcello/public/sw.js", root), "utf8"),
]);

test("D072 attaches one shared Operations shell to Admin, Ops and KDS", () => {
  for (const page of [admin, ops, kds]) {
    assert.match(page, /href="\/operations-shell\.css"/);
    assert.match(page, /src="\/operations-shell\.js"/);
  }

  assert.match(admin, /data-operations-area="admin" data-operations-role="admin"/);
  assert.match(ops, /data-operations-area="ops" data-operations-role="staff"/);
  assert.match(kds, /data-operations-area="kds" data-operations-role="staff"/);
});

test("D072 navigation keeps structural Admin destinations out of the Staff link set", () => {
  assert.match(shellJs, /roles: \["admin"\]/);
  assert.match(shellJs, /roles: \["admin", "staff"\]/);
  assert.match(shellJs, /allLinks\.filter\(\(link\) => link\.roles\.includes\(role\)\)/);
  assert.match(shellJs, /Navigation is presentation\/IA only/);

  assert.doesNotMatch(shellJs, /fetch\s*\(/);
  assert.doesNotMatch(shellJs, /\/api\//);
  assert.doesNotMatch(shellJs, /supabase/i);
  assert.doesNotMatch(shellJs, /\.rpc\s*\(/);
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
  assert.match(sw, /mcello-public-shell-v21/);
  assert.match(sw, /"\/operations-shell\.js"/);
  assert.match(sw, /"\/operations-shell\.css"/);
});
