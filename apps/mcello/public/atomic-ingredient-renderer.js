import {
  ATOMIC_INGREDIENT_VISUALS,
  atomicInstanceContribution,
  atomicInstanceCount,
  atomicInstanceKey,
  atomicInstancePlan,
} from "./ingredient-visuals.js";

const SVG_NS = "http://www.w3.org/2000/svg";
let batchSequence = 0;

function nextBatchId() {
  batchSequence += 1;
  return `atomic-ingredient-batch-${batchSequence}`;
}

function hostsByAssetId(root) {
  return new Map([...root.querySelectorAll("[data-atomic-ingredient-host]")]
    .map((host) => [host.dataset.atomicIngredientHost, host]));
}

function createInstance(visual, index) {
  const slot = visual.slots[index];
  const key = atomicInstanceKey(visual.assetId, index);
  const wrapper = document.createElementNS(SVG_NS, "g");
  wrapper.classList.add("mc-ingredient-instance", `mc-ingredient-instance--${visual.classToken}`);
  wrapper.dataset.ingredientInstance = visual.assetId;
  wrapper.dataset.ingredientInstanceKey = key;
  wrapper.dataset.instanceActive = "true";
  wrapper.setAttribute("transform", `translate(${slot.x} ${slot.y}) rotate(${slot.rotation}) scale(${slot.scale})`);
  wrapper.setAttribute("aria-hidden", "true");

  const image = document.createElementNS(SVG_NS, "image");
  const half = visual.instanceSize / 2;
  image.classList.add("mc-ingredient-instance__media");
  image.dataset.ingredientInstanceMedia = visual.assetId;
  image.setAttribute("href", visual.assetUrl);
  image.setAttribute("x", String(-half));
  image.setAttribute("y", String(-half));
  image.setAttribute("width", String(visual.instanceSize));
  image.setAttribute("height", String(visual.instanceSize));
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  wrapper.appendChild(image);
  return wrapper;
}

function settleMediaForBatch(media, batchId) {
  if (media.dataset.atomicIngredientBatch !== batchId) return;
  media.classList.remove("motion-ingredient-instance-change");
  delete media.dataset.atomicIngredientBatch;
  delete media.dataset.motionSelection;
  delete media.dataset.motionIngredientEngine;
}

export function shouldRemoveAtomicExit(wrapper, batchId) {
  return wrapper?.dataset.instanceActive === "false" && wrapper.dataset.exitBatch === batchId;
}

function createBatchSettlement(batchId, changes) {
  let settled = false;
  return () => {
    if (settled) return;
    settled = true;
    for (const change of changes) {
      for (const media of change.instances) {
        const wrapper = media.closest("[data-ingredient-instance]");
        settleMediaForBatch(media, batchId);
        if (shouldRemoveAtomicExit(wrapper, batchId)) wrapper.remove();
      }
    }
  };
}

function reconcileVisual(host, visual, selectedNames, productForm, batchId) {
  const existing = new Map([...host.querySelectorAll("[data-ingredient-instance]")]
    .map((node) => [node.dataset.ingredientInstanceKey, node]));
  const desiredCount = atomicInstanceCount(visual, selectedNames, productForm);
  // Only replace this host's legacy vector when the selected presentation input
  // actually resolves to a governed master. This keeps an unmatched future
  // option (for example Pute) visible without mislabelling the Kalb asset.
  host.dataset.atomicRuntimeReady = desiredCount > 0 ? "true" : "false";
  const plan = atomicInstancePlan(visual, existing.keys(), desiredCount);
  const added = [];
  const removed = [];

  for (const [index, key] of plan.desiredKeys.entries()) {
    let wrapper = existing.get(key);
    if (!wrapper) {
      wrapper = createInstance(visual, index);
      host.appendChild(wrapper);
      added.push(wrapper.querySelector("[data-ingredient-instance-media]"));
    } else if (wrapper.dataset.instanceActive === "false") {
      added.push(wrapper.querySelector("[data-ingredient-instance-media]"));
    }
    wrapper.dataset.instanceActive = "true";
    delete wrapper.dataset.exitBatch;
  }

  for (const key of plan.removedKeys) {
    const wrapper = existing.get(key);
    if (!wrapper || wrapper.dataset.instanceActive === "false") continue;
    wrapper.dataset.instanceActive = "false";
    wrapper.dataset.exitBatch = batchId;
    removed.push(wrapper.querySelector("[data-ingredient-instance-media]"));
  }

  const changes = [];
  const appendChange = (selection, instances) => {
    const present = instances.filter(Boolean);
    if (!present.length) return;
    for (const media of present) {
      media.dataset.atomicIngredientBatch = batchId;
      media.dataset.motionSelection = selection;
    }
    changes.push({ assetId: visual.assetId, selection, instances: present });
  };
  appendChange("removed", removed);
  appendChange("added", added);
  return { changes, desiredCount };
}

/*
 * Reconciles every runtime-ready family in one pass and emits at most one batch
 * event. optionLabels must come from the presentation adapter's accepted group
 * map; the renderer never scans global modifier DOM on its own.
 */
export function reconcileAtomicIngredients({
  root,
  optionLabels,
  optionName,
  productForm = "",
  registry = ATOMIC_INGREDIENT_VISUALS,
}) {
  if (!root) return { batchId: null, changes: [], counts: new Map() };
  const labels = [...optionLabels];
  const hosts = hostsByAssetId(root);
  const renderable = registry.filter((visual) => (
    visual.runtimeReady === true
    && Boolean(visual.assetUrl)
    && hosts.has(visual.assetId)
  ));

  for (const label of labels) {
    const matching = renderable.find((visual) => atomicInstanceContribution(visual, optionName(label)) > 0);
    if (matching) label.dataset.atomicIngredient = matching.assetId;
    else if (label.dataset.atomicIngredient) delete label.dataset.atomicIngredient;
  }

  const batchId = nextBatchId();
  const changes = [];
  const counts = new Map();
  for (const visual of renderable) {
    const selectedNames = labels
      .filter((label) => label.querySelector("input")?.checked)
      .map(optionName);
    const result = reconcileVisual(hosts.get(visual.assetId), visual, selectedNames, productForm, batchId);
    changes.push(...result.changes);
    counts.set(visual.assetId, result.desiredCount);
  }

  const wasInitialized = root.dataset.atomicIngredientRenderer === "ready";
  root.dataset.atomicIngredientRenderer = "ready";
  if (!changes.length) return { batchId, changes, counts };

  const settle = createBatchSettlement(batchId, changes);
  if (!wasInitialized) {
    settle();
    return { batchId, changes, counts, settle };
  }

  const detail = { batchId, changes, settle };
  // Single-change aliases keep the initial Tomato motion adapter compatible.
  if (changes.length === 1) Object.assign(detail, changes[0]);
  const deltaEvent = new CustomEvent("mcello:ingredient-visual-delta", {
    bubbles: true,
    cancelable: true,
    detail,
  });
  root.dispatchEvent(deltaEvent);
  if (!deltaEvent.defaultPrevented) settle();
  return { batchId, changes, counts, settle };
}
