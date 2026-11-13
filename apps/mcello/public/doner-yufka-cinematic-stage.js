const modal = document.querySelector("#productModal");
const foodStageImage = document.querySelector("#modalImage");
const groupsRoot = document.querySelector("#modifierGroups");

// The current Pide assets are valid only for Fladenbrot variants. Yufka has a different wrap geometry and is deliberately excluded until its own assets exist.
const PRODUCT_IDS = new Set(["warm-013", "warm-014", "warm-015"]);
const GROUP_ROLES = new Map([
  ["basis", "basis"], ["fleisch", "basis"], ["herz", "basis"],
  ["gemüse", "fresh"], ["gemuese", "fresh"], ["frisches", "fresh"], ["salate", "fresh"],
  ["soße", "sauce"], ["sosse", "sauce"], ["saucen", "sauce"], ["soßen", "sauce"],
]);

const LAYERS = [
  { id: "upper-pide", file: "upper-pide.webp", label: "Oberes Pide", fixed: true, z: 9, exploded: -250, assembled: -120, mobileExploded: -125, mobileAssembled: -62 },
  { id: "red-onion", file: "red-onion.webp", label: "Rote Zwiebel", z: 8, exploded: -188, assembled: -90, mobileExploded: -94, mobileAssembled: -47 },
  { id: "tomato", file: "tomato.webp", label: "Tomate", z: 7, exploded: -125, assembled: -60, mobileExploded: -63, mobileAssembled: -31 },
  { id: "cucumber", file: "cucumber.webp", label: "Gurke", z: 6, exploded: -63, assembled: -30, mobileExploded: -31, mobileAssembled: -15 },
  { id: "lettuce", file: "iceberg-lettuce.webp", label: "Eisbergsalat", z: 5, exploded: 0, assembled: 0, mobileExploded: 0, mobileAssembled: 0 },
  { id: "veal", file: "veal-doner.webp", label: "Kalbsdöner", z: 4, exploded: 63, assembled: 30, mobileExploded: 31, mobileAssembled: 15 },
  { id: "spicy-sauce", file: "spicy-sauce.webp", label: "Scharfe Sauce", z: 3, exploded: 125, assembled: 60, mobileExploded: 63, mobileAssembled: 31 },
  { id: "garlic-sauce", file: "garlic-sauce.webp", label: "Knoblauchsauce", z: 2, exploded: 188, assembled: 90, mobileExploded: 94, mobileAssembled: 47 },
  { id: "lower-pide", file: "lower-pide.webp", label: "Unteres Pide", fixed: true, z: 1, exploded: 250, assembled: 120, mobileExploded: 125, mobileAssembled: 62 },
];

const OPTION_TO_LAYER = new Map([
  ["fleisch", "veal"], ["kalb", "veal"], ["kalbsdöner", "veal"], ["drehspieß", "veal"],
  ["salat", "lettuce"],
  ["tomate", "tomato"], ["tomaten", "tomato"],
  ["gurke", "cucumber"], ["gurken", "cucumber"],
  ["zwiebel", "red-onion"], ["zwiebeln", "red-onion"],
  ["knoblauch", "garlic-sauce"], ["scharf", "spicy-sauce"],
  ["falafel", "missing-falafel"], ["curry", "missing-curry"],
]);

const MISSING_LABELS = new Map([
  ["missing-falafel", "Falafel"],
  ["missing-curry", "Curry"],
]);
const LAYER_BY_ID = new Map(LAYERS.map((layer) => [layer.id, layer]));
let stageRoot = null;

function normalize(value) {
  return String(value || "").trim().toLocaleLowerCase("de");
}

function optionName(label) {
  return label?.dataset.optionName
    || label?.querySelector("span")?.textContent?.replace(/ · ausverkauft$/i, "")?.trim()
    || "";
}

function groupName(group) {
  return group?.dataset.groupName
    || group?.querySelector(".modifier-head strong")?.textContent?.trim()
    || "";
}

function layerFor(label) {
  return OPTION_TO_LAYER.get(normalize(optionName(label))) || null;
}

function presentationGroupMap() {
  if (!groupsRoot || normalize(modal?.dataset.categorySlug) === "pizza") return null;
  const resolved = new Map();
  for (const group of groupsRoot.querySelectorAll(".modifier-group")) {
    const role = GROUP_ROLES.get(normalize(groupName(group)));
    if (!role || resolved.has(role)) continue;
    if (![...group.querySelectorAll(".modifier-option")].some(layerFor)) continue;
    resolved.set(role, group);
  }
  return resolved.size ? resolved : null;
}

function selectedLayers(groupMap) {
  const selected = new Set();
  for (const group of groupMap.values()) {
    for (const label of group.querySelectorAll(".modifier-option")) {
      const input = label.querySelector("input");
      const layer = layerFor(label);
      if (layer && input?.checked) selected.add(layer);
    }
  }
  return selected;
}

function stageMarkup() {
  const images = LAYERS.map((layer) => {
    const fixed = layer.fixed ? "true" : "false";
    return `<img class="mc-food-stage-v5__layer" data-food-layer="${layer.id}" data-fixed="${fixed}" data-active="${fixed}" aria-hidden="true" alt="" draggable="false" loading="eager" decoding="async" src="/media/concept/doner-v2/${layer.file}" style="--layer-z:${layer.z};--explode-offset:${layer.exploded}px;--assembled-offset:${layer.assembled}px;--mobile-explode-offset:${layer.mobileExploded}px;--mobile-assembled-offset:${layer.mobileAssembled}px" />`;
  }).join("");
  return `
    <div class="mc-food-stage-v5__layers" aria-hidden="true">${images}</div>
    <button class="mc-food-stage-v5__toggle" type="button" data-food-stage-toggle aria-pressed="false">Zusammenbauen</button>
    <div class="mc-food-stage-v5__caption">
      <span class="mc-food-stage-v5__eyebrow">MCELLO · FOODSTAGE</span>
      <strong data-food-stage-summary aria-live="polite">Dein Döner</strong>
      <small data-food-stage-missing></small>
      <small class="mc-food-stage-v5__disclaimer">KI-Konzeptvisualisierung · keine bestätigte Produktfotografie</small>
    </div>`;
}

