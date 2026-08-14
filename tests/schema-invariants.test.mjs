import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
const migrationNames = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
const sql = (await Promise.all(migrationNames.map((name) => readFile(new URL(name, migrationsDir), "utf8")))).join("\n");

test("bootstrap and last-admin race guards are present", () => {
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('business_web_factory:user_roles:bootstrap_admin'\)\)/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('business_web_factory:user_roles:last_admin'\)\)/);
});

test("Mcello operational defaults match discovery", () => {
  assert.match(sql, /acceptance_timeout_minutes integer not null default 5/);
  assert.match(sql, /slot_minutes integer not null default 15/);
  assert.match(sql, /delivery_enabled boolean not null default false/);
});

test("future effort capacity is prepared but optional", () => {
  assert.match(sql, /effort_weight numeric\(8,2\)/);
});

test("anonymous clients have no direct order policy", () => {
  const orderPolicyLines = sql
    .split("\n")
    .filter((line) => /create policy/i.test(line) && /orders/i.test(line));
  assert.equal(orderPolicyLines.some((line) => /\banon\b/i.test(line)), false);
});

test("bootstrap status is not exposed to anonymous users", () => {
  assert.doesNotMatch(sql, /grant execute on function public\.is_bootstrap_open\(\) to anon/i);
});
