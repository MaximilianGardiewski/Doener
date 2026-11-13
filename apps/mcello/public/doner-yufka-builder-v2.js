const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/doner-yufka-builder-v2.css";
stylesheet.dataset.mcelloDonerYufkaBuilder = "true";
document.head.appendChild(stylesheet);

const modal = document.querySelector("#productModal");
const foodStageImage = document.querySelector("#modalImage");
const groupsRoot = document.querySelector("#modifierGroups");

const PRODUCT_IDS = new Set(["warm-013", "warm-014", "warm-015"]);
const GROUP_ROLES = new Map([
  ["basis", "basis"], ["fleisch", "basis"], ["herz", "basis"],
  ["gemüse", "fresh"], ["gemuese", "fresh"], ["frisches", "fresh"], ["salate", "fresh"],
  ["soße", "sauce"], ["sosse", "sauce"], ["saucen", "sauce"], ["soßen", "sauce"],
]);
const LAYER_TOKENS = new Map([
  ["fleisch", "veal"], ["kalb", "veal"], ["kalbsdöner", "veal"], ["drehspieß", "veal"],
  ["falafel", "missing-falafel"],
  ["salat", "iceberg-lettuce"], ["tomate", "tomato"], ["tomaten", "tomato"],
  ["gurke", "cucumber"], ["gurken", "cucumber"], ["zwiebel", "red-onion"], ["zwiebeln", "red-onion"],
  ["curry", "missing-curry"], ["knoblauch", "garlic-sauce"], ["scharf", "spicy-sauce"],
]);
const STAGE_LAYERS = [
  { id: "upper-pide", file: "upper-pide.webp", label: "Oberes Pide", fixed: true, z: 9, exploded: -245, assembled: -115, mobileExploded: -126, mobileAssembled: -60 },
  { id: "red-onion", file: "red-onion.webp", label: "Rote Zwiebel", side: "right", z: 8, exploded: -184, assembled: -86, mobileExploded: -94, mobileAssembled: -45 },
  { id: "tomato", file: "tomato.webp", label: "Tomate", side: "left", z: 7, exploded: -122, assembled: -57, mobileExploded: -63, mobileAssembled: -30 },
  { id: "cucumber", file: "cucumber.webp", label: "Gurke", side: "right", z: 6, exploded: -61, assembled: -28, mobileExploded: -31, mobileAssembled: -15 },
  { id: "iceberg-lettuce", file: "iceberg-lettuce.webp", label: "Eisbergsalat", side: "left", z: 5, exploded: 0, assembled: 0, mobileExploded: 0, mobileAssembled: 0 },
  { id: "veal", file: "veal-doner.webp", label: "Drehspieß-Fleisch", side: "right", z: 4, exploded: 61, assembled: 28, mobileExploded: 31, mobileAssembled: 15 },
  { id: "spicy-sauce", file: "spicy-sauce.webp", label: "Scharfe Sauce", side: "left", z: 3, exploded: 122, assembled: 57, mobileExploded: 63, mobileAssembled: 30 },
  { id: "garlic-sauce", file: "garlic-sauce.webp", label: "Knoblauchsauce", side: "right", z: 2, exploded: 184, assembled: 86, mobileExploded: 94, mobileAssembled: 45 },
  { id: "lower-pide", file: "lower-pide.webp", label: "Unteres Pide", fixed: true, z: 1, exploded: 245, assembled: 115, mobileExploded: 126, mobileAssembled: 60 },
];
const VISUAL_LAYER_IDS = STAGE_LAYERS.filter((layer) => !layer.fixed).map((layer) => layer.id);
const LAYER_BY_ID = new Map(STAGE_LAYERS.map((layer) => [layer.id, layer]));
const MISSING_LABELS = new Map([["missing-falafel", "Falafel"], ["missing-curry", "Curry"]]);
const FOREIGN_STAGE_CATEGORIES = new Set(["pizza"]);
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
  return group?.dataset.groupName || group?.querySelector(".modifier-head strong")?.textContent?.trim() || "";
}

function layerFor(label) {
  return LAYER_TOKENS.get(normalize(optionName(label))) || null;
}

function presentationGroupMap() {
  if (!groupsRoot || FOREIGN_STAGE_CATEGORIES.has(normalize(modal?.dataset.categorySlug))) return null;
  const resolved = new Map();
  for (const group of groupsRoot.querySelectorAll(".modifier-group")) {
    const role = GROUP_ROLES.get(normalize(groupName(group)));
    if (!role || resolved.has(role)) continue;
    const layers = [...group.querySelectorAll(".modifier-option")].filter(layerFor);
    if (layers.length) resolved.set(role, group);
  }
  return resolved.size ? resolved : null;
}

