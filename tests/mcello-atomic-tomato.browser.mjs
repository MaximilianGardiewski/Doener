import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { FLATBREAD_VISUAL } from "../apps/mcello/public/ingredient-visuals.js";

/*
 * The production presentation fixture deliberately has no unconfirmed Extra
 * Tomato commerce option. This route-local payload proves the visual contract
 * without inventing a production price or changing menu-engine data.
 */
const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const configuredBaseUrl = process.env.MCELLO_PREVIEW_URL || "";
const screenshotDir = process.env.MCELLO_ATOMIC_TOMATO_SCREENSHOT_DIR || "";

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : null;
      probe.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error("Could not reserve a local Mcello test port"));
        else resolve(port);
      });
    });
  });
}

function delay(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function waitForPreview(baseUrl, child = null, output = () => "") {
  const deadline = Date.now() + 20_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child?.exitCode != null) {
      throw new Error(`Mcello preview exited before readiness (${child.exitCode}).\n${output()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Mcello preview was not ready at ${baseUrl}: ${lastError || "timeout"}\n${output()}`);
}

async function startPreview() {
  if (configuredBaseUrl) {
    const baseUrl = configuredBaseUrl.replace(/\/$/, "");
    await waitForPreview(baseUrl);
    return { baseUrl, child: null };
  }

  const port = await reserveLoopbackPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--experimental-strip-types", "apps/mcello/server.mjs"], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  const append = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-12_000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  await waitForPreview(baseUrl, child, () => output);
  return { baseUrl, child };
}

async function stopPreview(child) {
  if (!child || child.exitCode != null) return;
  await new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      clearTimeout(finalTimer);
      resolve();
    };
    const forceTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
    const finalTimer = setTimeout(finish, 4_000);
    child.once("exit", finish);
    child.kill("SIGTERM");
  });
}

const flatbreadSlot = FLATBREAD_VISUAL.slots[0];
const flatbreadSlotTransform = `translate(${flatbreadSlot.x} ${flatbreadSlot.y}) rotate(${flatbreadSlot.rotation}) scale(${flatbreadSlot.scale})`;

const preview = await startPreview();
const baseUrl = preview.baseUrl;
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  await stopPreview(preview.child);
  throw error;
}

if (screenshotDir) await mkdir(screenshotDir, { recursive: true });

async function capture(page, name) {
  if (!screenshotDir) return;
  await page.screenshot({ path: join(screenshotDir, name), fullPage: false });
}

const MENU = {
  locationId: "atomic-tomato-browser-test",
  builderPresentation: {
    productForms: {
      "atomic-tomato-probe": "flatbread-pocket",
      "atomic-yufka-probe": "yufka-wrap",
    },
  },
  categories: [{
    id: "warm",
    slug: "warm",
    name: "Warme Spezialitäten",
    sort: 10,
    products: [{
      id: "atomic-tomato-probe",
      name: "Atomare Tomatenprobe",
      description: "Ausschließlich für den lokalen Rendering-Test.",
      basePriceCents: 800,
      orderableOnline: true,
      availableNow: true,
      soldOut: false,
      ownerConfirmed: false,
      modifierGroups: [
        {
          id: "basis",
          name: "Basis",
          minSelections: 1,
          maxSelections: 1,
          options: [
            { id: "base-meat", name: "Fleisch", priceDeltaCents: 0, defaultSelected: true, soldOut: false },
            { id: "base-falafel", name: "Falafel", priceDeltaCents: 0, defaultSelected: false, soldOut: false },
          ],
        },
        {
          id: "fresh",
          name: "Gemüse",
          minSelections: 0,
          maxSelections: 4,
          options: [
            { id: "fresh-salad", name: "Salat", priceDeltaCents: 0, defaultSelected: true, soldOut: false },
            { id: "fresh-tomato", name: "Tomate", priceDeltaCents: 0, defaultSelected: true, soldOut: false },
            { id: "fresh-cucumber", name: "Gurke", priceDeltaCents: 0, defaultSelected: true, soldOut: false },
            { id: "fresh-onion", name: "Zwiebel", priceDeltaCents: 0, defaultSelected: true, soldOut: false },
          ],
        },
        {
          id: "sauce",
          name: "Soße",
          minSelections: 0,
          maxSelections: 2,
          options: [
            { id: "sauce-curry", name: "Curry", priceDeltaCents: 0, defaultSelected: true, soldOut: false },
            { id: "sauce-garlic", name: "Knoblauch", priceDeltaCents: 0, defaultSelected: true, soldOut: false },
          ],
        },
        {
          id: "extras",
          name: "Extras",
          minSelections: 0,
          maxSelections: 2,
          options: [
            { id: "extra-tomato", name: "Extra Tomate", priceDeltaCents: 150, defaultSelected: false, soldOut: false },
          ],
        },
      ],
    }],
  }],
  productCrossSells: [],
  crossSellRules: [],
};

