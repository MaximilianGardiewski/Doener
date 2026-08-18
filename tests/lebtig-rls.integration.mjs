import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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
const anon = createClient(url, anonKey, { auth: authOptions });
const createdUsers = [];
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;

function assertNoError(error, context) {
  assert.equal(error, null, `${context}: ${error?.message ?? "unexpected error"}`);
}

function assertDenied(error, context) {
  assert.ok(error, `${context}: operation unexpectedly succeeded`);
}

async function createLocalUser(label) {
  const email = `${label}-${suffix}@example.invalid`;
  const password = `T-${randomBytes(24).toString("base64url")}aA1!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `CI ${label}` },
  });
  assertNoError(created.error, `create ${label} user`);
  assert.ok(created.data.user?.id, `${label} user id missing`);
  const id = created.data.user.id;
  createdUsers.push(id);

  const client = createClient(url, anonKey, { auth: authOptions });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  assertNoError(signedIn.error, `sign in ${label}`);
  return { id, email, client };
}

async function roleRowsFor(userId) {
  const result = await service.from("user_roles").select("role").eq("user_id", userId);
  assertNoError(result.error, "read service roles");
  return result.data ?? [];
}

try {
  // Bootstrap is server-only and initially open.
  const initialBootstrap = await service.rpc("is_bootstrap_open");
  assertNoError(initialBootstrap.error, "service bootstrap status before users");
  assert.equal(initialBootstrap.data, true, "bootstrap should start open");

  const anonymousBootstrap = await anon.rpc("is_bootstrap_open");
  assertDenied(anonymousBootstrap.error, "anon bootstrap RPC");

  const admin = await createLocalUser("admin");
  assert.deepEqual(await roleRowsFor(admin.id), [{ role: "admin" }], "first user must win exactly one admin role");

  const afterAdminBootstrap = await service.rpc("is_bootstrap_open");
  assertNoError(afterAdminBootstrap.error, "service bootstrap status after admin");
  assert.equal(afterAdminBootstrap.data, false, "bootstrap must close after first role");

  const adminBootstrap = await admin.client.rpc("is_bootstrap_open");
  assertDenied(adminBootstrap.error, "authenticated browser bootstrap RPC");

  const moderator = await createLocalUser("moderator");
  const plain = await createLocalUser("plain");
  assert.deepEqual(await roleRowsFor(moderator.id), [], "later users must not receive an automatic moderator role");
  assert.deepEqual(await roleRowsFor(plain.id), [], "later users must remain role-less until explicitly assigned");

  const assignModerator = await service.from("user_roles").insert({ user_id: moderator.id, role: "moderator" });
  assertNoError(assignModerator.error, "assign moderator fixture role");

  // Profile visibility: no-role user sees only self; staff sees all profiles.
  const plainProfiles = await plain.client.from("profiles").select("id");
  assertNoError(plainProfiles.error, "plain profile read");
  assert.deepEqual((plainProfiles.data ?? []).map((row) => row.id), [plain.id]);

  const moderatorProfiles = await moderator.client.from("profiles").select("id");
  assertNoError(moderatorProfiles.error, "moderator profile read");
  assert.equal(moderatorProfiles.data?.length, 3, "moderator should see all local fixture profiles");

  // Fixture content is inserted only at runtime; the migration contains no business data.
  const settingsInsert = await service.from("site_settings").insert({
    key: `ci-${suffix}`,
    value: { fixture: true },
  });
  assertNoError(settingsInsert.error, "insert fixture setting");

  const publicPage = `public-${suffix}`;
  const draftPage = `draft-${suffix}`;
  const pagesInsert = await service.from("pages").insert([
    { slug: publicPage, title: "Public fixture", status: "published" },
    { slug: draftPage, title: "Draft fixture", status: "draft" },
  ]);
  assertNoError(pagesInsert.error, "insert fixture pages");

  const anonPages = await anon.from("pages").select("slug").in("slug", [publicPage, draftPage]);
  assertNoError(anonPages.error, "anon page read");
  assert.deepEqual((anonPages.data ?? []).map((row) => row.slug), [publicPage]);

  const plainPages = await plain.client.from("pages").select("slug").in("slug", [publicPage, draftPage]);
  assertNoError(plainPages.error, "role-less authenticated public page read");
  assert.deepEqual((plainPages.data ?? []).map((row) => row.slug), [publicPage]);

  const moderatorPages = await moderator.client.from("pages").select("slug").in("slug", [publicPage, draftPage]).order("slug");
  assertNoError(moderatorPages.error, "moderator page read");
  assert.deepEqual((moderatorPages.data ?? []).map((row) => row.slug), [draftPage, publicPage].sort());

  const moderatorPageWrite = await moderator.client.from("pages").insert({
    slug: `moderator-blocked-${suffix}`,
    title: "Must not persist",
  });
  assertDenied(moderatorPageWrite.error, "moderator structural page write");

  const adminPageWrite = await admin.client.from("pages").insert({
    slug: `admin-page-${suffix}`,
    title: "Admin fixture",
  });
  assertNoError(adminPageWrite.error, "admin structural page write");

  // UPDATE can be denied by RLS as an empty target set rather than an API error.
  const moderatorSettingsWrite = await moderator.client
    .from("site_settings")
    .update({ value: { fixture: false } })
    .eq("key", `ci-${suffix}`)
    .select("key");
  assertNoError(moderatorSettingsWrite.error, "moderator site settings update request");
  assert.equal(moderatorSettingsWrite.data?.length, 0, "moderator must not update site settings");

  const settingAfterModerator = await service
    .from("site_settings")
    .select("value")
    .eq("key", `ci-${suffix}`)
    .single();
  assertNoError(settingAfterModerator.error, "verify blocked moderator settings update");
  assert.deepEqual(settingAfterModerator.data.value, { fixture: true });

  const adminSettingsWrite = await admin.client
    .from("site_settings")
    .update({ value: { fixture: "admin-updated" } })
    .eq("key", `ci-${suffix}`)
    .select("key");
  assertNoError(adminSettingsWrite.error, "admin site settings write");
  assert.equal(adminSettingsWrite.data?.length, 1, "admin settings update should affect one row");

  // Editorial roots are moderator/admin writable; role-less users are not.
  const plainNewsWrite = await plain.client.from("news").insert({
    slug: `plain-blocked-${suffix}`,
    title: "Must not persist",
  });
  assertDenied(plainNewsWrite.error, "plain editorial write");

  const moderatorNewsWrite = await moderator.client.from("news").insert({
    slug: `moderator-news-${suffix}`,
    title: "Moderator fixture",
    status: "draft",
  });
  assertNoError(moderatorNewsWrite.error, "moderator editorial write");

  const now = Date.now();
  const newsInsert = await service.from("news").insert([
    {
      slug: `visible-${suffix}`,
      title: "Visible fixture",
      status: "published",
      publish_at: new Date(now - 60_000).toISOString(),
      start_at: new Date(now - 60_000).toISOString(),
      end_at: new Date(now + 60_000).toISOString(),
    },
    {
      slug: `future-${suffix}`,
      title: "Future fixture",
      status: "published",
      start_at: new Date(now + 60_000).toISOString(),
    },
    {
      slug: `expired-${suffix}`,
      title: "Expired fixture",
      status: "published",
      end_at: new Date(now - 60_000).toISOString(),
    },
    { slug: `draft-news-${suffix}`, title: "Draft fixture", status: "draft" },
  ]);
  assertNoError(newsInsert.error, "insert news visibility fixtures");

  const anonNews = await anon.from("news").select("slug").like("slug", `%${suffix}`);
  assertNoError(anonNews.error, "anon news read");
  assert.deepEqual((anonNews.data ?? []).map((row) => row.slug), [`visible-${suffix}`]);

  // Child public rows inherit publication from their parent week. Build the
  // published fixture through the same completeness invariant as production.
  const publicLunch = await service.from("lunch_weeks").insert({
    week_start: "2035-01-01",
    week_end: "2035-01-05",
    status: "draft",
  }).select("id").single();
  assertNoError(publicLunch.error, "insert draft public lunch candidate");
  const draftLunch = await service.from("lunch_weeks").insert({
    week_start: "2035-01-08",
    week_end: "2035-01-12",
    status: "draft",
  }).select("id").single();
  assertNoError(draftLunch.error, "insert draft lunch fixture");

  const lunchItemsInsert = await service.from("lunch_items").insert([
    { week_id: publicLunch.data.id, weekday: 1, dish: `public-dish-${suffix}` },
    { week_id: publicLunch.data.id, weekday: 2, dish: "CI public filler 2" },
    { week_id: publicLunch.data.id, weekday: 3, dish: "CI public filler 3" },
    { week_id: publicLunch.data.id, weekday: 4, dish: "CI public filler 4" },
    { week_id: publicLunch.data.id, weekday: 5, dish: "CI public filler 5" },
    { week_id: draftLunch.data.id, weekday: 1, dish: `draft-dish-${suffix}` },
  ]);
  assertNoError(lunchItemsInsert.error, "insert lunch child fixtures");

  const publishLunch = await service
    .from("lunch_weeks")
    .update({ status: "published" })
    .eq("id", publicLunch.data.id)
    .select("id")
    .single();
  assertNoError(publishLunch.error, "publish complete lunch fixture");

  const anonLunchItems = await anon.from("lunch_items").select("dish").like("dish", `%${suffix}`);
  assertNoError(anonLunchItems.error, "anon lunch child read");
  assert.deepEqual((anonLunchItems.data ?? []).map((row) => row.dish), [`public-dish-${suffix}`]);

  const moderatorLunchItems = await moderator.client.from("lunch_items").select("dish").like("dish", `%${suffix}`);
  assertNoError(moderatorLunchItems.error, "moderator lunch child read");
  assert.equal(moderatorLunchItems.data?.length, 2, "staff should see public and draft child rows");

  const publicOffers = await service.from("offer_weeks").insert({
    week_start: "2035-02-01",
    week_end: "2035-02-07",
    status: "published",
  }).select("id").single();
  assertNoError(publicOffers.error, "insert public offer fixture");
  const draftOffers = await service.from("offer_weeks").insert({
    week_start: "2035-02-08",
    week_end: "2035-02-14",
    status: "draft",
  }).select("id").single();
  assertNoError(draftOffers.error, "insert draft offer fixture");
  const offerItemsInsert = await service.from("offer_items").insert([
    { week_id: publicOffers.data.id, product: `public-offer-${suffix}`, price: 1 },
    { week_id: draftOffers.data.id, product: `draft-offer-${suffix}`, price: 1 },
  ]);
  assertNoError(offerItemsInsert.error, "insert offer child fixtures");
  const anonOfferItems = await anon.from("offer_items").select("product").like("product", `%${suffix}`);
  assertNoError(anonOfferItems.error, "anon offer child read");
  assert.deepEqual((anonOfferItems.data ?? []).map((row) => row.product), [`public-offer-${suffix}`]);

  // Party request: anonymous submit, staff operate, moderator cannot delete, admin can.
  const requestEmail = `party-${suffix}@example.invalid`;
  const partyInsert = await anon.from("party_requests").insert({
    first_name: "CI",
    last_name: "Fixture",
    email: requestEmail,
    message: "Local RLS fixture",
  });
  assertNoError(partyInsert.error, "anonymous party request submit");

  const partyLookup = await service.from("party_requests").select("id").eq("email", requestEmail).single();
  assertNoError(partyLookup.error, "service party request lookup");
  const partyId = partyLookup.data.id;

  const moderatorPartyRead = await moderator.client.from("party_requests").select("id").eq("id", partyId);
  assertNoError(moderatorPartyRead.error, "moderator party request read");
  assert.equal(moderatorPartyRead.data?.length, 1);

  const moderatorPartyUpdate = await moderator.client
    .from("party_requests")
    .update({ status: "bearbeitet", internal_note: "CI" })
    .eq("id", partyId);
  assertNoError(moderatorPartyUpdate.error, "moderator party request update");

  const moderatorPartyDelete = await moderator.client.from("party_requests").delete().eq("id", partyId).select("id");
  assertNoError(moderatorPartyDelete.error, "moderator delete is filtered by RLS rather than privileged");
  assert.equal(moderatorPartyDelete.data?.length, 0, "moderator must not delete party requests");

  const adminPartyDelete = await admin.client.from("party_requests").delete().eq("id", partyId).select("id");
  assertNoError(adminPartyDelete.error, "admin party request delete");
  assert.equal(adminPartyDelete.data?.length, 1, "admin should delete the party request");

  // Media metadata and objects remain private/staff-only with DB upload invariants.
  const plainMediaRead = await plain.client.from("media").select("id");
  assertNoError(plainMediaRead.error, "role-less media metadata read request");
  assert.equal(plainMediaRead.data?.length, 0, "role-less user must not see private media metadata");

  const moderatorMedia = await moderator.client.from("media").insert({
    url: `/media/${suffix}`,
    storage_path: `${moderator.id}/${suffix}.png`,
    alt: "CI Testbild",
    created_by: moderator.id,
  }).select("id").single();
  assertNoError(moderatorMedia.error, "moderator media metadata insert");

  const blankAlt = await moderator.client.from("media").insert({
    url: `/media/blank-${suffix}`,
    storage_path: `${moderator.id}/blank-${suffix}.png`,
    alt: "   ",
  });
  assertDenied(blankAlt.error, "blank media alt constraint");

  const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const plainUpload = await plain.client.storage
    .from("media")
    .upload(`${plain.id}/${suffix}.png`, pngHeader, { contentType: "image/png" });
  assertDenied(plainUpload.error, "role-less storage upload");

  const objectPath = `${moderator.id}/${suffix}.png`;
  const moderatorUpload = await moderator.client.storage
    .from("media")
    .upload(objectPath, pngHeader, { contentType: "image/png", upsert: false });
  assertNoError(moderatorUpload.error, "moderator storage upload");

  const anonymousDownload = await anon.storage.from("media").download(objectPath);
  assertDenied(anonymousDownload.error, "anonymous private media download");
  const moderatorDownload = await moderator.client.storage.from("media").download(objectPath);
  assertNoError(moderatorDownload.error, "moderator private media download");

  const cleanupObject = await service.storage.from("media").remove([objectPath]);
  assertNoError(cleanupObject.error, "cleanup local media object");

  // Admin-only role management and DB-level last-admin protection.
  const moderatorRoleWrite = await moderator.client.from("user_roles").insert({
    user_id: plain.id,
    role: "admin",
  });
  assertDenied(moderatorRoleWrite.error, "moderator role assignment");

  const removeLastAdmin = await admin.client
    .from("user_roles")
    .delete()
    .eq("user_id", admin.id)
    .eq("role", "admin");
  assertDenied(removeLastAdmin.error, "remove last admin");
  assert.deepEqual(await roleRowsFor(admin.id), [{ role: "admin" }], "last admin role must remain intact");

  const adminRoleWrite = await admin.client.from("user_roles").insert({
    user_id: plain.id,
    role: "admin",
  });
  assertNoError(adminRoleWrite.error, "admin role assignment");
  assert.deepEqual(await roleRowsFor(plain.id), [{ role: "admin" }]);

  console.log("Lebtig local Supabase RLS matrix passed");
} finally {
  for (const userId of createdUsers.reverse()) {
    await service.auth.admin.deleteUser(userId);
  }
}