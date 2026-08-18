import test from "node:test";
import assert from "node:assert/strict";
import { filterPublishedAt, isPublishedAt } from "../src/models.ts";

const now = "2026-08-18T12:00:00.000Z";

test("published content respects publish and visibility windows", () => {
  assert.equal(isPublishedAt({ status: "draft" }, now), false);
  assert.equal(isPublishedAt({ status: "published" }, now), true);
  assert.equal(isPublishedAt({ status: "published", publishAt: "2026-08-19T00:00:00.000Z" }, now), false);
  assert.equal(isPublishedAt({ status: "published", visibleFrom: "2026-08-18T10:00:00.000Z" }, now), true);
  assert.equal(isPublishedAt({ status: "published", visibleUntil: "2026-08-18T11:59:59.000Z" }, now), false);
});

test("filterPublishedAt preserves only visible published records", () => {
  const items = [
    { id: "a", status: "published" as const },
    { id: "b", status: "draft" as const },
    { id: "c", status: "published" as const, visibleUntil: "2026-08-18T13:00:00.000Z" },
  ];
  assert.deepEqual(filterPublishedAt(items, now).map((item) => item.id), ["a", "c"]);
});
