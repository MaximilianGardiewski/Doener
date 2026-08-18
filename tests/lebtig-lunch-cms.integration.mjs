import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  followingWeekStartIso,
  nextMondayIso,
  validateLunchWeekForPublication,
} from "../apps/lebtig/src/cms/lunch.ts";
import { createSupabaseLunchCmsPort } from "../apps/lebtig/src/cms/supabase-lunch.ts";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(url, "SUPABASE_URL is required");
assert.ok(anonKey, "SUPABASE_ANON_KEY is required");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

const service = createClient(url, serviceRoleKey, { auth: authOptions });
const anonymous = createClient(url, anonKey, { auth: authOptions });
const publicLunch = createSupabaseLunchCmsPort(anonymous);
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
let userId = null;

function assertNoError(error, context) {
  assert.equal(error, null, `${context}: ${error?.message ?? "unexpected error"}`);
}

function fixtureDraft(prefix) {
  return {
    note: `CI Hinweis ${prefix}`,
    items: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      dish: `CI Gericht ${prefix}-${weekday}`,
      description: `CI Beschreibung ${weekday}`,
      price: 8 + weekday / 10,
      allergens: weekday === 2 ? "CI-A" : null,
      sort: weekday,
    })),
  };
}

try {
  const bootstrap = await service.rpc("is_bootstrap_open");
  assertNoError(bootstrap.error, "read bootstrap before lunch CMS integration");
  assert.equal(bootstrap.data, true, "fresh local database should have open bootstrap");

  const email = `lunch-admin-${suffix}@example.invalid`;
  const password = `T-${randomBytes(24).toString("base64url")}aA1!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "CI Lunch Admin" },
  });
  assertNoError(created.error, "create local lunch admin");
  assert.ok(created.data.user?.id, "local lunch admin id missing");
  userId = created.data.user.id;

  const admin = createClient(url, anonKey, { auth: authOptions });
  const signedIn = await admin.auth.signInWithPassword({ email, password });
  assertNoError(signedIn.error, "sign in local lunch admin");
  const adminLunch = createSupabaseLunchCmsPort(admin);

  const roles = await service.from("user_roles").select("role").eq("user_id", userId);
  assertNoError(roles.error, "read local lunch admin role");
  assert.deepEqual(roles.data, [{ role: "admin" }], "first local lunch account must be admin");

  const weekStart = nextMondayIso(new Date().toISOString());
  const createdWeek = await adminLunch.createWeek(weekStart);
  assert.equal(createdWeek.week_start, weekStart);
  assert.equal(createdWeek.status, "draft");
  assert.equal(createdWeek.publish_at, null);
  assert.equal(createdWeek.lunch_items?.length, 5, "create RPC must materialize Monday-Friday");
  assert.deepEqual(
    (createdWeek.lunch_items ?? []).map((item) => item.weekday),
    [1, 2, 3, 4, 5],
  );
  assert.ok((createdWeek.lunch_items ?? []).every((item) => item.dish === ""));

  const publicBeforeSave = await publicLunch.listPublicWeeks(new Date().toISOString());
  assert.equal(publicBeforeSave.some((week) => week.id === createdWeek.id), false, "draft week must not be public");

  await assert.rejects(
    () => adminLunch.setStatus(createdWeek.id, "published"),
    /Montag bis Freitag|Gericht|veröffentlich/i,
    "database publication guard must reject the blank initial week",
  );

  const draft = fixtureDraft(suffix);
  const saved = await adminLunch.saveWeek(createdWeek.id, draft);
  assert.equal(saved.status, "draft");
  assert.equal(saved.note, draft.note);
  assert.deepEqual(validateLunchWeekForPublication(saved), [], "saved fixture should be publishable in domain logic");
  assert.deepEqual(
    (saved.lunch_items ?? []).map((item) => item.dish),
    draft.items.map((item) => item.dish),
    "staff preview read must return exactly the saved draft data",
  );

  const publicDraft = await publicLunch.listPublicWeeks(new Date().toISOString());
  assert.equal(publicDraft.some((week) => week.id === saved.id), false, "saved draft must remain invisible anonymously");

  const published = await adminLunch.setStatus(saved.id, "published");
  assert.equal(published.status, "published");
  assert.ok(published.publish_at, "database trigger must stamp publish_at");

  const publicAfterPublish = await publicLunch.listPublicWeeks(new Date(Date.now() + 5_000).toISOString());
  const publicWeek = publicAfterPublish.find((week) => week.id === published.id);
  assert.ok(publicWeek, "same persisted week must become anonymously readable after publish");
  assert.equal(publicWeek.note, draft.note);
  assert.deepEqual(
    (publicWeek.lunch_items ?? []).map((item) => item.dish),
    draft.items.map((item) => item.dish),
  );

  const copied = await adminLunch.copyToFollowingWeek(published.id);
  assert.equal(copied.week_start, followingWeekStartIso(published.week_start));
  assert.equal(copied.status, "draft", "copied week must always start as draft");
  assert.equal(copied.publish_at, null, "copy must never inherit publication timestamp");
  assert.deepEqual(
    (copied.lunch_items ?? []).map((item) => item.dish),
    draft.items.map((item) => item.dish),
    "copy must preserve editorial content while resetting publication state",
  );

  const publicAfterCopy = await publicLunch.listPublicWeeks(new Date(Date.now() + 5_000).toISOString());
  assert.equal(publicAfterCopy.some((week) => week.id === copied.id), false, "copied draft must not leak publicly");
  assert.equal(publicAfterCopy.some((week) => week.id === published.id), true, "source remains public until archived");

  const archived = await adminLunch.setStatus(published.id, "archived");
  assert.equal(archived.status, "archived");

  const publicAfterArchive = await publicLunch.listPublicWeeks(new Date(Date.now() + 5_000).toISOString());
  assert.equal(publicAfterArchive.some((week) => week.id === published.id), false, "archived week must leave public output");
  assert.equal(publicAfterArchive.some((week) => week.id === copied.id), false, "draft copy must remain private");

  const staffWeeks = await adminLunch.listStaffWeeks();
  assert.equal(staffWeeks.some((week) => week.id === archived.id && week.status === "archived"), true);
  assert.equal(staffWeeks.some((week) => week.id === copied.id && week.status === "draft"), true);

  console.log("Lebtig lunch CMS persistence lifecycle passed");
} finally {
  if (userId) await service.auth.admin.deleteUser(userId);
}
