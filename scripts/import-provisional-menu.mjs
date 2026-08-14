import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const LOCATION_ID = "00000000-0000-4000-8000-000000000001";
const SOURCE_NOTE_PREFIX = "provisional:user-supplied-menu-card-images";

const fileEnv = await readOptionalEnv(path.resolve(".env.local"));
const env = { ...fileEnv, ...process.env };
const baseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const seed = JSON.parse(await readFile(path.resolve("data/mcello/menu-seed.provisional.json"), "utf8"));

if (seed.status !== "provisional-owner-confirmation-required") {
  throw new Error(`Refusing unexpected menu seed status: ${seed.status}`);
}
if (!Array.isArray(seed.categories) || !Array.isArray(seed.items)) {
  throw new Error("Invalid provisional menu seed structure");
}

const categories = seed.categories.map(([slug, name, sort]) => ({
  id: stableUuid(`mcello:category:${slug}`),
  location_id: LOCATION_ID,
  slug,
  name,
  description: null,
  sort,
  status: "published",
  visible: true,
}));
await upsert("menu_categories", categories, "id");

const categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));
const products = [];
const groups = [];
const options = [];
const links = [];

seed.items.forEach((entry, index) => {
  const [sourceId, categorySlug, name, description, basePriceCents, variants, orderableOnline] = entry;
  const categoryId = categoryIdBySlug.get(categorySlug);
  if (!categoryId) throw new Error(`Unknown category ${categorySlug} for ${sourceId}`);
  if (!Number.isInteger(basePriceCents) || basePriceCents < 0) throw new Error(`Invalid price for ${sourceId}`);

  const productId = stableUuid(`mcello:product:${sourceId}`);
  products.push({
    id: productId,
    location_id: LOCATION_ID,
    category_id: categoryId,
    slug: `${slugify(name)}-${sourceId.split("-").at(-1)}`,
    name,
    description,
    base_price_cents: basePriceCents,
    status: "published",
    bestseller: false,
    orderable_online: Boolean(orderableOnline),
    dietary_tags: [],
    effort_weight: null,
    owner_confirmed: false,
    source_note: `${SOURCE_NOTE_PREFIX}:${sourceId}`,
    sort: index + 1,
  });

  if (Array.isArray(variants) && variants.length > 0) {
    const groupId = stableUuid(`mcello:variant-group:${sourceId}`);
    groups.push({
      id: groupId,
      location_id: LOCATION_ID,
      name: "Größe",
      min_selections: 1,
      max_selections: 1,
      sort: 10,
    });
    links.push({ product_id: productId, group_id: groupId, sort: 10 });

    variants.forEach(([label, priceCents], variantIndex) => {
      if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error(`Invalid variant price for ${sourceId}: ${label}`);
      options.push({
        id: stableUuid(`mcello:variant-option:${sourceId}:${label}`),
        group_id: groupId,
        name: label,
        price_delta_cents: priceCents - basePriceCents,
        default_selected: variantIndex === 0,
        active: true,
        sort: variantIndex + 1,
      });
    });
  }
});

await upsert("menu_products", products, "id");
if (groups.length) await upsert("modifier_groups", groups, "id");
if (options.length) await upsert("modifier_options", options, "id");
if (links.length) await upsert("product_modifier_groups", links, "product_id,group_id");

console.log(`Imported provisional Mcello menu: ${categories.length} categories, ${products.length} products, ${groups.length} size groups, ${options.length} size options.`);
console.log("All imported products remain owner_confirmed=false. This import is for development/preview only.");

async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  for (let start = 0; start < rows.length; start += 50) {
    const batch = rows.slice(start, start + 50);
    const response = await fetch(`${baseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Import ${table} failed (${response.status}): ${text}`);
    }
  }
}

function stableUuid(input) {
  const bytes = createHash("sha256").update(input).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "produkt";
}

async function readOptionalEnv(file) {
  try {
    return parseEnv(await readFile(file, "utf8"));
  } catch {
    return {};
  }
}

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
  const raw = env[name];
  if (!raw) throw new Error(`${name} is missing from environment/.env.local`);
  const value = String(raw).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}
