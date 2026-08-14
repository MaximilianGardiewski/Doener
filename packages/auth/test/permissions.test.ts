import test from "node:test";
import assert from "node:assert/strict";
import { hasPermission } from "../src/permissions.ts";

test("staff can operate orders but cannot change prices", () => {
  assert.equal(hasPermission("staff", "orders:operate"), true);
  assert.equal(hasPermission("staff", "availability:snooze"), true);
  assert.equal(hasPermission("staff", "pricing:edit"), false);
  assert.equal(hasPermission("staff", "menu:edit"), false);
});

test("admin can edit menu and pricing", () => {
  assert.equal(hasPermission("admin", "menu:edit"), true);
  assert.equal(hasPermission("admin", "pricing:edit"), true);
});