MENU.categories[0].products.push({
  ...MENU.categories[0].products[0],
  id: "atomic-yufka-probe",
  name: "Atomare Yufkaprobe",
});

async function openFixtureProduct(page, productId, expectedFlatbreadCount) {
  await page.route("**/api/menu*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(MENU),
  }));
  let navigationError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(`${baseUrl}/?presentation=mcello&atomicProbe=${Date.now()}#bestellen`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await page.waitForSelector(`[data-product=${JSON.stringify(productId)}]`, { timeout: 20_000 });
      navigationError = null;
      break;
    } catch (error) {
      navigationError = error;
      if (attempt === 0) await delay(150);
    }
  }
  if (navigationError) {
    throw new Error(`Atomic ingredient probe did not render from the route-local menu at ${baseUrl}: ${navigationError}`);
  }
  await page.locator(`[data-product=${JSON.stringify(productId)}]`).first().click({ force: true });
  await page.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"), null, { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-ingredient-instance="ingredient.tomato.slice"]').length === 3, null, { timeout: 15_000 });
  await page.waitForFunction((expected) => (
    document.querySelectorAll('[data-ingredient-instance="ingredient.flatbread.pocket"]').length === expected
  ), expectedFlatbreadCount, { timeout: 15_000 });
}

async function openProbe(page) {
  await openFixtureProduct(page, "atomic-tomato-probe", 1);
}

async function armTrace(page) {
  await page.evaluate(() => {
    window.__atomicTomatoObserver?.disconnect?.();
    window.__atomicTomatoTrace = { keys: [], selections: [], wholeStageOwned: false };
    const stage = document.querySelector('[data-food-stage-v4="true"]');
    const capture = () => {
      const trace = window.__atomicTomatoTrace;
      if (stage?.dataset.motionIngredientEngine === "gsap") trace.wholeStageOwned = true;
      for (const media of stage?.querySelectorAll('[data-ingredient-instance-media="ingredient.tomato.slice"]') || []) {
        if (media.dataset.motionIngredientEngine !== "gsap") continue;
        const key = media.closest("[data-ingredient-instance]")?.dataset.ingredientInstanceKey;
        if (key && !trace.keys.includes(key)) {
          trace.keys.push(key);
          trace.selections.push(media.dataset.motionSelection || null);
        }
      }
    };
    const observer = new MutationObserver(capture);
    observer.observe(stage, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-motion-ingredient-engine", "data-motion-selection", "style"],
    });
    window.__atomicTomatoObserver = observer;
    capture();
  });
}

async function rememberBaseNodes(page) {
  await page.evaluate(() => {
    window.__atomicTomatoBaseNodes = [...document.querySelectorAll('[data-ingredient-instance="ingredient.tomato.slice"]')].slice(0, 3);
  });
}

async function reachModifierGroup(page, groupId) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const target = page.locator(`#modifierGroups .builder-step[data-group-id=${JSON.stringify(groupId)}]`);
    if (await target.isVisible()) return;
    const current = page.locator('#modifierGroups .builder-step[data-builder-step-current="true"]');
    if (await current.getAttribute("data-group-id") === groupId) return;
    await page.locator("[data-builder-step-next]").click();
    await page.waitForTimeout(40);
  }
  assert.fail(`modifier group ${groupId} was not reachable through the real Builder navigation`);
}

