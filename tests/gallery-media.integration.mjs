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
const bucketId = "mcello-media";
const stamp = Date.now();

async function request(path, { method = "GET", bearer, body, contentType } = {}) {
  const headers = { apikey: anonKey, accept: "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (body !== undefined && !contentType) headers["content-type"] = "application/json";
  if (contentType) headers["content-type"] = contentType;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : (contentType ? body : JSON.stringify(body)),
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

function objectPath(path, authenticated = false) {
  const encoded = [bucketId, ...path.split("/")].map(encodeURIComponent).join("/");
  return `/storage/v1/object${authenticated ? "/authenticated" : ""}/${encoded}`;
}

const adminToken = await signIn("bootstrap-admin@mcello.local", "LocalOnly-Admin-2026!");
const staffToken = await signIn("kds-staff@mcello.local", "LocalOnly-Staff-2026!");
const draftPath = `${locationId}/gallery/00000000-0000-4000-8000-${String(stamp).slice(-12).padStart(12, "0")}.png`;
const bytes = Buffer.from("89504e470d0a1a0a", "hex");
let galleryId = null;

try {
  const staffUpload = await request(objectPath(`${locationId}/gallery/10000000-0000-4000-8000-${String(stamp).slice(-12).padStart(12, "0")}.png`), {
    method: "POST",
    bearer: staffToken,
    body: bytes,
    contentType: "image/png",
  });
  assert.equal(staffUpload.response.ok, false, "staff must not upload gallery media");

  const upload = await request(objectPath(draftPath), {
    method: "POST",
    bearer: adminToken,
    body: bytes,
    contentType: "image/png",
  });
  assert.equal(upload.response.ok, true, JSON.stringify(upload.data));

  const invalidPublish = await rpc("admin_register_gallery_upload", {
    _location_id: locationId,
    _bucket_id: bucketId,
    _object_path: draftPath,
    _original_filename: "integration.png",
    _mime_type: "image/png",
    _byte_size: bytes.length,
    _width: 1,
    _height: 1,
    _alt_text: "",
    _source_kind: "owner_upload",
    _rights_confirmed: false,
    _category: "food",
    _title: "",
    _caption: "",
    _status: "published",
    _featured: true,
    _sort: 10,
    _visible_from: null,
    _visible_until: null,
  }, adminToken);
  assert.equal(invalidPublish.response.ok, false, "unconfirmed media must not publish");

  const registered = await rpc("admin_register_gallery_upload", {
    _location_id: locationId,
    _bucket_id: bucketId,
    _object_path: draftPath,
    _original_filename: "integration.png",
    _mime_type: "image/png",
    _byte_size: bytes.length,
    _width: 1,
    _height: 1,
    _alt_text: "Temporäres Integrationsbild",
    _source_kind: "owner_upload",
    _rights_confirmed: true,
    _category: "food",
    _title: "DEV Galerie",
    _caption: "Temporärer Testeintrag",
    _status: "published",
    _featured: true,
    _sort: 10,
    _visible_from: null,
    _visible_until: null,
  }, adminToken);
  assert.equal(registered.response.ok, true, JSON.stringify(registered.data));
  galleryId = registered.data.id;

  const publicContent = await rpc("get_public_content", { _location_id: locationId, _at: new Date().toISOString() });
  assert.equal(publicContent.response.ok, true, JSON.stringify(publicContent.data));
  assert.equal(publicContent.data.galleryItems.some((item) => item.id === galleryId), true);

  const anonPrivateDownload = await request(objectPath(draftPath, true));
  assert.equal(anonPrivateDownload.response.ok, false, "private object must not be directly anonymous");

  const staffDelete = await rpc("admin_delete_gallery_item", { _id: galleryId, _location_id: locationId }, staffToken);
  assert.equal(staffDelete.response.ok, false, "staff must not delete gallery records");

  console.log("Gallery media integration passed:", {
    adminStorageRls: true,
    staffDenied: true,
    rightsGate: true,
    publicSnapshot: true,
    privateDownload: true,
  });
} finally {
  if (galleryId) {
    await rpc("admin_delete_gallery_item", { _id: galleryId, _location_id: locationId }, adminToken).catch(() => {});
  }
  await request(objectPath(draftPath), { method: "DELETE", bearer: adminToken }).catch(() => {});
}
