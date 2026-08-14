import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function envValue(name) {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

const baseUrl = envValue("SUPABASE_URL")?.replace(/\/$/, "");
const serviceRoleKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
if (!baseUrl || !serviceRoleKey) throw new Error("Local Supabase env is missing");

async function serviceGet(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
    },
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  assert.equal(response.ok, true, raw);
  return data;
}

async function serviceRpc(name, args) {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  assert.equal(response.ok, true, raw);
  return data;
}

const sourcePattern = encodeURIComponent("provisional:user-supplied-menu-card-images*");
const products = await serviceGet(
  `/rest/v1/menu_products?source_note=like.${sourcePattern}&select=id,name,orderable_online,owner_confirmed,source_note&order=sort.asc`,
);
assert.equal(products.length, 97, "all 97 transcribed menu positions must import deterministically");
assert.equal(products.every((product) => product.owner_confirmed === false), true);
assert.equal(products.every((product) => product.source_note.startsWith("provisional:user-supplied-menu-card-images:")), true);

const nonOrderable = products.filter((product) => !product.orderable_online);
assert.equal(nonOrderable.length, 16, "beer/wine seed entries stay disabled for online ordering");
assert.equal(nonOrderable.some((product) => product.name === "Sekt"), true);
assert.equal(products.find((product) => product.name === "Drehspieß im Fladenbrot")?.orderable_online, true);

const appleJuiceId = stableUuid("mcello:product:juices-001");
const appleJuice = await serviceRpc("server_get_checkout_product", {
  _product_id: appleJuiceId,
  _at: new Date().toISOString(),
});
assert.equal(appleJuice.name, "Apfelsaft");
assert.equal(appleJuice.ownerConfirmed, false);
assert.equal(appleJuice.modifierGroups.length, 1);
assert.equal(appleJuice.modifierGroups[0].name, "Größe");
assert.deepEqual(
  appleJuice.modifierGroups[0].options.map((option) => [option.name, option.priceDeltaCents]),
  [["0,3 l", 0], ["0,4 l", 100]],
);

console.log("Provisional Mcello menu import passed:", {
  products: products.length,
  ownerConfirmed: 0,
  onlineDisabled: nonOrderable.length,
  sizeVariantExample: appleJuice.name,
});

function stableUuid(input) {
  const bytes = createHash("sha256").update(input).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
