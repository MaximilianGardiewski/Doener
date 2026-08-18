import type { SupabaseClient } from "@supabase/supabase-js";

import type { LunchItem, LunchWeek } from "../domain/cms.ts";
import type {
  LebtigLunchCmsPort,
  LunchEditorialStatus,
  LunchWeekDraft,
} from "./lunch.ts";

const WEEK_SELECT = `
  id,
  week_start,
  week_end,
  status,
  publish_at,
  note,
  updated_at,
  lunch_items (
    id,
    week_id,
    weekday,
    dish,
    description,
    price,
    allergens,
    image_url,
    sort
  )
`;

function asError(error: { message?: string } | null | undefined, fallback: string): Error {
  return new Error(error?.message || fallback);
}

function normalizePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeItem(row: Record<string, unknown>): LunchItem {
  return {
    id: String(row.id),
    week_id: String(row.week_id),
    weekday: Number(row.weekday),
    dish: String(row.dish ?? ""),
    description: row.description === null || row.description === undefined ? null : String(row.description),
    price: normalizePrice(row.price),
    allergens: row.allergens === null || row.allergens === undefined ? null : String(row.allergens),
    image_url: row.image_url === null || row.image_url === undefined ? null : String(row.image_url),
    sort: Number(row.sort ?? 0),
  };
}

function normalizeWeek(row: Record<string, unknown>): LunchWeek {
  const rawItems = Array.isArray(row.lunch_items) ? row.lunch_items : [];
  const items = rawItems
    .map((item) => normalizeItem(item as Record<string, unknown>))
    .sort((a, b) => a.weekday - b.weekday || a.sort - b.sort);

  return {
    id: String(row.id),
    week_start: String(row.week_start),
    week_end: String(row.week_end),
    status: String(row.status) as LunchWeek["status"],
    publish_at: row.publish_at === null || row.publish_at === undefined ? null : String(row.publish_at),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    updated_at: String(row.updated_at),
    lunch_items: items,
  };
}

async function readWeek(client: SupabaseClient, weekId: string): Promise<LunchWeek> {
  const result = await client
    .from("lunch_weeks")
    .select(WEEK_SELECT)
    .eq("id", weekId)
    .single();

  if (result.error || !result.data) throw asError(result.error, "Mittagstischwoche konnte nicht geladen werden.");
  return normalizeWeek(result.data as Record<string, unknown>);
}

export function createSupabaseLunchCmsPort(client: SupabaseClient): LebtigLunchCmsPort {
  return {
    async listStaffWeeks() {
      const result = await client
        .from("lunch_weeks")
        .select(WEEK_SELECT)
        .order("week_start", { ascending: false });
      if (result.error) throw asError(result.error, "Mittagstischwochen konnten nicht geladen werden.");
      return (result.data ?? []).map((row) => normalizeWeek(row as Record<string, unknown>));
    },

    async listPublicWeeks(nowIso) {
      const result = await client
        .from("lunch_weeks")
        .select(WEEK_SELECT)
        .eq("status", "published")
        .order("week_start", { ascending: false });
      if (result.error) throw asError(result.error, "Veröffentlichte Mittagstischwochen konnten nicht geladen werden.");

      const now = Date.parse(nowIso);
      return (result.data ?? [])
        .map((row) => normalizeWeek(row as Record<string, unknown>))
        .filter((week) => {
          if (!week.publish_at) return true;
          const publishAt = Date.parse(week.publish_at);
          return Number.isFinite(now) && Number.isFinite(publishAt) && publishAt <= now;
        });
    },

    async getStaffWeek(weekId) {
      return readWeek(client, weekId);
    },

    async createWeek(weekStart) {
      const result = await client.rpc("create_lunch_week", { _week_start: weekStart });
      if (result.error || !result.data) throw asError(result.error, "Mittagstischwoche konnte nicht angelegt werden.");
      return readWeek(client, String(result.data));
    },

    async saveWeek(weekId: string, draft: LunchWeekDraft) {
      const items = draft.items.map((item) => ({
        weekday: item.weekday,
        dish: item.dish,
        description: item.description,
        price: item.price,
        allergens: item.allergens,
        sort: item.sort,
      }));
      const result = await client.rpc("save_lunch_week", {
        _week_id: weekId,
        _note: draft.note,
        _items: items,
      });
      if (result.error) throw asError(result.error, "Mittagstischwoche konnte nicht gespeichert werden.");
      return readWeek(client, weekId);
    },

    async setStatus(weekId: string, status: LunchEditorialStatus) {
      const result = await client
        .from("lunch_weeks")
        .update({ status })
        .eq("id", weekId)
        .select("id")
        .single();
      if (result.error || !result.data) throw asError(result.error, "Status konnte nicht geändert werden.");
      return readWeek(client, weekId);
    },

    async copyToFollowingWeek(sourceWeekId: string) {
      const result = await client.rpc("copy_lunch_week_to_following", {
        _source_week_id: sourceWeekId,
      });
      if (result.error || !result.data) throw asError(result.error, "Mittagstischwoche konnte nicht kopiert werden.");
      return readWeek(client, String(result.data));
    },
  };
}
