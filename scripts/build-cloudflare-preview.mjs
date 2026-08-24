import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

await import("./build-preview.mjs");

const root = path.resolve(".");
const dist = path.join(root, "dist");
const seed = JSON.parse(await readFile(path.join(root, "apps", "mcello", "public", "menu-seed.provisional.json"), "utf8"));
const presentation = JSON.parse(await readFile(path.join(root, "data", "mcello", "builder-presentation.v1.json"), "utf8"));

assert.equal(presentation.status, "presentation-only-local-demo");
assert.equal(presentation.scope, "localhost-disposable-supabase-only");

const fixtureBySourceId = new Map();
registerFixture(presentation.pizza, "pizza");
registerFixture(presentation.donerYufka, "doner-yufka");

const categories = seed.categories.map(([slug, name, sort]) => ({ id: slug, slug, name, sort, products: [] }));
const categoryById = new Map(categories.map((category) => [category.id, category]));

for (const [id, categoryId, name, description, basePriceCents, variants, orderableOnline] of seed.items) {
  const category = categoryById.get(categoryId);
  assert.ok(category, `Unknown category ${categoryId} for ${id}`);
  const modifierGroups = [];

  if (Array.isArray(variants) && variants.length) {
    modifierGroups.push({
      id: `preview-size-${id}`,
      name: "Größe",
      minSelections: 1,
      maxSelections: 1,
      options: variants.map(([label, priceCents], index) => ({
        id: `preview-size-${id}-${index}`,
        name: label,
        priceDeltaCents: Number(priceCents) - Number(basePriceCents),
        defaultSelected: index === 0,
        soldOut: false,
      })),
    });
  }

  const presentationGroups = fixtureBySourceId.get(id);
  if (presentationGroups) modifierGroups.push(...presentationGroups);

  category.products.push({
    id,
    name,
    description,
    basePriceCents,
    orderableOnline: Boolean(orderableOnline),
    availableNow: Boolean(orderableOnline),
    soldOut: false,
    ownerConfirmed: false,
    modifierGroups,
  });
}

const previewMenu = {
  locationId: "cloudflare-preview-read-only",
  categories,
  productCrossSells: [],
  crossSellRules: [],
  builderPresentation: {
    version: presentation.version,
    productForms: { ...presentation.donerYufka.productForms },
  },
  previewOnly: true,
  provenance: "generated from provisional menu seed + presentation-only builder fixture; never production catalog truth",
};

await mkdir(path.join(dist, "preview"), { recursive: true });
await writeFile(path.join(dist, "preview", "menu.json"), `${JSON.stringify(previewMenu)}\n`, "utf8");
await writeFile(path.join(dist, "_redirects"), "/api/menu /preview/menu.json 200\n", "utf8");
await writeFile(path.join(dist, "_headers"), [
  "/*",
  "  X-Robots-Tag: noindex, nofollow, noarchive",
  "  Cache-Control: no-store",
  "  Referrer-Policy: no-referrer",
  "",
].join("\n"), "utf8");

await patchCloudflareOrigin(path.join(dist, "configurator-preview.js"), "configurator");
await patchCloudflareOrigin(path.join(dist, "presentation-mode.js"), "presentation");

console.log("Mcello Cloudflare preview build prepared: static builder fixtures, noindex/no-store, Pages-only presentation origin.");

function registerFixture(family, familyKey) {
  const sourceIds = family.productSourceIds || [family.productSourceId];
  const groups = family.groups.map((group) => {
    assert.equal(group.policyStatus, "presentation-interaction-policy");
    return {
      id: `preview-${familyKey}-${group.key}`,
      name: group.name,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      options: group.options.map((option) => {
        assert.equal(option.priceDeltaCents, 0, `${familyKey}/${group.key}/${option.key} must stay zero-price in preview fixture`);
        return {
          id: `preview-${familyKey}-${group.key}-${option.key}`,
          name: option.name,
          priceDeltaCents: 0,
          defaultSelected: Boolean(option.defaultSelected),
          soldOut: false,
        };
      }),
    };
  });
  for (const sourceId of sourceIds) fixtureBySourceId.set(sourceId, groups);
}

async function patchCloudflareOrigin(file, kind) {
  let source = await readFile(file, "utf8");
  const helper = `\nfunction isCloudflarePreviewHost(hostname) {\n  return hostname === "mcello-preview-mirror.pages.dev" || hostname.endsWith(".mcello-preview-mirror.pages.dev");\n}\n`;

  if (!source.includes("function isCloudflarePreviewHost(")) {
    const anchor = "function isPrivateSslipHost(hostname)";
    const index = source.indexOf(anchor);
    assert.ok(index >= 0, `${kind}: private-host helper anchor missing`);
    source = `${source.slice(0, index)}${helper}${source.slice(index)}`;
  }

  if (kind === "configurator") {
    const before = '  return protocol === "http:" && (loopbackHosts.has(hostname) || isPrivateIpv4(hostname) || isPrivateSslipHost(hostname));';
    const after = '  return (protocol === "http:" && (loopbackHosts.has(hostname) || isPrivateIpv4(hostname) || isPrivateSslipHost(hostname)))\n    || (protocol === "https:" && isCloudflarePreviewHost(hostname));';
    assert.ok(source.includes(before), "configurator: expected local-only origin guard missing");
    source = source.replace(before, after);
  } else {
    const before = /  return window\.location\.protocol === "http:"\r?\n    && \(loopbackHosts\.has\(hostname\) \|\| isPrivateIpv4\(hostname\) \|\| isPrivateSslipHost\(hostname\)\);/;
    const after = '  return (window.location.protocol === "http:"\n    && (loopbackHosts.has(hostname) || isPrivateIpv4(hostname) || isPrivateSslipHost(hostname)))\n    || (window.location.protocol === "https:" && isCloudflarePreviewHost(hostname));';
    assert.ok(before.test(source), "presentation: expected local-only origin guard missing");
    source = source.replace(before, after);
  }

  await writeFile(file, source, "utf8");
}
