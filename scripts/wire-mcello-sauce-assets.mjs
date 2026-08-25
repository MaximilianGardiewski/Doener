import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, content) => writeFile(path, content, "utf8");

const jsPath = "apps/mcello/public/doner-yufka-builder-v2.js";
const cssPath = "apps/mcello/public/doner-yufka-builder-v2.css";
const swPath = "apps/mcello/public/sw.js";
const manifestPath = "data/mcello/asset-manifest.json";
const staticTestPath = "tests/mcello-doner-yufka-builder-v2.test.mjs";
const browserTestPath = "tests/mcello-sauce-deck.browser.mjs";

const oldSauceMarkup = `        <g class="mc-sauce-deck" data-sauce-deck data-sauce-count="0">
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--curry" data-food-layer="Curry"><path d="M172 322c66-46 136-49 206-11 58 32 109 29 158-9" fill="none" stroke="#efbd43" stroke-width="19" stroke-linecap="round"/><path d="M192 352c60-33 119-33 177-4 50 24 96 21 136-5" fill="none" stroke="#f6d56d" stroke-width="9" stroke-linecap="round"/></g>
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--knoblauch" data-food-layer="Knoblauch"><path d="M168 362c63-40 129-42 196-7 63 32 118 28 168-9" fill="none" stroke="#f6efd8" stroke-width="19" stroke-linecap="round"/><path d="M190 392c54-30 112-31 172-2 52 25 97 20 138-5" fill="none" stroke="#fff9e8" stroke-width="9" stroke-linecap="round"/></g>
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--scharf" data-food-layer="Scharf"><path d="M174 402c62-38 129-39 196-4 59 30 113 25 162-10" fill="none" stroke="#d64736" stroke-width="19" stroke-linecap="round"/><path d="M200 430c53-27 108-27 164-1 48 22 90 18 128-5" fill="none" stroke="#ed7051" stroke-width="9" stroke-linecap="round"/></g>
        </g>`;

const newSauceMarkup = `        <g class="mc-sauce-deck" data-sauce-deck data-sauce-count="0">
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--curry" data-food-layer="Curry" data-asset-id="sauce-curry-master-v1"><image class="mc-sauce-raster" href="/assets/ingredients/sauces/sauce-curry-master.png" x="175" y="306" width="410" height="138" preserveAspectRatio="xMidYMid meet"/></g>
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--knoblauch" data-food-layer="Knoblauch" data-asset-id="sauce-garlic-master-v1"><image class="mc-sauce-raster" href="/assets/ingredients/sauces/sauce-garlic-master.png" x="175" y="346" width="410" height="138" preserveAspectRatio="xMidYMid meet"/></g>
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--scharf" data-food-layer="Scharf" data-asset-id="sauce-spicy-master-v1"><image class="mc-sauce-raster" href="/assets/ingredients/sauces/sauce-spicy-master.png" x="175" y="386" width="410" height="138" preserveAspectRatio="xMidYMid meet"/></g>
        </g>`;

let js = await read(jsPath);
if (!js.includes(oldSauceMarkup)) throw new Error("Expected SauceDeck SVG placeholder block not found");
js = js.replace(oldSauceMarkup, newSauceMarkup);
await write(jsPath, js);

let css = await read(cssPath);
const cssAnchor = ".mc-sauce-deck .mc-food-layer--sauce[data-sauce-slot] { transform-box: fill-box; transform-origin: center center; }\n";
if (!css.includes(cssAnchor)) throw new Error("SauceDeck CSS anchor not found");
css = css.replace(cssAnchor, `${cssAnchor}.mc-sauce-raster { pointer-events: none; filter: drop-shadow(0 4px 5px rgba(67, 42, 18, .18)); }\n`);
await write(cssPath, css);

