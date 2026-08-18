import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rawEnv = await readFile(new URL("../.env.local", import.meta.url), "utf8");
const env = parseEnv(rawEnv);
const supabaseUrl = new URL(required("SUPABASE_URL"));
const anonKey = required("SUPABASE_ANON_KEY");
const adminEmail = required("MCELLO_DEV_ADMIN_EMAIL");
const adminPassword = required("MCELLO_DEV_ADMIN_PASSWORD");
const locationId = required("MCELLO_LOCATION_ID");

assert.equal(supabaseUrl.protocol, "http:", "Presentation preparation is restricted to local HTTP Supabase only");
assert.equal(
  new Set(["127.0.0.1", "localhost", "::1"]).has(supabaseUrl.hostname),
  true,
  `Refusing to prepare a non-local Mcello instance: ${supabaseUrl.origin}`,
);

const loginResponse = await fetch(new URL("/auth/v1/token?grant_type=password", supabaseUrl), {
  method: "POST",
  headers: {
    apikey: anonKey,
    "content-type": "application/json",
    accept: "application/json",
  },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
const login = await loginResponse.json().catch(() => ({}));
assert.equal(loginResponse.ok, true, `Local demo admin login failed: ${JSON.stringify(login)}`);
assert.ok(login.access_token, "Local demo admin login did not return an access token");

const overrideResponse = await fetch(new URL("/rest/v1/rpc/admin_set_shop_override", supabaseUrl), {
  method: "POST",
  headers: {
    apikey: anonKey,
    authorization: `Bearer ${login.access_token}`,
    "content-type": "application/json",
    accept: "application/json",
  },
  body: JSON.stringify({
    _location_id: locationId,
    _override: "force_open",
    _operator_message: "Lokaler Präsentationsmodus",
  }),
});
const overrideBody = await overrideResponse.text();
assert.equal(overrideResponse.ok, true, `Local demo force-open failed: ${overrideBody}`);

console.log("Local Mcello presentation state prepared: shop force-opened for this disposable local stack.");

function parseEnv(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function required(name) {
  const value = env[name];
  if (!value) throw new Error(`${name} is missing from .env.local`);
  return value;
}
