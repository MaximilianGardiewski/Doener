import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const contract = JSON.parse(await readFile(new URL("data/mcello/builder-presentation.v1.json", root), "utf8"));
const seed = JSON.parse(await readFile(new URL("data/mcello/menu-seed.provisional.json", root), "utf8"));
const importer = await readFile(new URL("scripts/import-mcello-presentation-builders.mjs", root), "utf8");
const launcher = await readFile(new URL("scripts/demo-mcello.ps1", root), "utf8");

const seedById = new Map(seed.items.map((item) => [item[0], item]));
const groupByName = new Map(contract.donerYufka.groups.map((group) => [group.name, group]));

test("presentation Builder data is explicitly local-only and never a production catalog", () => {
  assert.equal(contract.version, 2);
  assert.equal(contract.status, "presentation-only-local-demo");
  assert.equal(contract.scope, "localhost-disposable-supabase-only");
  assert.match(contract.notes.join("\n"), /presentation assumptions/i);
  assert.match(importer, /supabaseUrl\.protocol, "http:"/);
  assert.match(importer, /127\.0\.0\.1/);
  assert.match(importer, /localhost/);
  assert.match(importer, /::1/);
  assert.match(importer, /Refusing to install Builder presentation fixtures on a non-local/);
});

test("Pizza Mcello presentation recipe is derived only from the provisional menu transcription", () => {
  assert.equal(contract.pizza.productSourceId, "pizza-076");
  const product = seedById.get("pizza-076");
  assert.ok(product, "pizza-076 must remain present in the first-party provisional seed");
  assert.equal(product[2], "Pizza Mcello");
  for (const option of contract.pizza.groups[0].options) {
    assert.match(product[3], new RegExp(option.name, "i"), `${option.name} must be supported by the menu-card transcription`);
    assert.equal(option.priceDeltaCents, 0);
    assert.equal(option.defaultSelected, true);
  }
});

test("Döner/Yufka showcase separates presentation assumptions from confirmed sauces", () => {
  assert.deepEqual(groupByName.get("Basis").options.map((option) => option.name), ["Fleisch", "Falafel"]);
  assert.deepEqual(groupByName.get("Gemüse").options.map((option) => option.name), ["Salat", "Tomate", "Gurke", "Zwiebel"]);
  assert.deepEqual(groupByName.get("Soße").options.map((option) => option.name), ["Curry", "Knoblauch", "Scharf"]);
  assert.match(contract.donerYufka.provenance, /presentation-assumption:user-request:2026-08-18/);
  assert.match(contract.donerYufka.provenance, /sauces-owner-chat-confirmation:2026-08-18/);
  assert.deepEqual(contract.donerYufka.productSourceIds, ["warm-013", "warm-014", "warm-015", "warm-016", "warm-017", "warm-018"]);
  for (const id of contract.donerYufka.productSourceIds) assert.ok(seedById.has(id), `${id} must remain a real provisional menu product`);
});

test("presentation data does not invent prices or pretend selection policy is production truth", () => {
  for (const family of [contract.pizza, contract.donerYufka]) {
    for (const group of family.groups) {
      assert.equal(group.policyStatus, "presentation-interaction-policy");
      for (const option of group.options) assert.equal(option.priceDeltaCents, 0);
    }
  }
  assert.match(importer, /must not invent a surcharge/);
  assert.match(importer, /do not claim production selection rules/);
});

test("one-command presentation launcher installs Builder fixtures before the shop is prepared", () => {
  const fixtureIndex = launcher.indexOf("node scripts/import-mcello-presentation-builders.mjs");
  const prepareIndex = launcher.indexOf("node scripts/prepare-mcello-demo.mjs");
  assert.ok(fixtureIndex >= 0);
  assert.ok(prepareIndex > fixtureIndex);
  assert.match(launcher, /Curry, Knoblauch, Scharf/);
});