async function baseNodesAreStable(page) {
  return page.evaluate(() => {
    const current = [...document.querySelectorAll('[data-ingredient-instance="ingredient.tomato.slice"]')].slice(0, 3);
    return window.__atomicTomatoBaseNodes?.every((node, index) => node === current[index]) || false;
  });
}

async function tomatoState(page) {
  return page.evaluate(() => {
    const wrappers = [...document.querySelectorAll('[data-ingredient-instance="ingredient.tomato.slice"]')];
    return {
      modalCount: document.querySelector("#productModal")?.dataset.tomatoInstanceCount || null,
      keys: wrappers.map((wrapper) => wrapper.dataset.ingredientInstanceKey || null),
      inactiveKeys: wrappers
        .filter((wrapper) => wrapper.dataset.instanceActive === "false" || wrapper.hasAttribute("data-exit-batch"))
        .map((wrapper) => wrapper.dataset.ingredientInstanceKey || null),
      media: wrappers.map((wrapper) => {
        const node = wrapper.querySelector('[data-ingredient-instance-media="ingredient.tomato.slice"]');
        return {
          key: wrapper.dataset.ingredientInstanceKey || null,
          style: node?.getAttribute("style") ?? null,
          svgOrigin: node?.getAttribute("data-svg-origin") ?? null,
          transformOrigin: node?.getAttribute("transform-origin") ?? null,
          engine: node?.dataset.motionIngredientEngine || null,
          motionBatch: node?.dataset.motionIngredientBatch || null,
          atomicBatch: node?.dataset.atomicIngredientBatch || null,
          fallback: node?.classList.contains("motion-ingredient-instance-change") || false,
        };
      }),
    };
  });
}

async function waitForSettledTomatoState(page, expectedCount) {
  await page.waitForFunction((count) => {
    const wrappers = [...document.querySelectorAll('[data-ingredient-instance="ingredient.tomato.slice"]')];
    if (wrappers.length !== count) return false;
    if (document.querySelector("#productModal")?.dataset.tomatoInstanceCount !== String(count)) return false;
    const keys = wrappers.map((wrapper) => wrapper.dataset.ingredientInstanceKey);
    if (keys.some((key) => !key) || new Set(keys).size !== count) return false;
    return wrappers.every((wrapper) => {
      if (wrapper.dataset.instanceActive === "false" || wrapper.hasAttribute("data-exit-batch")) return false;
      const media = wrapper.querySelector('[data-ingredient-instance-media="ingredient.tomato.slice"]');
      return media
        && !media.hasAttribute("style")
        && !media.hasAttribute("data-svg-origin")
        && !media.hasAttribute("transform-origin")
        && !media.dataset.motionIngredientEngine
        && !media.dataset.motionIngredientBatch
        && !media.dataset.atomicIngredientBatch
        && !media.classList.contains("motion-ingredient-instance-change");
    });
  }, expectedCount, { timeout: 8_000 });

  const state = await tomatoState(page);
  const expectedKeys = Array.from({ length: expectedCount }, (_, index) => `ingredient.tomato.slice:${index}`);
  assert.equal(state.modalCount, String(expectedCount));
  assert.deepEqual([...state.keys].sort(), expectedKeys);
  assert.equal(new Set(state.keys).size, expectedCount);
  assert.deepEqual(state.inactiveKeys, []);
  assert.equal(state.media.every((media) => (
    media.style === null
    && media.svgOrigin === null
    && media.transformOrigin === null
    && media.engine === null
    && media.motionBatch === null
    && media.atomicBatch === null
    && media.fallback === false
  )), true);
  return state;
}

async function extraTomatoInput(page) {
  await reachModifierGroup(page, "extras");
  return page.locator('.modifier-option[data-option-name="Extra Tomate"] input');
}

