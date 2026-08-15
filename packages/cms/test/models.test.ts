import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeHomepageSections,
  visibleEditorialPosts,
  type EditorialPost,
} from "../src/models.ts";

test("editorial visibility respects schedule and pins visible posts", () => {
  const posts: EditorialPost[] = [
    { id: "later", kind: "event", title: "Later", body: "", pinned: true, visibleFrom: "2026-08-16T12:00:00Z" },
    { id: "normal", kind: "news", title: "Normal", body: "", pinned: false },
    { id: "pinned", kind: "special", title: "Pinned", body: "", pinned: true, visibleUntil: "2026-08-15T13:00:00Z" },
    { id: "expired", kind: "press", title: "Expired", body: "", pinned: false, visibleUntil: "2026-08-15T11:59:59Z" },
  ];

  assert.deepEqual(
    visibleEditorialPosts(posts, "2026-08-15T12:00:00Z").map((post) => post.id),
    ["pinned", "normal"],
  );
});

test("homepage composition keeps the required brand and ordering entry points", () => {
  const sections = normalizeHomepageSections([
    { id: "q", kind: "quick_order", enabled: false, position: 40 },
    { id: "h", kind: "hero", enabled: false, position: 30 },
    { id: "g", kind: "gallery", enabled: false, position: 10 },
  ]);

  assert.equal(sections.length, 6);
  assert.equal(sections.find((section) => section.kind === "hero")?.enabled, true);
  assert.equal(sections.find((section) => section.kind === "quick_order")?.enabled, true);
  assert.equal(sections.find((section) => section.kind === "gallery")?.enabled, false);
  assert.equal(sections[0]?.kind, "gallery");
});
