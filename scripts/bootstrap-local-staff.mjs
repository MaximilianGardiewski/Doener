import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const envPath = path.resolve(".env.local");
const rawEnv = await readFile(envPath, "utf8");
const env = parseEnv(rawEnv);
const baseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const anonKey = required("SUPABASE_ANON_KEY");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const staffEmail = "dev-kds-staff@mcello.local";
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

const usersResponse = await api("/auth/v1/admin/users?page=1&per_page=100");
const users = Array.isArray(usersResponse) ? usersResponse : (usersResponse.users ?? []);

if (users.length === 0) {
  await api("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email: "dev-bootstrap-admin@mcello.local",
      password: `Local-${randomBytes(18).toString("base64url")}!`,
      email_confirm: true,
    },
  });
}

let staff = users.find((user) => user.email === staffEmail);
if (!staff) {
  staff = await api("/auth/v1/admin/users", {
    method: "POST",
    body: { email: staffEmail, password: staffPassword, email_confirm: true },
  });
} else {
  staff = await api(`/auth/v1/admin/users/${encodeURIComponent(staff.id)}`, {
    method: "PUT",
    body: { password: staffPassword, email_confirm: true },
  });
}

const existingRole = await api(
  `/rest/v1/user_roles?user_id=eq.${encodeURIComponent(staff.id)}&role=eq.staff&select=id`,
);
if (!Array.isArray(existingRole) || existingRole.length === 0) {
  await api("/rest/v1/user_roles", {
    method: "POST",
    body: { user_id: staff.id, role: "staff" },
  });
}

// Prove the generated credentials before persisting them.
const login = await api("/auth/v1/token?grant_type=password", {
  method: "POST",
  apiKey: anonKey,
  bearer: undefined,
  body: { email: staffEmail, password: staffPassword },
});
if (!login?.access_token) throw new Error("Local staff login verification failed");

const nextEnv = upsertEnv(rawEnv, {
  MCELLO_DEV_STAFF_EMAIL: staffEmail,
  MCELLO_DEV_STAFF_PASSWORD: staffPassword,
});
await writeFile(envPath, nextEnv, "utf8");
console.log("Local-only KDS staff account prepared. Credentials are stored only in ignored .env.local.");

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
