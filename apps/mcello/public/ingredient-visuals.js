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

/*
 * D076 layer contract: one governed master per ingredient role, one finished
 * layer image per role (`instancePolicy.frontendInstantiation: "single-layer-instance"`
 * in each asset.json). This replaces the D075 scattered-instance model below —
 * every visual now has exactly one slot, sized to span most of the stage width,
 * because the master itself already depicts the assembled layer.
 */
export const TOMATO_VISUAL = defineVisual({
  assetId: "ingredient.tomato.layer",
  assetUrl: "/media/ingredients/ingredient.tomato.layer.png",
  classToken: "tomato",
  layerName: "Tomate",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 260,
  optionRules: [{ names: ["tomate", "tomaten"], count: 1 }],
  slots: [{ x: 380, y: 398, rotation: 0, scale: 1 }],
});

/* Extra Tomate keeps its own separate governed master (delta semantics) instead
 * of a second instance of the base tomato layer. */
export const TOMATO_EXTRA_VISUAL = defineVisual({
  assetId: "ingredient.tomato.layer.extra",
  assetUrl: "/media/ingredients/ingredient.tomato.layer.extra.png",
  classToken: "tomato-extra",
  layerName: "Tomate",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 260,
  optionRules: [{ names: ["extra tomate", "extra tomaten", "tomate extra", "tomaten extra"], count: 1 }],
  slots: [{ x: 380, y: 388, rotation: 0, scale: 1 }],
});

export const CUCUMBER_VISUAL = defineVisual({
  assetId: "ingredient.cucumber.layer",
  assetUrl: "/media/ingredients/ingredient.cucumber.layer.png",
  classToken: "cucumber",
  layerName: "Gurke",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 260,
  optionRules: [{ names: ["gurke", "gurken", "salatgurke", "salatgurken"], count: 1 }],
  slots: [{ x: 380, y: 380, rotation: 0, scale: 1 }],
});

export const LETTUCE_VISUAL = defineVisual({
  assetId: "ingredient.lettuce.layer",
  assetUrl: "/media/ingredients/ingredient.lettuce.layer.png",
  classToken: "lettuce",
  layerName: "Salat",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 300,
  optionRules: [{ names: ["salat", "eisbergsalat", "eisberg salat"], count: 1 }],
  slots: [{ x: 380, y: 296, rotation: 0, scale: 1 }],
});

export const ONION_VISUAL = defineVisual({
  assetId: "ingredient.onion.layer",
  assetUrl: "/media/ingredients/ingredient.onion.layer.png",
  classToken: "onion",
  layerName: "Zwiebel",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 240,
  optionRules: [{ names: ["zwiebel", "zwiebeln", "rote zwiebel", "rote zwiebeln"], count: 1 }],
  slots: [{ x: 380, y: 352, rotation: 0, scale: 1 }],
});

export const FLATBREAD_VISUAL = defineVisual({
  assetId: "ingredient.flatbread.base",
  assetUrl: "/media/ingredients/ingredient.flatbread.base.png",
  classToken: "flatbread",
  layerName: "Fladenbrot",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 396,
  optionRules: [],
  productFormRules: [{ forms: ["flatbread-pocket"], count: 1 }],
  slots: [{ x: 380, y: 430, rotation: 0, scale: 1 }],
});

/* Deckel: the second flatbread master (D076). Always the last-painted layer,
 * driven by the same product-form metadata as the base, never by an option. */
export const FLATBREAD_LID_VISUAL = defineVisual({
  assetId: "ingredient.flatbread.lid",
  assetUrl: "/media/ingredients/ingredient.flatbread.lid.png",
  classToken: "flatbread-lid",
  layerName: "Deckel",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 340,
  optionRules: [],
  productFormRules: [{ forms: ["flatbread-pocket"], count: 1 }],
  slots: [{ x: 380, y: 274, rotation: 0, scale: 1 }],
});

export const GARLIC_SAUCE_VISUAL = defineVisual({
  assetId: "ingredient.sauce.garlic.layer",
  assetUrl: "/media/ingredients/ingredient.sauce.garlic.layer.png",
  classToken: "garlic-sauce",
  layerName: "Knoblauch",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 280,
  optionRules: [{ names: ["knoblauch", "knoblauchsoße", "knoblauch soße", "knoblauchsosse", "knoblauch sosse"], count: 1 }],
  slots: [{ x: 380, y: 414, rotation: 0, scale: 1 }],
});

export const CURRY_SAUCE_VISUAL = defineVisual({
  assetId: "ingredient.sauce.curry.layer",
  assetUrl: "/media/ingredients/ingredient.sauce.curry.layer.png",
  classToken: "curry-sauce",
  layerName: "Curry",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 280,
  optionRules: [{ names: ["curry", "currysoße", "curry soße", "currysosse", "curry sosse"], count: 1 }],
  slots: [{ x: 380, y: 402, rotation: 0, scale: 1 }],
});

