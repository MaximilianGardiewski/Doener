/*
 * Presentation-only metadata for atomic FoodStage ingredients.
 *
 * Commerce IDs, prices, availability and selection limits intentionally do not
 * live here. The application and @business-web/menu-engine remain authoritative
 * for those concerns; this registry only maps already-rendered option names to
 * deterministic visual instances.
 */

const freezeSlots = (slots) => Object.freeze(slots.map((slot) => Object.freeze(slot)));
const freezeRules = (rules) => Object.freeze(rules.map((rule) => Object.freeze({
  ...rule,
  names: Object.freeze([...rule.names]),
})));
const freezeProductFormRules = (rules = []) => Object.freeze(rules.map((rule) => Object.freeze({
  ...rule,
  forms: Object.freeze([...rule.forms]),
})));

function defineVisual(definition) {
  return Object.freeze({
    ...definition,
    optionRules: freezeRules(definition.optionRules),
    productFormRules: freezeProductFormRules(definition.productFormRules),
    slots: freezeSlots(definition.slots),
  });
}

export const TOMATO_VISUAL = defineVisual({
  assetId: "ingredient.tomato.slice",
  assetUrl: "/media/ingredients/ingredient.tomato.slice.png",
  classToken: "tomato",
  layerName: "Tomate",
  runtimeReady: true,
  baseInstanceCount: 3,
  extraInstanceCount: 2,
  instanceSize: 132,
  optionRules: [
    { names: ["tomate", "tomaten"], count: 3 },
    { names: ["extra tomate", "extra tomaten", "tomate extra", "tomaten extra"], count: 2 },
  ],
  slots: [
    { x: 292, y: 392, rotation: -8, scale: 1 },
    { x: 380, y: 384, rotation: 6, scale: 1.02 },
    { x: 468, y: 392, rotation: -6, scale: 0.98 },
    { x: 336, y: 368, rotation: 10, scale: 0.92 },
    { x: 424, y: 368, rotation: -9, scale: 0.9 },
    { x: 250, y: 398, rotation: 4, scale: 0.86 },
    { x: 510, y: 398, rotation: -5, scale: 0.86 },
  ],
});

/* Governed Adobe masters exist for every registered family. Host presence still
 * gates activation, so flatbread remains dormant until product-form metadata is
 * available in the existing Döner/Yufka presentation adapter. */
export const CUCUMBER_VISUAL = defineVisual({
  assetId: "ingredient.cucumber.slice",
  assetUrl: "/media/ingredients/ingredient.cucumber.slice.png",
  classToken: "cucumber",
  layerName: "Gurke",
  runtimeReady: true,
  baseInstanceCount: 4,
  extraInstanceCount: 0,
  instanceSize: 118,
  optionRules: [{ names: ["gurke", "gurken", "salatgurke", "salatgurken"], count: 4 }],
  slots: [
    { x: 272, y: 376, rotation: 10, scale: 0.96 },
    { x: 348, y: 370, rotation: -8, scale: 1 },
    { x: 424, y: 372, rotation: 9, scale: 0.96 },
    { x: 500, y: 378, rotation: -10, scale: 0.9 },
    { x: 310, y: 392, rotation: 6, scale: 0.86 },
    { x: 386, y: 392, rotation: -7, scale: 0.86 },
    { x: 462, y: 394, rotation: 8, scale: 0.84 },
  ],
});

export const LETTUCE_VISUAL = defineVisual({
  assetId: "ingredient.lettuce.iceberg.leaf",
  assetUrl: "/media/ingredients/ingredient.lettuce.iceberg.leaf.png",
  classToken: "lettuce",
  layerName: "Salat",
  runtimeReady: true,
  baseInstanceCount: 5,
  extraInstanceCount: 0,
  instanceSize: 168,
  optionRules: [{ names: ["salat", "eisbergsalat", "eisberg salat"], count: 5 }],
  slots: [
    { x: 286, y: 282, rotation: -12, scale: 0.94 },
    { x: 362, y: 272, rotation: 8, scale: 1 },
    { x: 438, y: 278, rotation: -7, scale: 0.96 },
    { x: 500, y: 290, rotation: 11, scale: 0.88 },
    { x: 400, y: 246, rotation: -5, scale: 0.9 },
    { x: 312, y: 250, rotation: 7, scale: 0.84 },
    { x: 462, y: 252, rotation: -9, scale: 0.84 },
    { x: 380, y: 302, rotation: 4, scale: 0.8 },
  ],
});

