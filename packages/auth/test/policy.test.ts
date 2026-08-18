import test from "node:test";
import assert from "node:assert/strict";
import {
  createPermissionChecker,
  hasPermission,
  type PermissionPolicy,
} from "../src/permissions.ts";

test("generic permission checker supports consumer-specific role vocabularies", () => {
  type Role = "owner" | "editor";
  type Permission = "publish" | "users";
  const policy: PermissionPolicy<Role, Permission> = {
    owner: new Set(["publish", "users"]),
    editor: new Set(["publish"]),
  };
  const can = createPermissionChecker(policy);
  assert.equal(can("owner", "users"), true);
  assert.equal(can("editor", "publish"), true);
  assert.equal(can("editor", "users"), false);
});

test("existing Mcello staff boundary remains unchanged", () => {
  assert.equal(hasPermission("staff", "orders:operate"), true);
  assert.equal(hasPermission("staff", "menu:edit"), false);
  assert.equal(hasPermission("staff", "users:manage"), false);
  assert.equal(hasPermission("admin", "users:manage"), true);
});
