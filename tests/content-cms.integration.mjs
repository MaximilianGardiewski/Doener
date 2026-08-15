import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260815013000_content_cms_backoffice.sql", import.meta.url),
  "utf8",
);
const server = await readFile(new URL("../apps/mcello/server.mjs", import.meta.url), "utf8");
const publicApp = await readFile(new URL("../apps/mcello/public/app.js", import.meta.url), "utf8");

test("editorial publishing is admin-only and public reads are schedule filtered", () => {
  assert.match(migration, /create or replace function public\.admin_save_editorial_post/);
  assert.match(migration, /perform public\.require_admin\(\)/);
  assert.match(migration, /status = 'published'/);
  assert.match(migration, /visible_from is null or ep\.visible_from <= _at/);
  assert.match(migration, /visible_until is null or ep\.visible_until >= _at/);
  assert.match(migration, /grant execute on function public\.get_public_homepage\(uuid, timestamptz\) to anon/);
  assert.match(migration, /revoke all on function public\.admin_save_editorial_post[\s\S]+from public, anon/);
});

test("constrained homepage composition preserves required V1 entry points", () => {
  assert.match(migration, /All controlled homepage sections are required/);
  assert.match(migration, /section_key in \('hero', 'quick_order'\)/);
  assert.match(migration, /section_enabled := true/);
});

test("runtime exposes the CMS snapshot to public and admin surfaces", () => {
  assert.match(server, /url\.pathname === "\/api\/homepage"/);
  assert.match(server, /url\.pathname === "\/api\/admin\/content"/);
  assert.match(server, /admin_save_homepage_sections/);
  assert.match(server, /admin_save_editorial_post/);
  assert.match(publicApp, /fetch\("\/api\/homepage"/);
  assert.match(publicApp, /applyHomepageContent/);
});