/* Optional 12th layer master (Scharf) — now landed, closing the last gap the
 * blueprint's layer contract table left open. */
export const HOT_SAUCE_VISUAL = defineVisual({
  assetId: "ingredient.sauce.hot.layer",
  assetUrl: "/media/ingredients/ingredient.sauce.hot.layer.png",
  classToken: "hot-sauce",
  layerName: "Scharf",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 280,
  optionRules: [{ names: ["scharf", "scharfe soße", "scharf soße", "chili", "chilisoße", "chili soße"], count: 1 }],
  slots: [{ x: 380, y: 426, rotation: 0, scale: 1 }],
});

export const DONER_MEAT_VISUAL = defineVisual({
  assetId: "ingredient.meat.doner.layer",
  assetUrl: "/media/ingredients/ingredient.meat.doner.layer.png",
  classToken: "doner-meat",
  layerName: "Fleisch",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 300,
  optionRules: [{ names: ["fleisch", "kalb", "kalbfleisch", "dönerkalbfleisch", "döner kalbfleisch", "drehspieß", "drehspiess"], count: 1 }],
  slots: [{ x: 380, y: 326, rotation: 0, scale: 1 }],
});

export const FALAFEL_VISUAL = defineVisual({
  assetId: "ingredient.falafel.layer",
  assetUrl: "/media/ingredients/ingredient.falafel.layer.png",
  classToken: "falafel",
  layerName: "Falafel",
  runtimeReady: true,
  baseInstanceCount: 1,
  extraInstanceCount: 0,
  instanceSize: 300,
  optionRules: [{ names: ["falafel"], count: 1 }],
  slots: [{ x: 380, y: 326, rotation: 0, scale: 1 }],
});

export const ATOMIC_INGREDIENT_VISUALS = Object.freeze([
  FLATBREAD_VISUAL,
  GARLIC_SAUCE_VISUAL,
  CURRY_SAUCE_VISUAL,
  HOT_SAUCE_VISUAL,
  TOMATO_VISUAL,
  TOMATO_EXTRA_VISUAL,
  CUCUMBER_VISUAL,
  ONION_VISUAL,
  DONER_MEAT_VISUAL,
  FALAFEL_VISUAL,
  LETTUCE_VISUAL,
  FLATBREAD_LID_VISUAL,
]);

/*
 * Paint order of the D076 stack, bottom to top. This mirrors the SVG document
 * order in doner-yufka-builder-v2.js, which is what actually decides z-order --
 * ATOMIC_INGREDIENT_VISUALS above is grouped for reading, not for stacking.
 * Keeping the order here as data lets the exploded view and the stage's
 * dimension readout derive from one list instead of each guessing.
 */
export const STACK_PAINT_ORDER = Object.freeze([
  "ingredient.flatbread.base",
  "ingredient.sauce.curry.layer",
  "ingredient.sauce.garlic.layer",
  "ingredient.sauce.hot.layer",
  "ingredient.tomato.layer",
  "ingredient.tomato.layer.extra",
  "ingredient.cucumber.layer",
  "ingredient.onion.layer",
  "ingredient.meat.doner.layer",
  "ingredient.falafel.layer",
  "ingredient.lettuce.layer",
  "ingredient.flatbread.lid",
]);

/* Distance between two neighbouring layers in the exploded view, in SVG user units. */
export const STACK_EXPLODE_GAP = 9;

/*
 * Derived from the layer's rank in the paint order rather than stored per slot,
 * so adding or reordering a layer can never leave a hand-tuned offset behind
 * that no longer matches the stack. Negative moves up, positive moves down.
 */
export function stackExplodeOffset(assetId, order = STACK_PAINT_ORDER) {
  const index = order.indexOf(assetId);
  if (index < 0) return 0;
  const middle = (order.length - 1) / 2;
  return Number(((middle - index) * STACK_EXPLODE_GAP).toFixed(2));
}

/*
 * Total height the exploded stack spans, measured over the layers actually on
 * screen. The stage prints this as its "Gesamthöhe" readout, so the number is a
 * real measurement of the current selection and never decorative text.
 */
export function stackExplodeSpan(activeAssetIds, order = STACK_PAINT_ORDER) {
  const offsets = [...new Set(activeAssetIds)]
    .filter((assetId) => order.includes(assetId))
    .map((assetId) => stackExplodeOffset(assetId, order));
  if (offsets.length < 2) return 0;
  return Number((Math.max(...offsets) - Math.min(...offsets)).toFixed(2));
}

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