async function waitForTomatoDelta(page, selection) {
  await page.waitForFunction((direction) => [...document.querySelectorAll(
    '[data-ingredient-instance-media="ingredient.tomato.slice"]',
  )].some((media) => media.dataset.motionSelection === direction), selection, { timeout: 5_000 });
}

async function normalScenario() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => requests.push(request.url()));
    await openProbe(page);
    await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "gsap");

    const asset = await page.evaluate(async () => {
      const image = new Image();
      image.src = "/media/ingredients/ingredient.tomato.slice.png";
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context2d = canvas.getContext("2d", { willReadFrequently: true });
      context2d.drawImage(image, 0, 0);
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
        cornerAlpha: context2d.getImageData(0, 0, 1, 1).data[3],
        centerAlpha: context2d.getImageData(image.naturalWidth / 2, image.naturalHeight / 2, 1, 1).data[3],
      };
    });
    assert.deepEqual(asset, { width: 1024, height: 1024, cornerAlpha: 0, centerAlpha: 255 });

    const initial = await page.locator('[data-ingredient-instance="ingredient.tomato.slice"]').evaluateAll((nodes) => nodes.map((node) => ({
      key: node.dataset.ingredientInstanceKey,
      transform: node.getAttribute("transform"),
      href: node.querySelector("image")?.getAttribute("href"),
    })));
    assert.equal(initial.length, 3);
    assert.equal(new Set(initial.map((entry) => entry.href)).size, 1);
    assert.equal(initial[0].href, "/media/ingredients/ingredient.tomato.slice.png");
    assert.equal(initial.every((entry) => entry.transform?.includes("translate(")), true);
    await capture(page, "desktop-normal-tomato.png");

    await rememberBaseNodes(page);
    await armTrace(page);
    await reachModifierGroup(page, "extras");
    const extra = page.locator('.modifier-option[data-option-name="Extra Tomate"] input');
    await extra.check();
    await page.waitForFunction(() => document.querySelectorAll('[data-ingredient-instance="ingredient.tomato.slice"]').length === 5);
    await page.waitForFunction(() => window.__atomicTomatoTrace?.keys.length === 2);
    assert.equal(await baseNodesAreStable(page), true, "normal instances must survive Extra Tomato by identity");
    const addTrace = await page.evaluate(() => structuredClone(window.__atomicTomatoTrace));
    assert.deepEqual(addTrace.keys.sort(), ["ingredient.tomato.slice:3", "ingredient.tomato.slice:4"]);
    assert.deepEqual([...new Set(addTrace.selections)], ["added"]);
    assert.equal(addTrace.wholeStageOwned, false, "atomic delta must not animate the whole FoodStage");
    assert.equal(
      await page.locator('.modifier-option[data-option-name="Extra Tomate"]').getAttribute("data-motion-ingredient-engine"),
      null,
      "atomic GSAP ownership must stay on the added instance media only",
    );
    await page.waitForFunction(() => /9,50/.test(document.querySelector("#addToCart")?.textContent || ""));
    await capture(page, "desktop-extra-tomato.png");
    assert.match((await page.locator("#addToCart").textContent()) || "", /9,50/, "synthetic surcharge stays in the application price path");
    assert.equal(await page.locator('[data-ingredient-instance="ingredient.tomato.slice"]').nth(0).locator("image").getAttribute("style"), null);

    await page.waitForFunction(() => !document.querySelector('[data-ingredient-instance-media][data-motion-ingredient-engine]'));
    await armTrace(page);
    await extra.uncheck();
    await page.waitForFunction(() => document.querySelectorAll('[data-ingredient-instance="ingredient.tomato.slice"]').length === 3);
    await page.waitForFunction(() => window.__atomicTomatoTrace?.keys.length === 2);
    const removeTrace = await page.evaluate(() => structuredClone(window.__atomicTomatoTrace));
    assert.deepEqual(removeTrace.keys.sort(), ["ingredient.tomato.slice:3", "ingredient.tomato.slice:4"]);
    assert.deepEqual([...new Set(removeTrace.selections)], ["removed"]);
    assert.equal(removeTrace.wholeStageOwned, false);
    assert.equal(await baseNodesAreStable(page), true, "removing Extra Tomato must preserve the normal instances");
    assert.equal(await page.locator("#productModal").getAttribute("data-tomato-instance-count"), "3");
    assert.match((await page.locator(".mc-food-stage-v4__caption small").textContent()) || "", /KI-Zutatenvisualisierung/);
    assert.equal(requests.some((url) => /adobe|firefly|photoshop-api/i.test(url)), false, "browser runtime must stay Adobe-free");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