let sw = await read(swPath);
if (!sw.includes('const CACHE = "mcello-public-shell-v36";')) throw new Error("Expected service-worker cache version not found");
sw = sw.replace('const CACHE = "mcello-public-shell-v36";', 'const CACHE = "mcello-public-shell-v37";');
const swAnchor = '  "/doner-yufka-builder-v2.js", "/doner-yufka-builder-v2.css",\n';
if (!sw.includes(swAnchor)) throw new Error("Service worker builder shell anchor not found");
sw = sw.replace(swAnchor, `${swAnchor}  "/assets/ingredients/sauces/sauce-curry-master.png", "/assets/ingredients/sauces/sauce-garlic-master.png", "/assets/ingredients/sauces/sauce-spicy-master.png",\n`);
await write(swPath, sw);

const manifest = JSON.parse(await read(manifestPath));
const sauceAssets = [
  {
    id: "sauce-curry-master-v1",
    version: 1,
    kind: "sauce-layer",
    productFamilies: ["doner", "yufka"],
    slot: "sauce.primary",
    path: "apps/mcello/public/assets/ingredients/sauces/sauce-curry-master.png",
    publicPath: "/assets/ingredients/sauces/sauce-curry-master.png",
    status: "approved-runtime",
    runtimeScope: "presentation-only-local-demo",
    documentary: false,
    provenance: "generated-product-visual",
    mappingType: "modifier-option",
    domainMapping: { presentationGroupKey: "doner-yufka-saucen", presentationOptionKey: "curry", productionOptionId: null },
    productionMappingStatus: "awaiting-owner-confirmed-domain-option-id",
    generator: "Adobe Firefly",
    promptId: "sauce-curry-layer-v1",
    generatedAt: "2026-08-25",
    generationRequestId: "9915e5b1-0aa9-4847-b75c-b48108aee2df",
    backgroundRemovalRequestId: "46a0f444-490e-4d21-92ae-cbfdc0fbe3c7",
    cropRequestId: "988266c1-905a-4553-b55a-0f149ce9d976",
    stagingOutput: "https://photoshop-api.adobe.io/v2/short-url/urn:aaid:ps:US:fd525d71-c2e5-41ed-b51c-24da0f590dac",
    stagingDimensions: { width: 1999, height: 674 },
    fireflyBoardId: "urn:aaid:sc:EU:bea31d70-9090-4de1-9b2e-e4feeeec4ef7",
    fireflyBoardEntityId: "1d46a8bc-ed1c-4fe0-bfdf-05e0ee4172b5",
    zIndex: 70,
    anchor: { x: 0.5, y: 0.42 },
    animationPreset: "sauce.splash.controlled",
    rendererBranch: "interactive-builder",
    runtimeDependency: true,
    runtimeReady: true,
    publishGatesPassed: ["asset-qa-approved", "provenance-recorded", "runtime-path-local-or-governed-media"],
    qa: { singleSubject: "pass", transparentCutout: "pass", cameraConsistency: "pass", sauceDeckFootprint: "pass", noDocumentaryClaim: "pass" },
    notes: "Approved local raster master for the presentation-only SauceDeck. Production modifier-option ID mapping remains pending owner-confirmed catalog truth."
  },
  {
    id: "sauce-garlic-master-v1",
    version: 1,
    kind: "sauce-layer",
    productFamilies: ["doner", "yufka"],
    slot: "sauce.primary",
    path: "apps/mcello/public/assets/ingredients/sauces/sauce-garlic-master.png",
    publicPath: "/assets/ingredients/sauces/sauce-garlic-master.png",
    status: "approved-runtime",
    runtimeScope: "presentation-only-local-demo",
    documentary: false,
    provenance: "generated-product-visual",
    mappingType: "modifier-option",
    domainMapping: { presentationGroupKey: "doner-yufka-saucen", presentationOptionKey: "knoblauch", productionOptionId: null },
    productionMappingStatus: "awaiting-owner-confirmed-domain-option-id",
    generator: "Adobe Firefly",
    promptId: "sauce-garlic-layer-v1",
    generatedAt: "2026-08-25",
    generationRequestId: "1407536f-3a01-4c8e-bac3-5dc99d57dfe1",
    backgroundRemovalRequestId: "d9f9f47d-f4bb-4e18-affb-051c4307d411",
    cropRequestId: "829aee14-a758-41b2-b03b-add03c188506",
    stagingOutput: "https://photoshop-api.adobe.io/v2/short-url/urn:aaid:ps:US:f2b9d109-b14a-4690-93cb-2d43d36216aa",
    stagingDimensions: { width: 1516, height: 511 },
    fireflyBoardId: "urn:aaid:sc:EU:bea31d70-9090-4de1-9b2e-e4feeeec4ef7",
    fireflyBoardEntityId: "e6d42cc2-cc93-4165-a579-a23d4cc6795b",
    zIndex: 70,
    anchor: { x: 0.5, y: 0.42 },
    animationPreset: "sauce.splash.controlled",
    rendererBranch: "interactive-builder",
    runtimeDependency: true,
    runtimeReady: true,
    publishGatesPassed: ["asset-qa-approved", "provenance-recorded", "runtime-path-local-or-governed-media"],
    qa: { singleSubject: "pass", transparentCutout: "pass", cameraConsistency: "pass", sauceDeckFootprint: "pass", noDocumentaryClaim: "pass" },
    notes: "Approved local raster master for the presentation-only SauceDeck. Production modifier-option ID mapping remains pending owner-confirmed catalog truth."
  },
  {
    id: "sauce-spicy-master-v1",
    version: 1,
    kind: "sauce-layer",
    productFamilies: ["doner", "yufka"],
    slot: "sauce.primary",
    path: "apps/mcello/public/assets/ingredients/sauces/sauce-spicy-master.png",
    publicPath: "/assets/ingredients/sauces/sauce-spicy-master.png",
    status: "approved-runtime",
    runtimeScope: "presentation-only-local-demo",
    documentary: false,
    provenance: "generated-product-visual",
    mappingType: "modifier-option",
    domainMapping: { presentationGroupKey: "doner-yufka-saucen", presentationOptionKey: "scharf", productionOptionId: null },
    productionMappingStatus: "awaiting-owner-confirmed-domain-option-id",
    generator: "Adobe Firefly",
    promptId: "sauce-spicy-layer-v1",
    generatedAt: "2026-08-25",
    generationRequestId: "1ae0caff-34e3-4c92-8cf1-f818c84881db",
    backgroundRemovalRequestId: "1597c1bb-edc5-45a9-a416-5e87d6b4ee8a",
    cropRequestId: "b41c6915-48bc-46f5-bf69-2ec45582ee98",
    stagingOutput: "https://photoshop-api.adobe.io/v2/short-url/urn:aaid:ps:US:6a1e0f75-77f4-487f-bc04-02dba0fd81fc",
    stagingDimensions: { width: 1521, height: 518 },
    fireflyBoardId: "urn:aaid:sc:EU:bea31d70-9090-4de1-9b2e-e4feeeec4ef7",
    fireflyBoardEntityId: "dd68d3e4-b190-4c86-bd79-f695febfd626",
    zIndex: 70,
    anchor: { x: 0.5, y: 0.42 },
    animationPreset: "sauce.splash.controlled",
    rendererBranch: "interactive-builder",
    runtimeDependency: true,
    runtimeReady: true,
    publishGatesPassed: ["asset-qa-approved", "provenance-recorded", "runtime-path-local-or-governed-media"],
    qa: { singleSubject: "pass", transparentCutout: "pass", cameraConsistency: "pass", sauceDeckFootprint: "pass", noDocumentaryClaim: "pass" },
    notes: "Approved local raster master for the presentation-only SauceDeck. Production modifier-option ID mapping remains pending owner-confirmed catalog truth."
  }
];

