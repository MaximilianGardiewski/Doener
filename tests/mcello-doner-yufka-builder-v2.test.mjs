import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const js = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.js", root), "utf8");
const css = await readFile(new URL("apps/mcello/public/doner-yufka-builder-v2.css", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const seed = JSON.parse(await readFile(new URL("data/mcello/menu-seed.provisional.json", root), "utf8"));
const presentation = JSON.parse(await readFile(new URL("data/mcello/builder-presentation.v1.json", root), "utf8"));
const ingredientContract = JSON.parse(await readFile(new URL("data/mcello/ingredient-asset-contract.v1.json", root), "utf8"));
const assetManifest = JSON.parse(await readFile(new URL("data/mcello/asset-manifest.json", root), "utf8"));
const promptLibrary = JSON.parse(await readFile(new URL("data/mcello/prompt-library.json", root), "utf8"));

const ids = ["warm-013","warm-014","warm-015","warm-016","warm-017","warm-018"];
const groupByName = new Map(presentation.donerYufka.groups.map((group) => [group.name, group]));

test("Döner/Yufka presentation remains scoped by exact local fixture product links", () => {
  const seeded = new Map(seed.items.map((item) => [item[0], item]));
  assert.deepEqual(presentation.donerYufka.productSourceIds, ids);
  for (const id of ids) assert.ok(seeded.has(id));
  assert.match(js, /presentationGroupMap/);
  assert.match(js, /dataset\.productBuilder = "doner-yufka"/);
  assert.match(js, /Basis/);
  assert.match(js, /Gemüse/);
  assert.match(js, /Soße/);
});

test("local presentation adds basis and fresh assumptions without mutating provisional production seed", () => {
  const selected = seed.items.filter((item) => ids.includes(item[0]));
  assert.ok(selected.every((item) => Array.isArray(item[5]) && item[5].length === 0));
  assert.deepEqual(groupByName.get("Basis").options.map((option) => option.name), ["Fleisch", "Falafel"]);
  assert.deepEqual(groupByName.get("Gemüse").options.map((option) => option.name), ["Salat", "Tomate", "Gurke", "Zwiebel"]);
  assert.deepEqual(groupByName.get("Soße").options.map((option) => option.name), ["Curry", "Knoblauch", "Scharf"]);
  assert.match(presentation.notes.join("\n"), /presentation assumptions/i);
});

test("FoodStage mirrors actual checked modifier inputs and never owns commerce state", () => {
  assert.match(js, /querySelector\("input"\)/);
  assert.match(js, /input\?\.checked/);
  assert.match(js, /data-food-layer/);
  assert.match(js, /dataset\.assemblyVisualLayers/);
  assert.match(js, /Stilisierte Präsentationsillustration/);
  assert.doesNotMatch(js, /\.checked\s*=|localStorage|sessionStorage|fetch\s*\(|cart\s*=|configuredPrice|configurationValid/);
});

test("cartoon assembly has distinct ingredient layers and purposeful lightweight motion", () => {
  for (const ingredient of ["Fleisch", "Falafel", "Salat", "Tomate", "Gurke", "Zwiebel", "Curry", "Knoblauch", "Scharf"]) {
    assert.match(js, new RegExp(`data-food-layer=\\"${ingredient}\\"`));
  }
  assert.match(css, /mc-food-stage-v4/);
  assert.match(css, /transform/);
  assert.match(css, /opacity/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /Stilisierte|illustration/i);
  assert.doesNotMatch(js + css, /https:\/\//i);
  assert.doesNotMatch(js + css, /firefly|photoshop-api|short-url/i);
});

test("Tomate uses one governed local Adobe master instanced deterministically with no Adobe runtime dependency", async () => {
  const id = "fresh-tomato-slice-master-v1";
  const publicPath = "/assets/ingredients/fresh/tomato-slice-master.png";
  const repoPath = "apps/mcello/public/assets/ingredients/fresh/tomato-slice-master.png";
  assert.ok(js.includes(`data-asset-id=\"${id}\"`));
  assert.equal(js.split(`href=\"${publicPath}\"`).length - 1, 3, "one tomato master should be instanced three times");
  assert.ok(sw.includes(publicPath));
  const file = await stat(new URL(repoPath, root));
  assert.ok(file.size > 10_000, `${repoPath} must be a real PNG asset`);
  const manifestAsset = assetManifest.assets.find((asset) => asset.id === id);
  assert.ok(manifestAsset, `${id} must be governed in the asset manifest`);
  assert.equal(manifestAsset.status, "approved-runtime");
  assert.equal(manifestAsset.runtimeScope, "presentation-only-local-demo");
  assert.equal(manifestAsset.runtimeReady, true);
  assert.equal(manifestAsset.slot, "fresh.tomato");
  assert.equal(manifestAsset.publicPath, publicPath);
  assert.equal(manifestAsset.productionMappingStatus, "awaiting-owner-confirmed-domain-option-id");
  assert.match(manifestAsset.reusePolicy || "", /single-master-instanced-three-times/i);
  const prompt = promptLibrary.prompts.find((entry) => entry.id === "tomato-slice-layer-v1");
  assert.ok(prompt, "tomato-slice-layer-v1 must be recorded in the prompt library");
  assert.equal(prompt.status, "executed-qa-approved-runtime-demo");
  assert.equal(prompt.targetSlot, "fresh.tomato");
  assert.match(prompt.generationRule, /exactly one tomato-slice master/i);
  assert.doesNotMatch(js + css, /photoshop-api|firefly\.adobe|short-url/i);
});

test("SauceDeck uses governed local Adobe sauce masters with no Adobe runtime dependency", async () => {
  const assets = [
    ["sauce-curry-master-v1", "/assets/ingredients/sauces/sauce-curry-master.png", "apps/mcello/public/assets/ingredients/sauces/sauce-curry-master.png"],
    ["sauce-garlic-master-v1", "/assets/ingredients/sauces/sauce-garlic-master.png", "apps/mcello/public/assets/ingredients/sauces/sauce-garlic-master.png"],
    ["sauce-spicy-master-v1", "/assets/ingredients/sauces/sauce-spicy-master.png", "apps/mcello/public/assets/ingredients/sauces/sauce-spicy-master.png"],
  ];
  for (const [id, publicPath, repoPath] of assets) {
    assert.ok(js.includes(`data-asset-id=\"${id}\"`));
    assert.ok(js.includes(`href=\"${publicPath}\"`));
    assert.ok(sw.includes(publicPath));
    const file = await stat(new URL(repoPath, root));
    assert.ok(file.size > 10_000, `${repoPath} must be a real PNG asset`);
    const manifestAsset = assetManifest.assets.find((asset) => asset.id === id);
    assert.ok(manifestAsset, `${id} must be governed in the asset manifest`);
    assert.equal(manifestAsset.status, "approved-runtime");
    assert.equal(manifestAsset.runtimeScope, "presentation-only-local-demo");
    assert.equal(manifestAsset.runtimeReady, true);
    assert.equal(manifestAsset.publicPath, publicPath);
    assert.equal(manifestAsset.slot, "sauce.primary");
    assert.equal(manifestAsset.productionMappingStatus, "awaiting-owner-confirmed-domain-option-id");
  }
  assert.doesNotMatch(js + css, /photoshop-api|firefly\.adobe|short-url/i);
});

test("SauceDeck keeps one visual sauce plane and deterministically redistributes one to three sauces", () => {
  assert.match(js, /data-sauce-deck/);
  assert.match(js, /const SAUCE_LAYER_NAMES = Object\.freeze\(\["Curry", "Knoblauch", "Scharf"\]\)/);
  assert.match(js, /const SAUCE_LAYOUTS = Object\.freeze/);
  assert.match(js, /1: Object\.freeze\(\[\{ x: 0, y: 0, scaleX: 1/);
  assert.match(js, /2: Object\.freeze\(\[/);
  assert.match(js, /3: Object\.freeze\(\[/);
  assert.match(js, /function updateSauceDeck/);
  assert.match(js, /dataset\.sauceSlot/);
  assert.match(js, /dataset\.sauceCount/);
  assert.match(js, /dataset\.assemblySauceCount/);
  assert.match(js, /layer\.style\.transform = sauceTransform/);
  assert.doesNotMatch(js, /Math\.random/);
  assert.match(css, /\.mc-sauce-deck \.mc-food-layer--sauce\[data-sauce-slot\]/);
  assert.match(css, /transform-box:\s*fill-box/);
  assert.match(css, /transform-origin:\s*center center/);
});

test("governed asset contract reserves sauce.primary as a three-member presentation-only composite slot", () => {
  const sauceSlot = ingredientContract.layerSlots.find((slot) => slot.slot === "sauce.primary");
  assert.ok(sauceSlot);
  assert.equal(sauceSlot.mappingType, "modifier-option");
  assert.equal(sauceSlot.capacity, 3);
  assert.equal(sauceSlot.compositor, "sauce-deck-v1");

  const compositor = ingredientContract.compositors?.["sauce-deck-v1"];
  assert.ok(compositor);
  assert.equal(compositor.slot, "sauce.primary");
  assert.equal(compositor.assetKind, "sauce-layer");
  assert.equal(compositor.capacity, 3);
  assert.equal(compositor.authority, "presentation-only");
  assert.equal(compositor.ordering, "stable-mapped-option-order");
  assert.deepEqual(Object.fromEntries(Object.entries(compositor.layouts).map(([count, layout]) => [count, layout.length])), { "1": 1, "2": 2, "3": 3 });
  assert.match(compositor.rule, /one z-plane/i);

  const pack = assetManifest.assets.find((asset) => asset.id === "doner-core-layer-pack-v1");
  assert.ok(pack);
  assert.ok(pack.targetSlots.includes("sauce.primary"));
  assert.deepEqual(pack.slotPolicies?.["sauce.primary"], {
    capacity: 3,
    compositor: "sauce-deck-v1",
    authority: "presentation-only",
  });
});

test("Firefly asset workflow generates Curry, Knoblauch and Scharf separately for SauceDeck composition", () => {
  const prompts = new Map(promptLibrary.prompts.map((prompt) => [prompt.id, prompt]));
  const legacy = prompts.get("sauce-layer-v1");
  assert.equal(legacy?.status, "superseded-by-individual-sauce-assets");
  assert.match(legacy?.qaNote || "", /one generation command per asset/i);

  const individualIds = ["sauce-curry-layer-v1", "sauce-garlic-layer-v1", "sauce-spicy-layer-v1"];
  for (const id of individualIds) {
    const prompt = prompts.get(id);
    assert.ok(prompt, `${id} must exist`);
    assert.equal(prompt.status, "prompt-ready");
    assert.equal(prompt.usage, "interactive-builder-layer-candidate");
    assert.equal(prompt.targetSlot, "sauce.primary");
    assert.equal(prompt.compositor, "sauce-deck-v1");
    assert.equal(prompt.assetKind, "sauce-layer");
    assert.match(prompt.prompt, /exactly ONE isolated/i);
    assert.match(prompt.generationRule, /Generate this asset alone/i);
  }
});

test("Döner/Yufka presentation code remains in refreshed offline shell while business data stays network-only", () => {
  assert.match(sw, /mcello-public-shell-v\d+/);
  assert.match(sw, /doner-yufka-builder-v2\.js/);
  assert.match(sw, /doner-yufka-builder-v2\.css/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
});