const FILLING_VISUALS = Object.freeze({
  "ingredient.meat.doner.shaving": 7,
  "ingredient.falafel.ball": 0,
  "ingredient.lettuce.iceberg.leaf": 5,
  "ingredient.tomato.slice": 3,
  "ingredient.cucumber.slice": 4,
  "ingredient.onion.ring": 3,
  "ingredient.sauce.curry.ribbon": 1,
  "ingredient.sauce.garlic.ribbon": 1,
});

async function atomicFamilyState(page) {
  return page.evaluate((expected) => Object.fromEntries(Object.keys(expected).map((assetId) => {
    const wrappers = [...document.querySelectorAll(`[data-ingredient-instance="${assetId}"]`)];
    return [assetId, {
      count: wrappers.length,
      keys: wrappers.map((wrapper) => wrapper.dataset.ingredientInstanceKey || null),
      inactive: wrappers.filter((wrapper) => (
        wrapper.dataset.instanceActive === "false" || wrapper.hasAttribute("data-exit-batch")
      )).length,
      hrefs: wrappers.map((wrapper) => wrapper.querySelector("image")?.getAttribute("href") || null),
      residue: wrappers.filter((wrapper) => {
        const media = wrapper.querySelector("[data-ingredient-instance-media]");
        return Boolean(
          media?.hasAttribute("style")
          || media?.hasAttribute("data-svg-origin")
          || media?.hasAttribute("transform-origin")
          || media?.dataset.motionIngredientEngine
          || media?.dataset.motionIngredientBatch
          || media?.dataset.atomicIngredientBatch
          || media?.classList.contains("motion-ingredient-instance-change")
        );
      }).length,
    }];
  })), FILLING_VISUALS);
}

async function assertGovernedFillingAssets(page) {
  const state = await atomicFamilyState(page);
  for (const [assetId, expectedCount] of Object.entries(FILLING_VISUALS)) {
    const expectedHref = `/media/ingredients/${assetId}.png`;
    assert.equal(state[assetId].count, expectedCount, `${assetId} must have its deterministic default count`);
    assert.equal(new Set(state[assetId].keys).size, expectedCount, `${assetId} instance keys must be unique`);
    assert.equal(state[assetId].hrefs.every((href) => href === expectedHref), true, `${assetId} must use only its governed asset URL`);
  }

  const dimensions = await page.evaluate(async (assetIds) => Object.fromEntries(await Promise.all(assetIds.map(async (assetId) => {
    const image = new Image();
    image.src = `/media/ingredients/${assetId}.png`;
    await image.decode();
    return [assetId, { width: image.naturalWidth, height: image.naturalHeight }];
  }))), Object.keys(FILLING_VISUALS));
  for (const [assetId, size] of Object.entries(dimensions)) {
    assert.deepEqual(size, { width: 1024, height: 1024 }, `${assetId} must resolve to its 1024px governed master`);
  }
}

