import type { PublicationStatus } from "@business-web/cms";

import type { LunchItem, LunchWeek } from "../domain/cms.ts";

export type LunchEditorialStatus = Extract<PublicationStatus, "draft" | "published" | "archived">;

export type LunchItemDraft = Pick<
  LunchItem,
  "weekday" | "dish" | "description" | "price" | "allergens" | "sort"
>;

export interface LunchWeekDraft {
  note: string | null;
  items: LunchItemDraft[];
}

export interface LunchPublicationIssue {
  code:
    | "invalid-date-range"
    | "incomplete-weekdays"
    | "blank-dish"
    | "negative-price";
  message: string;
  weekday?: number;
}

export interface LebtigLunchCmsPort {
  listStaffWeeks(): Promise<LunchWeek[]>;
  listPublicWeeks(nowIso: string): Promise<LunchWeek[]>;
  getStaffWeek(weekId: string): Promise<LunchWeek>;
  createWeek(weekStart: string): Promise<LunchWeek>;
  saveWeek(weekId: string, draft: LunchWeekDraft): Promise<LunchWeek>;
  setStatus(weekId: string, status: LunchEditorialStatus): Promise<LunchWeek>;
  copyToFollowingWeek(sourceWeekId: string): Promise<LunchWeek>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_WEEKDAYS = [1, 2, 3, 4, 5] as const;

function parseIsoDate(value: string): number | null {
  if (!ISO_DATE.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateLunchWeekForPublication(week: LunchWeek): LunchPublicationIssue[] {
  const issues: LunchPublicationIssue[] = [];
  const start = parseIsoDate(week.week_start);
  const end = parseIsoDate(week.week_end);

  if (start === null || end === null || end < start) {
    issues.push({
      code: "invalid-date-range",
      message: "Das Ende der Mittagstischwoche muss am oder nach dem Start liegen.",
    });
  }

  const items = week.lunch_items ?? [];
  const weekdays = new Set(items.map((item) => item.weekday));
  if (
    items.length !== REQUIRED_WEEKDAYS.length ||
    REQUIRED_WEEKDAYS.some((weekday) => !weekdays.has(weekday))
  ) {
    issues.push({
      code: "incomplete-weekdays",
      message: "Vor der Veröffentlichung müssen Montag bis Freitag vollständig vorhanden sein.",
    });
  }

  for (const item of items) {
    if (item.dish.trim().length === 0) {
      issues.push({
        code: "blank-dish",
        weekday: item.weekday,
        message: `Für Wochentag ${item.weekday} fehlt ein Gericht.`,
      });
    }
    if (item.price !== null && item.price < 0) {
      issues.push({
        code: "negative-price",
        weekday: item.weekday,
        message: `Der Preis für Wochentag ${item.weekday} darf nicht negativ sein.`,
      });
    }
  }

  return issues;
}

export function isLunchWeekPublishable(week: LunchWeek): boolean {
  return validateLunchWeekForPublication(week).length === 0;
}

export function nextMondayIso(nowIso: string): string {
  const now = new Date(nowIso);
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid date for next Monday calculation");

  const utcDay = now.getUTCDay();
  const daysUntilMonday = ((8 - utcDay) % 7) || 7;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday));
  return next.toISOString().slice(0, 10);
}

export function followingWeekStartIso(weekStart: string): string {
  const parsed = parseIsoDate(weekStart);
  if (parsed === null) throw new Error("Invalid lunch week start date");
  return new Date(parsed + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function splitPublicLunchWeeks(
  weeks: readonly LunchWeek[],
  todayIso: string,
): { current: LunchWeek | null; archive: LunchWeek[] } {
  const today = todayIso.slice(0, 10);
  const published = weeks
    .filter((week) => week.status === "published")
    .slice()
    .sort((a, b) => b.week_start.localeCompare(a.week_start));

  const current = published.find((week) => week.week_start <= today && today <= week.week_end) ?? null;
  return {
    current,
    archive: published.filter((week) => week.id !== current?.id),
  };
}