const knownIds = new Set(manifest.assets.map((asset) => asset.id));
const packIndex = manifest.assets.findIndex((asset) => asset.id === "doner-core-layer-pack-v1");
if (packIndex < 0) throw new Error("doner-core-layer-pack-v1 missing from manifest");
const additions = sauceAssets.filter((asset) => !knownIds.has(asset.id));
manifest.assets.splice(packIndex, 0, ...additions);
const pack = manifest.assets.find((asset) => asset.id === "doner-core-layer-pack-v1");
pack.status = "production-started-sauce-runtime-approved";
pack.runtimeApprovedAssets = sauceAssets.map((asset) => asset.id);
pack.notes = "The reusable 2.5D builder pack now has three governed local SauceDeck raster masters. Curry, garlic and spicy are approved for the presentation-only local runtime; owner-confirmed production modifier-option IDs remain a separate catalog gate. bread.bottom remains QA-approved staging until its binary is published.";
await write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

let staticTest = await read(staticTestPath);
staticTest = staticTest.replace('import { readFile } from "node:fs/promises";', 'import { readFile, stat } from "node:fs/promises";');
const staticAnchor = 'test("SauceDeck keeps one visual sauce plane and deterministically redistributes one to three sauces", () => {';
if (!staticTest.includes(staticAnchor)) throw new Error("Static SauceDeck test anchor not found");
const staticAddition = `test("SauceDeck uses governed local Adobe sauce masters with no Adobe runtime dependency", async () => {
  const assets = [
    ["sauce-curry-master-v1", "/assets/ingredients/sauces/sauce-curry-master.png", "apps/mcello/public/assets/ingredients/sauces/sauce-curry-master.png"],
    ["sauce-garlic-master-v1", "/assets/ingredients/sauces/sauce-garlic-master.png", "apps/mcello/public/assets/ingredients/sauces/sauce-garlic-master.png"],
    ["sauce-spicy-master-v1", "/assets/ingredients/sauces/sauce-spicy-master.png", "apps/mcello/public/assets/ingredients/sauces/sauce-spicy-master.png"],
  ];
  for (const [id, publicPath, repoPath] of assets) {
    assert.ok(js.includes(\`data-asset-id=\\"\${id}\\"\`));
    assert.ok(js.includes(\`href=\\"\${publicPath}\\"\`));
    assert.ok(sw.includes(publicPath));
    const file = await stat(new URL(repoPath, root));
    assert.ok(file.size > 10_000, \`\${repoPath} must be a real PNG asset\`);
    const manifestAsset = assetManifest.assets.find((asset) => asset.id === id);
    assert.ok(manifestAsset, \`\${id} must be governed in the asset manifest\`);
    assert.equal(manifestAsset.status, "approved-runtime");
    assert.equal(manifestAsset.runtimeScope, "presentation-only-local-demo");
    assert.equal(manifestAsset.runtimeReady, true);
    assert.equal(manifestAsset.publicPath, publicPath);
    assert.equal(manifestAsset.slot, "sauce.primary");
    assert.equal(manifestAsset.productionMappingStatus, "awaiting-owner-confirmed-domain-option-id");
  }
  assert.doesNotMatch(js + css, /photoshop-api|firefly\\.adobe|short-url/i);
});

`;
staticTest = staticTest.replace(staticAnchor, staticAddition + staticAnchor);
await write(staticTestPath, staticTest);

let browserTest = await read(browserTestPath);
const browserAnchor = '  assert.equal(await page.locator("[data-sauce-deck]").getAttribute("data-sauce-count"), "0");\n';
if (!browserTest.includes(browserAnchor)) throw new Error("Browser SauceDeck test anchor not found");
browserTest = browserTest.replace(browserAnchor, `${browserAnchor}  assert.deepEqual(await page.locator("[data-sauce-deck] image.mc-sauce-raster").evaluateAll((images) => images.map((image) => image.getAttribute("href"))), [
    "/assets/ingredients/sauces/sauce-curry-master.png",
    "/assets/ingredients/sauces/sauce-garlic-master.png",
    "/assets/ingredients/sauces/sauce-spicy-master.png",
  ]);\n`);
await write(browserTestPath, browserTest);

console.log("Mcello SauceDeck wired to governed local Adobe raster masters.");