async function fillingFamilyScenario() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await openProbe(page);
    await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "gsap");
    await page.waitForFunction((expected) => Object.entries(expected).every(([assetId, count]) => (
      document.querySelectorAll(`[data-ingredient-instance="${assetId}"]`).length === count
    )), FILLING_VISUALS);
    await assertGovernedFillingAssets(page);

    assert.equal(await page.locator('.modifier-option[data-option-name="Curry"] input').isChecked(), true);
    assert.equal(await page.locator('.modifier-option[data-option-name="Knoblauch"] input').isChecked(), true);

    await page.evaluate(() => {
      window.__atomicFillingDeltaTrace = [];
      document.addEventListener("mcello:ingredient-visual-delta", (event) => {
        window.__atomicFillingDeltaTrace.push({
          batchId: event.detail?.batchId || null,
          changes: (event.detail?.changes || []).map((change) => ({
            assetId: change.assetId,
            selection: change.selection,
            keys: change.instances.map((media) => (
              media.closest("[data-ingredient-instance]")?.dataset.ingredientInstanceKey || null
            )),
          })),
        });
      });
    });

    await reachModifierGroup(page, "basis");
    await page.locator('.modifier-option[data-option-name="Falafel"] input').check();
    await page.waitForFunction(() => window.__atomicFillingDeltaTrace?.length === 1);
    const trace = await page.evaluate(() => structuredClone(window.__atomicFillingDeltaTrace));
    assert.equal(trace.length, 1, "Fleisch -> Falafel must emit one atomic delta batch");
    assert.equal(Boolean(trace[0].batchId), true);
    assert.deepEqual(trace[0].changes.map(({ assetId, selection }) => ({ assetId, selection })), [
      { assetId: "ingredient.meat.doner.shaving", selection: "removed" },
      { assetId: "ingredient.falafel.ball", selection: "added" },
    ]);
    assert.deepEqual(trace[0].changes[0].keys.sort(), Array.from({ length: 7 }, (_, index) => `ingredient.meat.doner.shaving:${index}`));
    assert.deepEqual(trace[0].changes[1].keys.sort(), Array.from({ length: 5 }, (_, index) => `ingredient.falafel.ball:${index}`));

    await page.waitForFunction(() => (
      document.querySelectorAll('[data-ingredient-instance="ingredient.meat.doner.shaving"]').length === 0
      && document.querySelectorAll('[data-ingredient-instance="ingredient.falafel.ball"]').length === 5
      && !document.querySelector('[data-ingredient-instance][data-instance-active="false"]')
      && !document.querySelector('[data-ingredient-instance][data-exit-batch]')
      && !document.querySelector('[data-ingredient-instance-media][data-motion-ingredient-engine]')
      && !document.querySelector('[data-ingredient-instance-media][data-motion-ingredient-batch]')
      && !document.querySelector('[data-ingredient-instance-media][data-atomic-ingredient-batch]')
      && !document.querySelector('[data-ingredient-instance-media][style]')
    ), null, { timeout: 8_000 });

    const finalState = await atomicFamilyState(page);
    assert.equal(finalState["ingredient.meat.doner.shaving"].count, 0);
    assert.equal(finalState["ingredient.falafel.ball"].count, 5);
    assert.equal(finalState["ingredient.falafel.ball"].inactive, 0);
    assert.equal(finalState["ingredient.falafel.ball"].residue, 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function flatbreadProductFormScenario() {
  const flatbreadAssetPattern = /\/media\/ingredients\/ingredient\.flatbread\.pocket\.png(?:\?|$)/;
  for (const fixture of [
    { name: "desktop", viewport: { width: 1280, height: 900 } },
    { name: "phone-landscape", viewport: { width: 844, height: 390 } },
  ]) {
    const context = await browser.newContext({
      viewport: fixture.viewport,
      reducedMotion: "no-preference",
      serviceWorkers: "block",
    });
    try {
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("request", (request) => requests.push(request.url()));
      await openFixtureProduct(page, "atomic-tomato-probe", 1);
      await page.waitForFunction(() => document.querySelector(
        '[data-ingredient-instance-media="ingredient.flatbread.pocket"]',
      )?.getBoundingClientRect().width > 0);

      const state = await page.evaluate(() => {
        const stage = document.querySelector('[data-food-stage-v4="true"]');
        const instance = stage?.querySelector('[data-ingredient-instance="ingredient.flatbread.pocket"]');
        const image = instance?.querySelector("image");
        const vectorFallbacks = [...(stage?.querySelectorAll("[data-flatbread-vector-fallback]") || [])];
        const stageRect = stage?.getBoundingClientRect();
        const artRect = stage?.querySelector(".mc-food-stage-v4__art")?.getBoundingClientRect();
        return {
          form: stage?.dataset.builderProductForm || null,
          ready: stage?.dataset.flatbreadAtomicReady || null,
          count: stage?.querySelectorAll('[data-ingredient-instance="ingredient.flatbread.pocket"]').length || 0,
          href: image?.getAttribute("href") || null,
          fallbackDisplays: vectorFallbacks.map((node) => getComputedStyle(node).display),
          instanceTransform: instance?.getAttribute("transform") || null,
          stageWidth: stageRect?.width || 0,
          artWidth: artRect?.width || 0,
          artHeight: artRect?.height || 0,
        };
      });
      assert.equal(state.form, "flatbread-pocket");
      assert.equal(state.ready, "true");
      assert.equal(state.count, 1);
      assert.equal(state.href, "/media/ingredients/ingredient.flatbread.pocket.png");
      assert.deepEqual(state.fallbackDisplays, ["none", "none"]);
      // The governed slot -- not a magic literal -- is what must drive the instance.
      // Pinning the registry value keeps the determinism guard while D076 retunes the stage geometry.
      assert.equal(state.instanceTransform, flatbreadSlotTransform);
      assert.equal(state.artWidth <= state.stageWidth, true, `${fixture.name} art must fit the stage width`);
      assert.equal(state.artHeight > 0, true);
      assert.equal(requests.filter((url) => flatbreadAssetPattern.test(url)).length, 1);
      assert.deepEqual(errors, []);
      await capture(page, `${fixture.name}-flatbread-pocket.png`);
    } finally {
      await context.close();
    }
  }

  const yufkaContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    const page = await yufkaContext.newPage();
    const requests = [];
    const errors = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("pageerror", (error) => errors.push(String(error)));
    await openFixtureProduct(page, "atomic-yufka-probe", 0);
    const state = await page.evaluate(() => {
      const stage = document.querySelector('[data-food-stage-v4="true"]');
      return {
        form: stage?.dataset.builderProductForm || null,
        ready: stage?.dataset.flatbreadAtomicReady || null,
        count: stage?.querySelectorAll('[data-ingredient-instance="ingredient.flatbread.pocket"]').length || 0,
        fallbackDisplays: [...(stage?.querySelectorAll("[data-flatbread-vector-fallback]") || [])]
          .map((node) => getComputedStyle(node).display),
      };
    });
    assert.equal(state.form, "yufka-wrap");
    assert.equal(state.ready, "false");
    assert.equal(state.count, 0);
    assert.deepEqual(state.fallbackDisplays, ["inline", "inline"]);
    assert.equal(requests.some((url) => flatbreadAssetPattern.test(url)), false);
    assert.deepEqual(errors, []);
    await capture(page, "desktop-yufka-wrap-vector-vessel.png");
  } finally {
    await yufkaContext.close();
  }
}

