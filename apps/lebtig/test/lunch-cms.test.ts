import assert from "node:assert/strict";
import test from "node:test";

import type { LunchItem, LunchWeek } from "../src/domain/cms.ts";
import {
  followingWeekStartIso,
  nextMondayIso,
  splitPublicLunchWeeks,
  validateLunchWeekForPublication,
} from "../src/cms/lunch.ts";

function item(weekday: number, dish = `Gericht ${weekday}`, price: number | null = 10): LunchItem {
  return {
    id: `item-${weekday}`,
    week_id: "week-1",
    weekday,
    dish,
    description: null,
    price,
    allergens: null,
    image_url: null,
    sort: weekday,
  };
}

function week(overrides: Partial<LunchWeek> = {}): LunchWeek {
  return {
    id: "week-1",
    week_start: "2026-08-17",
    week_end: "2026-08-21",
    status: "draft",
    publish_at: null,
    note: null,
    updated_at: "2026-08-18T00:00:00.000Z",
    lunch_items: [1, 2, 3, 4, 5].map((weekday) => item(weekday)),
    ...overrides,
  };
}

test("publication requires a complete Monday to Friday week", () => {
  assert.deepEqual(validateLunchWeekForPublication(week()), []);

  const incomplete = week({ lunch_items: [item(1), item(2), item(3), item(4)] });
  assert.ok(validateLunchWeekForPublication(incomplete).some((issue) => issue.code === "incomplete-weekdays"));
});

test("blank dishes and negative prices are publication blockers", () => {
  const candidate = week({
    lunch_items: [item(1), item(2, "   "), item(3, "Gericht", -1), item(4), item(5)],
  });
  const issues = validateLunchWeekForPublication(candidate);
  assert.ok(issues.some((issue) => issue.code === "blank-dish" && issue.weekday === 2));
  assert.ok(issues.some((issue) => issue.code === "negative-price" && issue.weekday === 3));
});

test("invalid date ranges are rejected before publication", () => {
  const issues = validateLunchWeekForPublication(week({ week_end: "2026-08-16" }));
  assert.ok(issues.some((issue) => issue.code === "invalid-date-range"));
});

test("next and following week helpers remain UTC deterministic", () => {
  assert.equal(nextMondayIso("2026-08-18T12:00:00.000Z"), "2026-08-24");
  assert.equal(nextMondayIso("2026-08-24T08:00:00.000Z"), "2026-08-31");
  assert.equal(followingWeekStartIso("2026-08-17"), "2026-08-24");
});

test("public split selects the current published week and keeps prior/future weeks in archive", () => {
  const current = week({ id: "current", status: "published" });
  const previous = week({
    id: "previous",
    week_start: "2026-08-10",
    week_end: "2026-08-14",
    status: "published",
  });
  const future = week({
    id: "future",
    week_start: "2026-08-24",
    week_end: "2026-08-28",
    status: "published",
  });
  const draft = week({ id: "draft", status: "draft" });

  const result = splitPublicLunchWeeks([previous, current, future, draft], "2026-08-18T09:00:00.000Z");
  assert.equal(result.current?.id, "current");
  assert.deepEqual(result.archive.map((entry) => entry.id), ["future", "previous"]);
});