export const ONION_VISUAL = defineVisual({
  assetId: "ingredient.onion.ring",
  assetUrl: "/media/ingredients/ingredient.onion.ring.png",
  classToken: "onion",
  layerName: "Zwiebel",
  runtimeReady: true,
  baseInstanceCount: 3,
  extraInstanceCount: 0,
  instanceSize: 116,
  optionRules: [{ names: ["zwiebel", "zwiebeln", "rote zwiebel", "rote zwiebeln"], count: 3 }],
  slots: [
    { x: 312, y: 358, rotation: -9, scale: 1 },
    { x: 380, y: 352, rotation: 7, scale: 1 },
    { x: 448, y: 358, rotation: -6, scale: 0.96 },
    { x: 346, y: 338, rotation: 5, scale: 0.88 },
    { x: 414, y: 338, rotation: -8, scale: 0.88 },
    { x: 380, y: 372, rotation: 4, scale: 0.82 },
  ],
});

export const FLATBREAD_VISUAL = defineVisual({
  assetId: "ingredient.flatbread.pocket",
  assetUrl: "/media/ingredients/ingredient.flatbread.pocket.png",
  classToken: "flatbread",
  layerName: "Fladenbrot",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 440,
  optionRules: [],
  productFormRules: [{ forms: ["flatbread-pocket"], count: 1 }],
  slots: [
    { x: 380, y: 470, rotation: 0, scale: 1 },
  ],
});

export const GARLIC_SAUCE_VISUAL = defineVisual({
  assetId: "ingredient.sauce.garlic.ribbon",
  assetUrl: "/media/ingredients/ingredient.sauce.garlic.ribbon.png",
  classToken: "garlic-sauce",
  layerName: "Knoblauch",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 300,
  optionRules: [{ names: ["knoblauch", "knoblauchsoße", "knoblauch soße", "knoblauchsosse", "knoblauch sosse"], count: 1 }],
  slots: [
    { x: 416, y: 406, rotation: 5, scale: 1 },
    { x: 470, y: 422, rotation: -5, scale: 0.86 },
    { x: 330, y: 432, rotation: 7, scale: 0.84 },
    { x: 268, y: 418, rotation: -4, scale: 0.78 },
  ],
});

export const CURRY_SAUCE_VISUAL = defineVisual({
  assetId: "ingredient.sauce.curry.ribbon",
  assetUrl: "/media/ingredients/ingredient.sauce.curry.ribbon.png",
  classToken: "curry-sauce",
  layerName: "Curry",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 300,
  optionRules: [{ names: ["curry", "currysoße", "curry soße", "currysosse", "curry sosse"], count: 1 }],
  slots: [
    { x: 344, y: 420, rotation: -4, scale: 1 },
    { x: 300, y: 436, rotation: 6, scale: 0.86 },
    { x: 430, y: 430, rotation: -6, scale: 0.84 },
    { x: 486, y: 418, rotation: 5, scale: 0.78 },
  ],
});

export const DONER_MEAT_VISUAL = defineVisual({
  assetId: "ingredient.meat.doner.shaving",
  assetUrl: "/media/ingredients/ingredient.meat.doner.shaving.png",
  classToken: "doner-meat",
  layerName: "Fleisch",
  runtimeReady: true,
  baseInstanceCount: 7,
  extraInstanceCount: 0,
  instanceSize: 152,
  optionRules: [{ names: ["fleisch", "kalb", "kalbfleisch", "dönerkalbfleisch", "döner kalbfleisch", "drehspieß", "drehspiess"], count: 7 }],
  slots: [
    { x: 280, y: 338, rotation: -12, scale: 0.96 },
    { x: 356, y: 330, rotation: 8, scale: 1 },
    { x: 432, y: 336, rotation: -9, scale: 0.96 },
    { x: 496, y: 344, rotation: 12, scale: 0.9 },
    { x: 312, y: 306, rotation: 6, scale: 0.94 },
    { x: 388, y: 300, rotation: -10, scale: 1 },
    { x: 458, y: 308, rotation: 9, scale: 0.92 },
    { x: 250, y: 318, rotation: -6, scale: 0.84 },
    { x: 520, y: 314, rotation: 7, scale: 0.82 },
    { x: 380, y: 276, rotation: -4, scale: 0.86 },
  ],
});