function selectedNames(groupMap) {
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
  const images = STAGE_LAYERS.map((layer) => {
    const fixed = layer.fixed ? "true" : "false";
    return '<img class="mc-food-stage-v4__layer mc-food-layer" data-food-layer="' + layer.id
      + '" data-fixed="' + fixed + '" data-active="' + fixed
      + '" aria-hidden="true" alt="" draggable="false" loading="eager" decoding="async" src="/media/concept/doner-v2/' + layer.file
      + '" style="--layer-z:' + layer.z + ';--explode-offset:' + layer.exploded + 'px;--assembled-offset:' + layer.assembled
      + 'px;--mobile-explode-offset:' + layer.mobileExploded + 'px;--mobile-assembled-offset:' + layer.mobileAssembled + 'px" />';
  }).join("");
  const callouts = STAGE_LAYERS.filter((layer) => !layer.fixed).map((layer) => {
    return '<span class="mc-food-stage-v4__callout" data-food-callout-for="' + layer.id
      + '" data-active="false" data-side="' + layer.side + '" aria-hidden="true" style="--explode-offset:' + layer.exploded
      + 'px;--assembled-offset:' + layer.assembled + 'px;--mobile-explode-offset:' + layer.mobileExploded
      + 'px;--mobile-assembled-offset:' + layer.mobileAssembled + 'px">' + layer.label + '</span>';
  }).join("");
  return '<div class="mc-food-stage-v4__layers" aria-hidden="true">' + images + '</div>'
    + '<div class="mc-food-stage-v4__callouts" aria-hidden="true">' + callouts + '</div>'
    + '<button class="mc-food-stage-v4__toggle" type="button" data-food-stage-toggle aria-pressed="false">Zusammenbauen</button>'
    + '<div class="mc-food-stage-v4__caption"><span>MCELLO · PIDE DÖNER</span>'
    + '<strong data-food-stage-summary aria-live="polite">Wähle deine Zutaten</strong>'
    + '<small data-food-stage-missing></small>'
    + '<small class="mc-food-stage-v4__disclaimer">KI-Konzeptvisualisierung · keine bestätigte Produktfotografie</small></div>';
}

function ensureStage() {
  if (stageRoot?.isConnected) return stageRoot;
  if (!foodStageImage?.parentElement) return null;
  stageRoot = document.createElement("section");
  stageRoot.className = "mc-food-stage-v4";
  stageRoot.dataset.foodStageV4 = "true";
  stageRoot.dataset.view = "exploded";
  stageRoot.setAttribute("role", "region");
  stageRoot.setAttribute("aria-label", "Interaktive Pide-Döner-Konzeptvorschau");
  stageRoot.innerHTML = stageMarkup();
  foodStageImage.before(stageRoot);
  const toggle = stageRoot.querySelector("[data-food-stage-toggle]");
  const setView = (view) => {
    stageRoot.dataset.view = view;
    if (modal) modal.dataset.foodStageView = view;
    toggle.textContent = view === "exploded" ? "Zusammenbauen" : "Explodieren";
    toggle.setAttribute("aria-pressed", String(view === "exploded"));
  };
  setView(stageRoot.dataset.view);
  toggle.addEventListener("click", () => setView(stageRoot.dataset.view === "exploded" ? "assembled" : "exploded"));
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
  const selected = selectedNames(groupMap);
  for (const layer of STAGE_LAYERS) {
    const node = root.querySelector('[data-food-layer="' + layer.id + '"]');
    const active = Boolean(layer.fixed || selected.has(layer.id));
    if (node) node.dataset.active = String(active);
    const callout = root.querySelector('[data-food-callout-for="' + layer.id + '"]');
    if (callout) callout.dataset.active = String(active && !layer.fixed);
  }
  const visible = [...selected].filter((id) => LAYER_BY_ID.has(id)).map((id) => LAYER_BY_ID.get(id).label);
  const missing = [...selected].filter((id) => MISSING_LABELS.has(id)).map((id) => MISSING_LABELS.get(id));
  const summary = visible.length ? visible.join(" · ") : "Wähle deine Zutaten";
  root.querySelector("[data-food-stage-summary]").textContent = summary;
  root.querySelector("[data-food-stage-missing]").textContent = missing.length ? "Visual folgt für: " + missing.join(" · ") : "";
  root.setAttribute("aria-label", "Pide-Döner-Konzeptvorschau. " + summary + ".");
  modal.dataset.assemblyVisualLayers = String(visible.length);
  modal.dataset.assemblyPresentation = "true";
  return true;
}

function clearStage() {
  if (!modal) return;
  if (modal.dataset.productBuilder === "doner-yufka") delete modal.dataset.productBuilder;
  delete modal.dataset.foodStageView;
  delete modal.dataset.assemblyVisualLayers;
  delete modal.dataset.assemblyPresentation;
  setImageVisibility(false);
  stageRoot?.remove();
  stageRoot = null;
}

function applyStage() {
  const isPideProduct = PRODUCT_IDS.has(modal?.dataset.productId);
  const groupMap = modal?.classList.contains("open") && isPideProduct ? presentationGroupMap() : null;
  if (!groupMap) return false;
  modal.dataset.productBuilder = "doner-yufka";
  ensureStage();
  setImageVisibility(true);
  return updateStage(groupMap);
}

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
    if (modal?.classList.contains("open") && PRODUCT_IDS.has(modal.dataset.productId) && presentationGroupMap()) applyStage();
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
