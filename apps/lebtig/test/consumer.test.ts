import test from "node:test";
import assert from "node:assert/strict";
import { isLebtigPublished } from "../src/domain/cms.ts";
import { hasLebtigPermission } from "../src/domain/roles.ts";

test("Lebtig moderator matches the documented editorial boundary", () => {
  assert.equal(hasLebtigPermission("moderator", "content:edit"), true);
  assert.equal(hasLebtigPermission("moderator", "content:publish"), true);
  assert.equal(hasLebtigPermission("moderator", "media:manage"), true);
  assert.equal(hasLebtigPermission("moderator", "inquiries:manage"), true);
  assert.equal(hasLebtigPermission("moderator", "inquiries:delete"), false);
  assert.equal(hasLebtigPermission("moderator", "pages:manage"), false);
  assert.equal(hasLebtigPermission("moderator", "settings:manage"), false);
  assert.equal(hasLebtigPermission("moderator", "users:manage"), false);
});

test("Lebtig admin retains structural and user-management permissions", () => {
  for (const permission of [
    "content:edit",
    "content:publish",
    "media:manage",
    "inquiries:manage",
    "inquiries:delete",
    "pages:manage",
    "settings:manage",
    "users:manage",
  ] as const) {
    assert.equal(hasLebtigPermission("admin", permission), true);
  }
});

test("Lebtig publication mapping reuses the shared CMS window contract", () => {
  const now = "2026-08-18T12:00:00.000Z";
  assert.equal(isLebtigPublished({ status: "published", publish_at: null }, now), true);
  assert.equal(isLebtigPublished({ status: "draft", publish_at: null }, now), false);
  assert.equal(isLebtigPublished({
    status: "published",
    publish_at: "2026-08-18T10:00:00.000Z",
    start_at: "2026-08-18T11:00:00.000Z",
    end_at: "2026-08-18T13:00:00.000Z",
  }, now), true);
  assert.equal(isLebtigPublished({
    status: "published",
    publish_at: "2026-08-18T13:00:00.000Z",
  }, now), false);
});
