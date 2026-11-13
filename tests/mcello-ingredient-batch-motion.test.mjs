import assert from "node:assert/strict";
import test from "node:test";

import { createCommerceMotion } from "../apps/mcello/public/motion/commerce.js";

function createInstance() {
  const attributes = new Map([
    ["style", "opacity: 0.5; transform-origin: 10px 10px;"],
    ["data-svg-origin", "10 10"],
    ["transform-origin", "10px 10px"],
  ]);
  const classes = new Set(["motion-ingredient-instance-change"]);
  return {
    attributes,
    dataset: {},
    style: {
      removeProperty(name) {
        const style = attributes.get("style") || "";
        const next = style
          .split(";")
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .filter((declaration) => !declaration.startsWith(`${name}:`))
          .join("; ");
        attributes.set("style", next);
      },
    },
    classList: {
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    getAttribute(name) { return attributes.get(name) ?? null; },
    removeAttribute(name) { attributes.delete(name); },
  };
}

function createHarness() {
  const timelines = [];
  const sets = [];
  const gsap = {
    killTweensOf() {},
    set(node, values) { sets.push({ node, values }); },
    timeline(options) {
      const timeline = {
        options,
        calls: [],
        killed: 0,
        kill() { this.killed += 1; },
        fromTo(...args) { this.calls.push({ method: "fromTo", args }); return this; },
        to(...args) { this.calls.push({ method: "to", args }); return this; },
        set(...args) { this.calls.push({ method: "set", args }); return this; },
      };
      timelines.push(timeline);
      return timeline;
    },
    fromTo() { return null; },
  };
  const scope = {
    context(callback) { callback({ gsap }); },
    cleanup() {},
  };
  const engine = {
    available: true,
    createScope() { return scope; },
  };
  const previousDocument = globalThis.document;
  globalThis.document = {};
  const adapter = createCommerceMotion(engine);
  globalThis.document = previousDocument;
  return { adapter, timelines, sets };
}

test("GSAP ingredient batches animate add and remove directions in one timeline", () => {
  const { adapter, timelines } = createHarness();
  const added = createInstance();
  const removed = createInstance();
  let settled = 0;

  assert.equal(adapter.animateIngredientBatch({
    changes: [
      { assetId: "ingredient.falafel.layer", selection: "added", instances: [added] },
      { assetId: "ingredient.meat.doner.layer", selection: "removed", instances: [removed] },
    ],
    settle: () => { settled += 1; },
  }), true);

  assert.equal(timelines.length, 1);
  assert.deepEqual(timelines[0].calls.map((call) => call.method), ["fromTo", "to"]);
  assert.equal(added.dataset.motionSelection, "added");
  assert.equal(removed.dataset.motionSelection, "removed");

  timelines[0].options.onComplete();
  timelines[0].options.onComplete();
  assert.equal(settled, 1);
  assert.equal(added.dataset.motionIngredientBatch, undefined);
  assert.equal(removed.dataset.motionIngredientBatch, undefined);
});

test("overlapping ingredient batches settle the old transaction and remove SVG residue", () => {
  const { adapter, timelines, sets } = createHarness();
  const exiting = createInstance();
  const returning = createInstance();
  let firstSettled = 0;
  let secondSettled = 0;

  adapter.animateIngredientBatch({
    changes: [{ assetId: "ingredient.tomato.layer", selection: "removed", instances: [exiting] }],
    settle: () => { firstSettled += 1; },
  });
  adapter.animateIngredientBatch({
    changes: [{ assetId: "ingredient.tomato.layer", selection: "added", instances: [returning] }],
    settle: () => { secondSettled += 1; },
  });

  assert.equal(timelines[0].killed, 1);
  assert.equal(firstSettled, 1);
  assert.equal(secondSettled, 0);
  assert.equal(exiting.attributes.has("data-svg-origin"), false);
  assert.equal(exiting.attributes.has("transform-origin"), false);
  assert.equal(exiting.attributes.has("style"), false);
  assert.ok(sets.some(({ values }) => values.clearProps === "opacity,transform,transformOrigin"));

  adapter.settleIngredientBatches();
  adapter.settleIngredientBatches();
  assert.equal(timelines[1].killed, 1);
  assert.equal(secondSettled, 1);
});

test("non-overlapping ingredient batches remain independent until explicitly settled", () => {
  const { adapter, timelines } = createHarness();
  let settled = 0;
  adapter.animateIngredientBatch({
    changes: [{ assetId: "ingredient.onion.layer", selection: "added", instances: [createInstance()] }],
    settle: () => { settled += 1; },
  });
  adapter.animateIngredientBatch({
    changes: [{ assetId: "ingredient.sauce.garlic.layer", selection: "added", instances: [createInstance()] }],
    settle: () => { settled += 1; },
  });

  assert.deepEqual(timelines.map((timeline) => timeline.killed), [0, 0]);
  adapter.settleIngredientBatches();
  assert.deepEqual(timelines.map((timeline) => timeline.killed), [1, 1]);
  assert.equal(settled, 2);
});