export const FALAFEL_VISUAL = defineVisual({
  assetId: "ingredient.falafel.ball",
  assetUrl: "/media/ingredients/ingredient.falafel.ball.png",
  classToken: "falafel",
  layerName: "Falafel",
  runtimeReady: true,
  baseInstanceCount: 5,
  extraInstanceCount: 0,
  instanceSize: 128,
  optionRules: [{ names: ["falafel"], count: 5 }],
  slots: [
    { x: 300, y: 332, rotation: -5, scale: 0.98 },
    { x: 370, y: 322, rotation: 6, scale: 1 },
    { x: 440, y: 330, rotation: -4, scale: 0.96 },
    { x: 336, y: 296, rotation: 7, scale: 0.92 },
    { x: 408, y: 292, rotation: -6, scale: 0.92 },
    { x: 262, y: 318, rotation: 4, scale: 0.86 },
    { x: 478, y: 318, rotation: -5, scale: 0.86 },
  ],
});

export const ATOMIC_INGREDIENT_VISUALS = Object.freeze([
  TOMATO_VISUAL,
  CUCUMBER_VISUAL,
  LETTUCE_VISUAL,
  ONION_VISUAL,
  FLATBREAD_VISUAL,
  GARLIC_SAUCE_VISUAL,
  CURRY_SAUCE_VISUAL,
  DONER_MEAT_VISUAL,
  FALAFEL_VISUAL,
]);

export function normalizeIngredientOptionName(value) {
  return String(value || "").trim().toLocaleLowerCase("de");
}

export function atomicInstanceContribution(visual, optionName) {
  const name = normalizeIngredientOptionName(optionName);
  return visual.optionRules.find((rule) => rule.names.includes(name))?.count || 0;
}

export function atomicProductFormContribution(visual, productForm) {
  const form = normalizeIngredientOptionName(productForm);
  return visual.productFormRules.find((rule) => rule.forms.includes(form))?.count || 0;
}

export function atomicVisualForOption(optionName, registry = ATOMIC_INGREDIENT_VISUALS) {
  return registry.find((visual) => atomicInstanceContribution(visual, optionName) > 0) || null;
}

export function atomicInstanceCount(visual, selectedOptionNames, productForm = "") {
  const requested = [...selectedOptionNames]
    .reduce((total, name) => total + atomicInstanceContribution(visual, name), 0)
    + atomicProductFormContribution(visual, productForm);
  return Math.min(requested, visual.slots.length);
}

export function atomicInstanceKey(assetId, index) {
  return `${assetId}:${index}`;
}

export function atomicInstancePlan(visual, existingKeys, desiredCount) {
  const desiredKeys = visual.slots
    .slice(0, Math.max(0, Math.min(desiredCount, visual.slots.length)))
    .map((_, index) => atomicInstanceKey(visual.assetId, index));
  const desired = new Set(desiredKeys);
  const existing = new Set(existingKeys);
  return {
    desiredKeys,
    addedKeys: desiredKeys.filter((key) => !existing.has(key)),
    removedKeys: [...existing].filter((key) => !desired.has(key)),
  };
}

// Compatibility exports keep the initial Tomato contract stable for consumers.
export function tomatoInstanceContribution(optionName) {
  return atomicInstanceContribution(TOMATO_VISUAL, optionName);
}

export function tomatoInstanceCount(selectedOptionNames) {
  return atomicInstanceCount(TOMATO_VISUAL, selectedOptionNames);
}

export function tomatoInstancePlan(existingKeys, desiredCount) {
  return atomicInstancePlan(TOMATO_VISUAL, existingKeys, desiredCount);
}
