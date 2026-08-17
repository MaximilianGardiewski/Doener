import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateConfiguredPriceCents,
  validateConfiguration,
  type MenuProduct,
} from "../src/model.ts";

const product: MenuProduct = {
  id: "doner",
  categoryId: "warm",
  name: "Drehspieß im Fladenbrot",
  basePriceCents: 850,
  modifierGroups: [
    {
      id: "sauce",
      name: "Sauce",
      minSelections: 1,
      maxSelections: 1,
      options: [
        { id: "garlic", name: "Knoblauch", priceDeltaCents: 0 },
        { id: "hot", name: "Scharf", priceDeltaCents: 0, soldOut: true },
      ],
    },
    {
      id: "extras",
      name: "Extras",
      minSelections: 0,
      maxSelections: 3,
      options: [
        { id: "cheese", name: "Käse", priceDeltaCents: 100 },
        { id: "meat", name: "Extra Fleisch", priceDeltaCents: 200 },
      ],
    },
  ],
};

test("required modifier group is enforced", () => {
  const result = validateConfiguration(product, []);
  assert.equal(result.valid, false);
});

test("sold-out option cannot be selected", () => {
  const result = validateConfiguration(product, [
    { groupId: "sauce", optionIds: ["hot"] },
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /ausverkauft/);
});

test("unknown modifier group is rejected", () => {
  const result = validateConfiguration(product, [
    { groupId: "unknown", optionIds: ["whatever"] },
    { groupId: "sauce", optionIds: ["garlic"] },
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Unbekannte Auswahlgruppe/);
});

test("duplicate modifier group is rejected", () => {
  const result = validateConfiguration(product, [
    { groupId: "sauce", optionIds: ["garlic"] },
    { groupId: "sauce", optionIds: ["garlic"] },
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Gruppe doppelt/);
});

test("duplicate modifier option is rejected", () => {
  const result = validateConfiguration(product, [
    { groupId: "sauce", optionIds: ["garlic"] },
    { groupId: "extras", optionIds: ["cheese", "cheese"] },
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Option doppelt/);
});

test("configured price includes explicit extras", () => {
  const price = calculateConfiguredPriceCents(product, [
    { groupId: "sauce", optionIds: ["garlic"] },
    { groupId: "extras", optionIds: ["cheese", "meat"] },
  ]);
  assert.equal(price, 1150);
});
