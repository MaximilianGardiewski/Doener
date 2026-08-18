import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_MCELLO_LOCATION_ID = "00000000-0000-4000-8000-000000000001";
const fileEnv = await readOptionalEnv(path.resolve(".env.local"));
const env = { ...fileEnv, ...process.env };
const supabaseUrl = new URL(required("SUPABASE_URL"));
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const locationId = String(env.MCELLO_LOCATION_ID || DEFAULT_MCELLO_LOCATION_ID).trim();
const namespace = String(env.MCELLO_MENU_SEED_NAMESPACE || (locationId === DEFAULT_MCELLO_LOCATION_ID ? "mcello" : `mcello:${locationId}`)).trim();
const contract = JSON.parse(await readFile(path.resolve("data/mcello/builder-presentation.v1.json"), "utf8"));

assert.equal(contract.status, "presentation-only-local-demo", "Unexpected Builder presentation contract status");
assert.equal(contract.scope, "localhost-disposable-supabase-only", "Unexpected Builder presentation contract scope");
assert.equal(supabaseUrl.protocol, "http:", "Builder presentation fixtures are restricted to local HTTP Supabase only");
assert.equal(
  new Set(["127.0.0.1", "localhost", "::1"]).has(supabaseUrl.hostname),
  true,
  `Refusing to install Builder presentation fixtures on a non-local Mcello instance: ${supabaseUrl.origin}`,
);
assert.match(locationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "MCELLO_LOCATION_ID must be a UUID");
assert.ok(namespace, "MCELLO_MENU_SEED_NAMESPACE must not be empty");

const groups = [];
const options = [];
const links = [];

installProductFamily(contract.pizza, "pizza");
installProductFamily(contract.donerYufka, "doner-yufka");

await upsert("modifier_groups", groups, "id");
await upsert("modifier_options", options, "id");
await upsert("product_modifier_groups", links, "product_id,group_id");

console.log(`Installed local presentation Builder fixtures: ${groups.length} groups, ${options.length} options, ${links.length} product links.`);
console.log("Presentation fixtures are localhost-only and do not claim production selection rules or price surcharges.");

function installProductFamily(family, familyKey) {
  const sourceIds = family.productSourceIds || [family.productSourceId];
  assert.ok(Array.isArray(sourceIds) && sourceIds.length > 0, `${familyKey} needs at least one source product`);
  assert.ok(Array.isArray(family.groups) && family.groups.length > 0, `${familyKey} needs presentation groups`);

  for (const group of family.groups) {
    assert.equal(group.policyStatus, "presentation-interaction-policy", `${familyKey}/${group.key} must remain presentation-only`);
    assert.ok(Number.isInteger(group.minSelections) && group.minSelections >= 0, `${familyKey}/${group.key} minSelections invalid`);
    assert.ok(Number.isInteger(group.maxSelections) && group.maxSelections >= group.minSelections, `${familyKey}/${group.key} maxSelections invalid`);
    assert.ok(Array.isArray(group.options) && group.options.length >= group.maxSelections, `${familyKey}/${group.key} has too few options for maxSelections`);

    const groupId = stableUuid(`${namespace}:presentation-builder:${familyKey}:group:${group.key}`);
    groups.push({
      id: groupId,
      location_id: locationId,
      name: group.name,
      min_selections: group.minSelections,
      max_selections: group.maxSelections,
      sort: group.sort,
    });

    for (const option of group.options) {
      assert.equal(option.priceDeltaCents, 0, `${familyKey}/${group.key}/${option.key} must not invent a surcharge`);
      options.push({
        id: stableUuid(`${namespace}:presentation-builder:${familyKey}:option:${group.key}:${option.key}`),
        group_id: groupId,
        name: option.name,
        price_delta_cents: 0,
        default_selected: Boolean(option.defaultSelected),
        active: true,
        sort: option.sort,
      });
    }

    for (const sourceId of sourceIds) {
      links.push({
        product_id: stableUuid(`${namespace}:product:${sourceId}`),
        group_id: groupId,
        sort: group.sort,
      });
    }
  }
}

async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  const response = await fetch(new URL(`/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, supabaseUrl), {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`Presentation import ${table} failed (${response.status}): ${await response.text()}`);
}

function stableUuid(input) {
  const bytes = createHash("sha256").update(input).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readOptionalEnv(file) {
  try {
    return parseEnv(await readFile(file, "utf8"));
  } catch {
    return {};
  }
}

function parseEnv(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

function required(name) {
  const raw = env[name];
  if (!raw) throw new Error(`${name} is missing from environment/.env.local`);
  return String(raw).trim().replace(/^(['"])(.*)\1$/, "$2");
}
