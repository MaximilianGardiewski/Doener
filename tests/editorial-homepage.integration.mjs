import assert from "node:assert/strict";

function envValue(name) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

const baseUrl = envValue("SUPABASE_URL")?.replace(/\/$/, "");
const anonKey = envValue("SUPABASE_ANON_KEY");
if (!baseUrl || !anonKey) throw new Error("Local Supabase env is missing");
const locationId = "00000000-0000-4000-8000-000000000001";

async function request(path, { method = "GET", bearer, body } = {}) {
  const headers = { apikey: anonKey, accept: "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { response, data };
}

async function rpc(name, args, bearer) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", bearer, body: args });
}

async function signIn(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(result.response.ok, true, JSON.stringify(result.data));
  return result.data.access_token;
}

function unwrap(data) {
  return Array.isArray(data) ? data[0] : data;
}

const adminToken = await signIn("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const staffToken = await signIn("kds-staff@mcello.local", "LocalOnly-Staff-2026!");
const initial = await rpc("admin_get_content", { _location_id: locationId }, adminToken);
assert.equal(initial.response.ok, true, JSON.stringify(initial.data));
const initialSections = (initial.data.homepageSections || []).map((row) => ({
  sectionKey: row.sectionKey,
  enabled: row.enabled,
  sort: row.sort,
  settings: row.settings || {},
}));
const createdPostIds = [];
const stamp = Date.now();
const now = Date.now();
const past = new Date(now - 60_000).toISOString();
const futureHour = new Date(now + 60 * 60_000).toISOString();
const futureEvent = new Date(now + 3 * 24 * 60 * 60_000).toISOString();

async function savePost(overrides, token = adminToken) {
  return rpc("admin_save_editorial_post", {
    _id: overrides.id || null,
    _location_id: locationId,
    _slug: overrides.slug,
    _kind: overrides.kind || "news",
    _title: overrides.title,
    _teaser: overrides.teaser || "",
    _content: overrides.content || "",
    _status: overrides.status || "draft",
    _pinned: Boolean(overrides.pinned),
    _visible_from: overrides.visibleFrom ?? null,
    _visible_until: overrides.visibleUntil ?? null,
    _event_starts_at: overrides.eventStartsAt ?? null,
    _event_ends_at: overrides.eventEndsAt ?? null,
  }, token);
}

try {
  const staffWrite = await savePost({
    slug: `dev-staff-denied-${stamp}`,
    title: "DEV Staff darf nicht publizieren",
  }, staffToken);
  assert.equal(staffWrite.response.ok, false, "staff must not mutate editorial structure");

  const draft = await savePost({
    slug: `dev-news-${stamp}`,
    title: "DEV CMS News",
    teaser: "temporary integration content",
    status: "draft",
    visibleFrom: past,
    visibleUntil: futureHour,
  });
  assert.equal(draft.response.ok, true, JSON.stringify(draft.data));
  const news = unwrap(draft.data);
  assert.ok(news?.id);
  createdPostIds.push(news.id);

  let publicSnapshot = await rpc("get_public_content", { _location_id: locationId, _at: new Date().toISOString() });
  assert.equal(publicSnapshot.response.ok, true, JSON.stringify(publicSnapshot.data));
  assert.equal(publicSnapshot.data.editorialPosts.some((post) => post.id === news.id), false, "draft must stay private");

  const published = await savePost({
    id: news.id,
    slug: `dev-news-${stamp}`,
    title: "DEV CMS News",
    teaser: "temporary integration content",
    status: "published",
    pinned: true,
    visibleFrom: past,
    visibleUntil: futureHour,
  });
  assert.equal(published.response.ok, true, JSON.stringify(published.data));

  const eventWithoutDate = await savePost({
    slug: `dev-event-invalid-${stamp}`,
    kind: "event",
    title: "DEV Event ohne Datum",
    status: "published",
    visibleFrom: past,
  });
  assert.equal(eventWithoutDate.response.ok, false, "published event must require an occurrence time");

  const eventResult = await savePost({
    slug: `dev-event-${stamp}`,
    kind: "event",
    title: "DEV Future Event",
    teaser: "published now, occurs later",
    status: "published",
    visibleFrom: past,
    visibleUntil: futureHour,
    eventStartsAt: futureEvent,
  });
  assert.equal(eventResult.response.ok, true, JSON.stringify(eventResult.data));
  const event = unwrap(eventResult.data);
  assert.ok(event?.id);
  createdPostIds.push(event.id);

  const futurePublication = await savePost({
    slug: `dev-future-publication-${stamp}`,
    title: "DEV Noch nicht sichtbar",
    status: "published",
    visibleFrom: futureHour,
  });
  assert.equal(futurePublication.response.ok, true, JSON.stringify(futurePublication.data));
  const futurePost = unwrap(futurePublication.data);
  assert.ok(futurePost?.id);
  createdPostIds.push(futurePost.id);

  const homepage = await rpc("admin_replace_homepage_sections", {
    _location_id: locationId,
    _rows: [
      { sectionKey: "news_events", enabled: false, sort: 10, settings: {} },
      { sectionKey: "hero", enabled: true, sort: 20, settings: {} },
      { sectionKey: "contact", enabled: true, sort: 30, settings: {} },
    ],
  }, adminToken);
  assert.equal(homepage.response.ok, true, JSON.stringify(homepage.data));
  assert.equal(homepage.data.rows, 3);

  publicSnapshot = await rpc("get_public_content", { _location_id: locationId, _at: new Date().toISOString() });
  assert.equal(publicSnapshot.response.ok, true, JSON.stringify(publicSnapshot.data));
  assert.equal(publicSnapshot.data.homepageConfigured, true);
  assert.deepEqual(publicSnapshot.data.homepageSections.map((row) => row.sectionKey), ["hero", "contact"]);
  assert.equal(publicSnapshot.data.editorialPosts[0].id, news.id, "pinned visible post should lead the public editorial snapshot");
  assert.equal(publicSnapshot.data.editorialPosts.some((post) => post.id === event.id), true, "future event may be promoted before it occurs");
  assert.equal(
    new Date(publicSnapshot.data.editorialPosts.find((post) => post.id === event.id)?.eventStartsAt).toISOString(),
    new Date(futureEvent).toISOString(),
    "equivalent timestamptz values must compare independently of PostgREST offset formatting",
  );
  assert.equal(publicSnapshot.data.editorialPosts.some((post) => post.id === futurePost.id), false, "future publication window must stay hidden");

  const menuSnapshot = await rpc("get_public_menu", { _location_id: locationId, _at: new Date().toISOString() });
  assert.equal(menuSnapshot.response.ok, true, JSON.stringify(menuSnapshot.data));
  assert.ok(menuSnapshot.data.content, "public menu bootstrap must carry the current editorial/homepage snapshot");
  assert.equal(menuSnapshot.data.content.editorialPosts.some((post) => post.id === news.id), true);

  console.log("Editorial + homepage CMS integration passed:", {
    staffBoundary: "editorial writes denied",
    draftHidden: true,
    publicationWindow: true,
    eventOccurrenceSeparate: true,
    homepageModuleControl: true,
    publicBootstrapContent: true,
  });
} finally {
  for (const id of createdPostIds) {
    await rpc("admin_delete_editorial_post", { _id: id, _location_id: locationId }, adminToken).catch(() => {});
  }
  await rpc("admin_replace_homepage_sections", {
    _location_id: locationId,
    _rows: initialSections,
  }, adminToken).catch(() => {});
}