async function reducedScenario() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await openProbe(page);
    await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "reduced");
    await rememberBaseNodes(page);
    await page.locator('.modifier-option[data-option-name="Extra Tomate"] input').evaluate((input) => {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-ingredient-instance="ingredient.tomato.slice"]').length === 5);
    await capture(page, "phone-extra-tomato-reduced-motion.png");
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector("#productModal")?.dataset.builderOrientation === "landscape");
    await capture(page, "phone-landscape-extra-tomato-reduced-motion.png");
    assert.equal(await baseNodesAreStable(page), true);
    assert.equal(await page.locator('script[data-mcello-gsap-vendor]').count(), 0);
    const motionState = await page.locator('[data-ingredient-instance-media="ingredient.tomato.slice"]').evaluateAll((nodes) => nodes.map((node) => ({
      owner: node.dataset.motionIngredientEngine || null,
      fallback: node.classList.contains("motion-ingredient-instance-change"),
      style: node.getAttribute("style"),
    })));
    assert.equal(motionState.every((entry) => !entry.owner && !entry.fallback && !entry.style), true);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function rapidCycleScenario() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await openProbe(page);
    await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "gsap");
    await rememberBaseNodes(page);
    const extra = await extraTomatoInput(page);

    // Add -> Remove before the entrance timeline can complete.
    await extra.check();
    await waitForTomatoDelta(page, "added");
    await extra.uncheck();
    await waitForSettledTomatoState(page, 3);
    assert.equal(await baseNodesAreStable(page), true, "fast Add -> Remove must preserve the three base nodes");

    // Establish the five-instance state, then interrupt its exit with re-entry.
    await extra.check();
    await waitForSettledTomatoState(page, 5);
    assert.equal(await baseNodesAreStable(page), true);
    await extra.uncheck();
    await waitForTomatoDelta(page, "removed");
    await extra.check();
    await waitForSettledTomatoState(page, 5);
    assert.equal(await baseNodesAreStable(page), true, "fast Remove -> Add must reactivate stable nodes without stale exits");

    await extra.uncheck();
    await waitForSettledTomatoState(page, 3);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function liveReducedMotionScenario() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await openProbe(page);
    await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "gsap");
    const extra = await extraTomatoInput(page);

    await extra.check();
    await page.waitForFunction(() => document.querySelector(
      '[data-ingredient-instance-media="ingredient.tomato.slice"][data-motion-ingredient-engine="gsap"]',
    ));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "reduced");
    await waitForSettledTomatoState(page, 5);

    // Returning to no-preference must not permanently disable later batches.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "gsap");
    await extra.uncheck();
    await page.waitForFunction(() => document.querySelector(
      '[data-ingredient-instance-media="ingredient.tomato.slice"][data-motion-ingredient-engine="gsap"]',
    ));
    await waitForSettledTomatoState(page, 3);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function modalCloseDuringBatchScenario() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await openProbe(page);
    await page.waitForFunction(() => document.documentElement.dataset.mcelloIngredientEngine === "gsap");
    const extra = await extraTomatoInput(page);

    await extra.check();
    await page.waitForFunction(() => document.querySelector(
      '[data-ingredient-instance-media="ingredient.tomato.slice"][data-motion-ingredient-engine="gsap"]',
    ));
    await page.evaluate(() => {
      window.__closingTomatoMedia = [...document.querySelectorAll(
        '[data-ingredient-instance-media="ingredient.tomato.slice"]',
      )];
    });
    await page.locator("[data-close-modal]").click();
    await page.waitForFunction(() => !document.querySelector("#productModal")?.classList.contains("open"));
    await page.waitForFunction(() => window.__closingTomatoMedia?.every((media) => (
      !media.isConnected
      && !media.hasAttribute("style")
      && !media.hasAttribute("data-svg-origin")
      && !media.hasAttribute("transform-origin")
      && !media.dataset.motionIngredientEngine
      && !media.dataset.motionIngredientBatch
      && !media.dataset.atomicIngredientBatch
      && !media.classList.contains("motion-ingredient-instance-change")
    )), null, { timeout: 8_000 });
    assert.equal(await page.locator('[data-food-stage-v4="true"]').count(), 0);

    await page.locator('[data-product="atomic-tomato-probe"]').first().click({ force: true });
    await page.waitForFunction(() => document.querySelector("#productModal")?.classList.contains("open"));
    await waitForSettledTomatoState(page, 3);
    const detachedKeys = await page.evaluate(() => window.__closingTomatoMedia.map((media) => (
      media.closest("[data-ingredient-instance]")?.dataset.ingredientInstanceKey || null
    )));
    assert.equal(new Set(detachedKeys).size, 5, "closed-batch references must remain unambiguous after cleanup");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

try {
  await normalScenario();
  await fillingFamilyScenario();
  await flatbreadProductFormScenario();
  await reducedScenario();
  await rapidCycleScenario();
  await liveReducedMotionScenario();
  await modalCloseDuringBatchScenario();
  console.log("Atomic ingredients verified: governed filling assets, meat→falafel delta batch, deterministic tomato 3↔5, Reduced Motion and modal cleanup.");
} finally {
  await browser.close();
  await stopPreview(preview.child);
}
