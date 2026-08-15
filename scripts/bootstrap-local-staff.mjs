import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const envPath = path.resolve(".env.local");
const rawEnv = await readFile(envPath, "utf8");
const env = parseEnv(rawEnv);
const baseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");

const adminEmail = "dev-bootstrap-admin@mcello.local";
const staffEmail = "dev-kds-staff@mcello.local";
const adminPassword = `Local-${randomBytes(18).toString("base64url")}!`;
const staffPassword = `Local-${randomBytes(18).toString("base64url")}!`;

async function api(pathname, { method = "GET", body, apiKey = serviceRoleKey, bearer = serviceRoleKey } = {}) {
  const headers = { apikey: apiKey, accept: "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`${method} ${pathname} failed (${response.status}): ${JSON.stringify(data)}`);
  return data;
}

async function ensureUser(users, email, password) {
  let user = users.find((candidate) => candidate.email === email);
  if (!user) {
    user = await api("/auth/v1/admin/users", {
      method: "POST",
      body: { email, password, email_confirm: true },
    });
  } else {
    user = await api(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PUT",
      body: { password, email_confirm: true },
    });
  }
  return user;
}

async function ensureRole(userId, role) {
  const existing = await api(
    `/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&role=eq.${encodeURIComponent(role)}&select=id`,
  );
  if (!Array.isArray(existing) || existing.length === 0) {
    await api("/rest/v1/user_roles", {
      method: "POST",
      body: { user_id: userId, role },
    });
  }
}

async function verifyPasswordLogin(email, password) {
  const login = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    apiKey: anonKey,
    bearer: null,
    body: { email, password },
  });
  if (!login?.access_token) throw new Error(`Local login verification failed for ${email}`);
}

async function ensurePrivateMediaBucket() {
  const bucketId = "mcello-media";
  const createBucket = () => api("/storage/v1/bucket", {
    method: "POST",
    body: {
      id: bucketId,
      name: bucketId,
      public: false,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    },
  });
  const response = await fetch(`${baseUrl}/storage/v1/bucket/${bucketId}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let error = null;
    try { error = JSON.parse(body); } catch { /* retain raw body below */ }
    if (response.status === 404 || error?.statusCode === "404" || error?.code === "NoSuchBucket") {
      await createBucket();
      return;
    }
    throw new Error(`GET /storage/v1/bucket/${bucketId} failed (${response.status}): ${body}`);
  }

  await api(`/storage/v1/bucket/${bucketId}`, {
    method: "PUT",
    body: {
      public: false,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    },
  });
}

const usersResponse = await api("/auth/v1/admin/users?page=1&per_page=100");
const users = Array.isArray(usersResponse) ? usersResponse : (usersResponse.users ?? []);

await ensurePrivateMediaBucket();

// Development-only identities. Passwords are regenerated and persisted only in
// ignored .env.local; no fixed credentials or production accounts enter Git.
const admin = await ensureUser(users, adminEmail, adminPassword);
await ensureRole(admin.id, "admin");

const staff = await ensureUser(users, staffEmail, staffPassword);
await ensureRole(staff.id, "staff");

await verifyPasswordLogin(adminEmail, adminPassword);
await verifyPasswordLogin(staffEmail, staffPassword);

const nextEnv = upsertEnv(rawEnv, {
  MCELLO_DEV_ADMIN_EMAIL: adminEmail,
  MCELLO_DEV_ADMIN_PASSWORD: adminPassword,
  MCELLO_DEV_STAFF_EMAIL: staffEmail,
  MCELLO_DEV_STAFF_PASSWORD: staffPassword,
});
await writeFile(envPath, nextEnv, "utf8");
console.log("Local-only Mcello admin, KDS staff and private media bucket prepared. Credentials exist only in ignored .env.local.");

function parseEnv(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function required(name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is missing from .env.local`);
  return value;
}

function upsertEnv(raw, values) {
  const keys = new Set(Object.keys(values));
  const kept = raw.split(/\r?\n/).filter((line) => {
    const key = line.split("=", 1)[0]?.trim();
    return !keys.has(key);
  });
  while (kept.length && kept.at(-1) === "") kept.pop();
  for (const [key, value] of Object.entries(values)) kept.push(`${key}=${JSON.stringify(value)}`);
  return `${kept.join("\n")}\n`;
}