function ensureStage() {
  if (stageRoot?.isConnected) return stageRoot;
  if (!foodStageImage?.parentElement) return null;
  stageRoot = document.createElement("section");
  stageRoot.className = "mc-food-stage-v5";
  stageRoot.dataset.foodStageV4 = "true";
  stageRoot.dataset.view = window.matchMedia?.("(max-width: 820px)")?.matches ? "assembled" : "exploded";
  stageRoot.setAttribute("role", "region");
  stageRoot.setAttribute("aria-label", "Interaktive Döner-Konzeptvorschau");
  stageRoot.innerHTML = stageMarkup();
  foodStageImage.before(stageRoot);
  stageRoot.querySelector("[data-food-stage-toggle]")?.addEventListener("click", () => {
    const next = stageRoot.dataset.view === "exploded" ? "assembled" : "exploded";
    stageRoot.dataset.view = next;
    modal.dataset.foodStageView = next;
    const button = stageRoot.querySelector("[data-food-stage-toggle]");
    button.textContent = next === "exploded" ? "Zusammenbauen" : "Explodieren";
    button.setAttribute("aria-pressed", String(next === "exploded"));
  });
  const initialView = stageRoot.dataset.view;
  const toggle = stageRoot.querySelector("[data-food-stage-toggle]");
  toggle.textContent = initialView === "exploded" ? "Zusammenbauen" : "Explodieren";
  toggle.setAttribute("aria-pressed", String(initialView === "exploded"));
  return stageRoot;
}

function setImageVisibility(active) {
  if (!foodStageImage) return;
  foodStageImage.hidden = active;
  if (active) {
    foodStageImage.setAttribute("aria-hidden", "true");
    foodStageImage.removeAttribute("data-builder-food-stage");
    stageRoot?.setAttribute("data-builder-food-stage", "true");
  } else {
    foodStageImage.removeAttribute("aria-hidden");
    foodStageImage.setAttribute("data-builder-food-stage", "true");
  }
}

function updateStage(groupMap) {
  const root = ensureStage();
  if (!root) return false;
  const selected = selectedLayers(groupMap);
  for (const layer of LAYERS) {
    const node = root.querySelector(`[data-food-layer="${layer.id}"]`);
    const active = Boolean(layer.fixed || selected.has(layer.id));
    node.dataset.active = String(active);
  }

  const visible = [...selected].filter((id) => LAYER_BY_ID.has(id)).map((id) => LAYER_BY_ID.get(id).label);
  const missing = [...selected].filter((id) => MISSING_LABELS.has(id)).map((id) => MISSING_LABELS.get(id));
  const summary = visible.length ? visible.join(" · ") : "Wähle deine Zutaten";
  root.querySelector("[data-food-stage-summary]").textContent = summary;
  root.querySelector("[data-food-stage-missing]").textContent = missing.length ? `Visual folgt für: ${missing.join(" · ")}` : "";
  root.setAttribute("aria-label", `Döner-Konzeptvorschau. ${summary}.`);
  modal.dataset.assemblyVisualLayers = String(visible.length);
  modal.dataset.assemblyPresentation = "true";
  return true;
}

function clearStage() {
  if (!modal) return;
  delete modal.dataset.productBuilder;
  delete modal.dataset.foodStageView;
  delete modal.dataset.assemblyVisualLayers;
  delete modal.dataset.assemblyPresentation;
  setImageVisibility(false);
  stageRoot?.remove();
  stageRoot = null;
}

function applyStage() {
  const groupMap = modal?.classList.contains("open")
    && modal.dataset.productBuilder === "doner-yufka"
    && PRODUCT_IDS.has(modal.dataset.productId)
    ? presentationGroupMap()
    : null;
  if (!groupMap) return false;
  ensureStage();
  setImageVisibility(true);
  return updateStage(groupMap);
}

// Mark the intended presentation before app.js opens the modal. This also lets the
// Döner stage opt into portrait layout without changing the commerce controller.
document.addEventListener("click", (event) => {
  if (!modal) return;
  const target = event.target instanceof Element ? event.target : null;
  const trigger = target?.closest("[data-product], [data-recommended-product]");
  if (!trigger || trigger.matches(":disabled")) return;
  const productId = trigger.dataset.product || trigger.dataset.recommendedProduct;
  if (PRODUCT_IDS.has(productId)) modal.dataset.productBuilder = "doner-yufka";
  else delete modal.dataset.productBuilder;
}, true);

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const trigger = target?.closest("[data-product], [data-recommended-product]");
  if (!trigger || trigger.matches(":disabled")) return;
  queueMicrotask(() => {
    if (!applyStage()) clearStage();
  });
});

groupsRoot?.addEventListener("change", () => {
  if (modal?.dataset.productBuilder === "doner-yufka") queueMicrotask(() => {
    const groupMap = presentationGroupMap();
    if (groupMap) updateStage(groupMap);
  });
});

if (groupsRoot) {
  new MutationObserver(() => {
    if (modal?.classList.contains("open") && modal.dataset.productBuilder === "doner-yufka") applyStage();
  }).observe(groupsRoot, { childList: true, subtree: true });
}

if (modal) {
  new MutationObserver(() => {
    if (modal.classList.contains("open")) {
      if (!applyStage()) clearStage();
      return;
    }
    clearStage();
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });
}
