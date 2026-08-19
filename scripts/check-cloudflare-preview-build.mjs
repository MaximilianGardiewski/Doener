import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const dist = path.resolve("dist");
const menu = JSON.parse(await readFile(path.join(dist, "preview", "menu.json"), "utf8"));
const redirects = await readFile(path.join(dist, "_redirects"), "utf8");
const headers = await readFile(path.join(dist, "_headers"), "utf8");
const configurator = await readFile(path.join(dist, "configurator-preview.js"), "utf8");
const presentation = await readFile(path.join(dist, "presentation-mode.js"), "utf8");

assert.equal(menu.previewOnly, true);
assert.equal(menu.locationId, "cloudflare-preview-read-only");
assert.match(menu.provenance, /never production catalog truth/i);
assert.match(redirects, /^\/api\/menu \/preview\/menu\.json 200/m);
assert.doesNotMatch(redirects, /api\/health|api\/checkout|api\/dev\/otp/i, "Cloudflare mirror must not fake backend/checkout endpoints");
assert.match(headers, /X-Robots-Tag: noindex, nofollow, noarchive/);
assert.match(headers, /Cache-Control: no-store/);
assert.match(configurator, /mcello-preview-mirror\.pages\.dev/);
assert.match(presentation, /mcello-preview-mirror\.pages\.dev/);

const products = menu.categories.flatMap((category) => category.products || []);
for (const id of ["warm-013", "warm-014", "warm-015", "warm-016", "warm-017", "warm-018", "pizza-076"]) {
  const product = products.find((candidate) => candidate.id === id);
  assert.ok(product, `Cloudflare preview product missing: ${id}`);
  assert.ok(product.modifierGroups.length > 0, `Cloudflare preview builder fixture missing: ${id}`);
  for (const group of product.modifierGroups) {
    for (const option of group.options || []) {
      if (group.id.startsWith("preview-doner-yufka-") || group.id.startsWith("preview-pizza-")) {
        assert.equal(option.priceDeltaCents, 0, `Presentation-only option may not invent a surcharge: ${id}/${group.name}/${option.name}`);
      }
    }
  }
}

const doner = products.find((product) => product.id === "warm-013");
assert.deepEqual(doner.modifierGroups.map((group) => group.name), ["Basis", "Gemüse", "Soße"]);
const pizza = products.find((product) => product.id === "pizza-076");
assert.deepEqual(pizza.modifierGroups.map((group) => group.name), ["Belag"]);

console.log("Mcello Cloudflare preview build guard passed: remote builder fixtures are static/read-only and preview-only.");
