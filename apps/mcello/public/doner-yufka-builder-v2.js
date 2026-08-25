const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/doner-yufka-builder-v2.css";
stylesheet.dataset.mcelloDonerYufkaBuilder = "true";
document.head.appendChild(stylesheet);

const modal = document.querySelector("#productModal");
const foodStageImage = document.querySelector("#modalImage");
const groupsRoot = document.querySelector("#modifierGroups");

/*
 * Presentation adapter for assembled flatbread dishes (Döner, Yufka, …).
 *
 * It reads the structured metadata the application already publishes on the real
 * modifier markup (`data-group-name`, `data-option-name`) and resolves it into
 * visual roles and layers. It never matches on a product name and never decides
 * what is orderable, valid or priced — those stay in the application/domain path.
 */

// Modifier-group name -> build role. Roles order the visual assembly; they carry no commerce meaning.
const GROUP_ROLES = new Map([
  ["basis", "basis"],
  ["fleisch", "basis"],
  ["herz", "basis"],
  ["gemüse", "fresh"],
  ["gemuese", "fresh"],
  ["frisches", "fresh"],
  ["salate", "fresh"],
  ["soße", "sauce"],
  ["sosse", "sauce"],
  ["saucen", "sauce"],
  ["soßen", "sauce"],
]);

// Ingredient token -> visual layer. Tokens come from the real option names, not from product identity.
const LAYER_TOKENS = new Map([
  ["fleisch", "Fleisch"],
  ["kalb", "Fleisch"],
  ["pute", "Fleisch"],
  ["drehspieß", "Fleisch"],
  ["falafel", "Falafel"],
  ["salat", "Salat"],
  ["tomate", "Tomate"],
  ["tomaten", "Tomate"],
  ["gurke", "Gurke"],
  ["gurken", "Gurke"],
  ["zwiebel", "Zwiebel"],
  ["zwiebeln", "Zwiebel"],
  ["curry", "Curry"],
  ["knoblauch", "Knoblauch"],
  ["scharf", "Scharf"],
]);

const visualLayerNames = ["Fleisch", "Falafel", "Salat", "Tomate", "Gurke", "Zwiebel", "Curry", "Knoblauch", "Scharf"];
const SAUCE_LAYER_NAMES = Object.freeze(["Curry", "Knoblauch", "Scharf"]);
const SAUCE_BASELINE_Y = Object.freeze({ Curry: 44, Knoblauch: 4, Scharf: -36 });
const SAUCE_LAYOUTS = Object.freeze({
  1: Object.freeze([{ x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0 }]),
  2: Object.freeze([
    { x: -78, y: -4, scaleX: 0.62, scaleY: 0.96, rotate: -1.5 },
    { x: 78, y: 4, scaleX: 0.62, scaleY: 0.96, rotate: 1.5 },
  ]),
  3: Object.freeze([
    { x: -116, y: -4, scaleX: 0.44, scaleY: 0.94, rotate: -2 },
    { x: 0, y: 3, scaleX: 0.44, scaleY: 0.94, rotate: 0.5 },
    { x: 116, y: -2, scaleX: 0.44, scaleY: 0.94, rotate: 2 },
  ]),
});
const ROLE_LAYERS = new Map([
  ["basis", ["Fleisch", "Falafel"]],
  ["fresh", ["Salat", "Tomate", "Gurke", "Zwiebel"]],
  ["sauce", SAUCE_LAYER_NAMES],
]);

// Categories whose products are presented by a different stage metaphor (top-down).
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

/*
 * Resolves the visible modifier groups into build roles.
 * Returns null when this product has no assembly-shaped structure at all.
 */
function presentationGroupMap() {
  if (!groupsRoot) return null;
  if (FOREIGN_STAGE_CATEGORIES.has(normalize(modal?.dataset.categorySlug))) return null;

  const resolved = new Map();
  for (const group of groupsRoot.querySelectorAll(".modifier-group")) {
    const role = GROUP_ROLES.get(normalize(groupName(group)));
    if (!role) continue;
    const layers = [...group.querySelectorAll(".modifier-option")].filter(layerFor);
    if (!layers.length) continue;
    /*
     * Keep the first group that claims a role. A catalog splitting ingredients
     * across two groups that normalise to the same role (say "Gemüse" and
     * "Salate") used to overwrite the entry, so one group's layers silently
     * stopped appearing on the stage. First-wins at least keeps the stage
     * consistent with the group the guest sees first; the alternative -- drawing
     * both -- would need a layer-merge the stage does not model.
     */
    if (resolved.has(role)) continue;
    resolved.set(role, group);
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
  return `
    <div class="mc-food-stage-v4__halo" aria-hidden="true"></div>
    <svg class="mc-food-stage-v4__art" viewBox="140 140 480 470" aria-hidden="true">
      <defs>
        <linearGradient id="mcBread" x1="0" y1="0" x2=".2" y2="1"><stop offset="0" stop-color="#f6d9a4"/><stop offset=".54" stop-color="#dea461"/><stop offset="1" stop-color="#b06f36"/></linearGradient>
        <linearGradient id="mcBreadBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c185"/><stop offset="1" stop-color="#c08b4b"/></linearGradient>
        <linearGradient id="mcBreadInner" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d442c"/><stop offset="1" stop-color="#3a2820"/></linearGradient>
        <linearGradient id="mcMeat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b4633c"/><stop offset=".5" stop-color="#87432c"/><stop offset="1" stop-color="#5a2d21"/></linearGradient>
        <filter id="mcStageShadow"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#3a2418" flood-opacity=".26"/></filter>
        <clipPath id="mcPocketClip"><path d="M204 452V318c0-72 79-122 176-122s176 50 176 122v134Z"/></clipPath>
      </defs>

      <ellipse cx="380" cy="562" rx="196" ry="24" fill="#2a1c14" opacity=".18"/>

      <!-- Back half of the flatbread: the filling is tucked in front of it. -->
      <g class="mc-food-vessel mc-food-vessel--back">
        <path d="M204 452V318c0-72 79-122 176-122s176 50 176 122v134Z" fill="url(#mcBreadBack)" stroke="#9c5f2d" stroke-width="5" stroke-linejoin="round"/>
        <path d="M240 320c8-48 68-80 140-80s132 32 140 80" fill="none" stroke="#f7e2b8" stroke-width="7" stroke-linecap="round" opacity=".4"/>
      </g>

      <!-- Filling: every layer maps to one real, checked modifier option. -->
      <g clip-path="url(#mcPocketClip)" transform="translate(0 4)">
        <path d="M150 268h460v230H150Z" fill="url(#mcBreadInner)" opacity=".82"/>

        <g class="mc-food-layer mc-food-layer--salat" data-food-layer="Salat"><path d="M156 356c30-34 60-32 87-3 22-44 54-50 84-14 25-44 58-47 88-9 30-43 63-41 91 1 26-29 39-26 52 4v122H156Z" fill="#7fb04d" stroke="#4f7a34" stroke-width="5"/><path d="M206 372c48 14 90 32 125 56m48-52c-24 26-40 51-47 78m123-75c-24 19-41 44-51 73" fill="none" stroke="#b0d270" stroke-width="7" stroke-linecap="round" opacity=".7"/></g>

        <g class="mc-food-layer mc-food-layer--protein mc-food-layer--fleisch" data-food-layer="Fleisch">
          <path d="M186 262c40-30 76-24 104 8l-26 68-86-16Z" fill="url(#mcMeat)" stroke="#5c2f22" stroke-width="4"/><path d="M284 238c42-21 81-9 107 28l-30 68-91-23Z" fill="#9b5033" stroke="#5c2f22" stroke-width="4"/><path d="M388 259c36-21 72-9 105 34l-37 59-85-25Z" fill="#823c29" stroke="#5c2f22" stroke-width="4"/><path d="M498 250c36-18 70-4 96 36l-38 56-83-26Z" fill="#a15b38" stroke="#5c2f22" stroke-width="4"/><path d="M240 332c41-17 79-5 111 37l-40 56-92-29Z" fill="#ab5c38" stroke="#5c2f22" stroke-width="4"/><path d="M352 331c42-18 86-5 125 38l-44 57-103-33Z" fill="#8b452e" stroke="#5c2f22" stroke-width="4"/>
          <path d="M206 282l50 18m52-39l55 21m44 5l53 22m-200 52l55 21m56-19l60 21" stroke="#dd8b5b" stroke-width="7" stroke-linecap="round" opacity=".6"/>
        </g>

        <g class="mc-food-layer mc-food-layer--protein mc-food-layer--falafel" data-food-layer="Falafel">
          <circle cx="236" cy="306" r="45" fill="#a97838" stroke="#69502e" stroke-width="5"/><circle cx="338" cy="278" r="47" fill="#b78742" stroke="#69502e" stroke-width="5"/><circle cx="444" cy="292" r="44" fill="#9b7139" stroke="#69502e" stroke-width="5"/><circle cx="536" cy="318" r="42" fill="#a8793d" stroke="#69502e" stroke-width="5"/><circle cx="290" cy="382" r="44" fill="#ae8141" stroke="#69502e" stroke-width="5"/><circle cx="398" cy="388" r="45" fill="#a5763b" stroke="#69502e" stroke-width="5"/>
          <g fill="#d5b56a" opacity=".7"><circle cx="223" cy="294" r="5"/><circle cx="248" cy="318" r="4"/><circle cx="326" cy="264" r="5"/><circle cx="352" cy="294" r="4"/><circle cx="431" cy="280" r="5"/><circle cx="297" cy="370" r="5"/><circle cx="387" cy="374" r="5"/></g>
        </g>

        <g class="mc-food-layer mc-food-layer--tomate" data-food-layer="Tomate"><g fill="#e9583f" stroke="#a9342d" stroke-width="4"><ellipse cx="222" cy="368" rx="60" ry="26" transform="rotate(-12 222 368)"/><ellipse cx="356" cy="352" rx="64" ry="27" transform="rotate(7 356 352)"/><ellipse cx="486" cy="374" rx="60" ry="26" transform="rotate(-8 486 374)"/></g><g fill="#ffc9a4" opacity=".7"><ellipse cx="222" cy="368" rx="30" ry="8" transform="rotate(-12 222 368)"/><ellipse cx="356" cy="352" rx="32" ry="8" transform="rotate(7 356 352)"/><ellipse cx="486" cy="374" rx="30" ry="8" transform="rotate(-8 486 374)"/></g></g>

        <g class="mc-food-layer mc-food-layer--gurke" data-food-layer="Gurke"><g fill="#a7ce65" stroke="#477739" stroke-width="5"><ellipse cx="212" cy="418" rx="48" ry="23" transform="rotate(11 212 418)"/><ellipse cx="322" cy="406" rx="49" ry="23" transform="rotate(-7 322 406)"/><ellipse cx="434" cy="420" rx="48" ry="23" transform="rotate(10 434 420)"/><ellipse cx="536" cy="404" rx="44" ry="22" transform="rotate(-10 536 404)"/></g><g fill="#d7eca0" opacity=".9"><ellipse cx="212" cy="418" rx="29" ry="11" transform="rotate(11 212 418)"/><ellipse cx="322" cy="406" rx="29" ry="11" transform="rotate(-7 322 406)"/><ellipse cx="434" cy="420" rx="29" ry="11" transform="rotate(10 434 420)"/><ellipse cx="536" cy="404" rx="26" ry="10" transform="rotate(-10 536 404)"/></g></g>

        <g class="mc-food-layer mc-food-layer--zwiebel" data-food-layer="Zwiebel"><g fill="none" stroke="#dcb0d6" stroke-width="8" stroke-linecap="round" opacity=".92"><path d="M232 330c26-24 56-21 74 6 12 20 4 39-17 48-22 10-45 2-53-16-7-17 3-34 22-40"/><path d="M356 310c25-22 55-17 70 11 11 22 0 40-23 47-23 6-44-4-49-23-5-18 6-33 27-37"/><path d="M470 340c23-20 49-16 62 9 9 19 0 35-21 42-21 7-40-2-46-19-5-17 5-31 24-36"/></g></g>

        <!-- Sauces share one visual deck. JS deterministically redistributes 1–3 active sauces across this plane. -->
        <g class="mc-sauce-deck" data-sauce-deck data-sauce-count="0">
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--curry" data-food-layer="Curry" data-asset-id="sauce-curry-master-v1"><image class="mc-sauce-raster" href="/assets/ingredients/sauces/sauce-curry-master.png" x="175" y="306" width="410" height="138" preserveAspectRatio="xMidYMid meet"/></g>
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--knoblauch" data-food-layer="Knoblauch" data-asset-id="sauce-garlic-master-v1"><image class="mc-sauce-raster" href="/assets/ingredients/sauces/sauce-garlic-master.png" x="175" y="346" width="410" height="138" preserveAspectRatio="xMidYMid meet"/></g>
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--scharf" data-food-layer="Scharf" data-asset-id="sauce-spicy-master-v1"><image class="mc-sauce-raster" href="/assets/ingredients/sauces/sauce-spicy-master.png" x="175" y="386" width="410" height="138" preserveAspectRatio="xMidYMid meet"/></g>
        </g>
      </g>

      <!-- Front half of the flatbread wraps the filling. -->
      <g class="mc-food-vessel mc-food-vessel--front" filter="url(#mcStageShadow)">
        <path d="M166 434c0-9 7-16 16-16h396c9 0 16 7 16 16v8c0 64-97 116-214 116S166 506 166 442Z" fill="url(#mcBread)" stroke="#9c5f2d" stroke-width="5" stroke-linejoin="round"/>
        <path d="M186 446h388" fill="none" stroke="#8a4f27" stroke-width="3" opacity=".3"/>
        <path d="M262 492c-2 22 6 40 24 54" fill="none" stroke="#ffeec6" stroke-width="8" stroke-linecap="round" opacity=".3"/>
        <path d="M448 546c26-10 46-25 60-45" fill="none" stroke="#8a4f27" stroke-width="4" stroke-linecap="round" opacity=".22"/>
      </g>
    </svg>
    <div class="mc-food-stage-v4__caption">
      <span>DEIN MCELLO</span>
      <strong data-food-stage-summary>Auswahl wird aufgebaut …</strong>
      <small>Stilisierte Präsentationsillustration · keine Produktfotografie</small>
    </div>`;
}

function ensureStage() {
  if (stageRoot?.isConnected) return stageRoot;
  if (!foodStageImage?.parentElement) return null;
  stageRoot = document.createElement("section");
  stageRoot.className = "mc-food-stage-v4";
  stageRoot.dataset.foodStageV4 = "true";
  stageRoot.setAttribute("role", "img");
  stageRoot.setAttribute("aria-label", "Stilisierte interaktive Döner- und Yufka-Vorschau");
  stageRoot.innerHTML = stageMarkup();
  foodStageImage.before(stageRoot);
  return stageRoot;
}

/*
 * The Builder shell marks one element as its FoodStage. When this adapter takes the
 * stage over, the marker moves with it so the Builder still has exactly one visible
 * FoodStage instead of a marked-but-hidden product image.
 */
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

function roleSummary(selected, role, fallback) {
  const names = (ROLE_LAYERS.get(role) || []).filter((name) => selected.has(name));
  return names.length ? names.join(" · ") : fallback;
}

function sauceTransform(name, placement) {
  const baselineY = SAUCE_BASELINE_Y[name] || 0;
  return `translate3d(${placement.x}px, ${baselineY + placement.y}px, 0) rotate(${placement.rotate}deg) scale(${placement.scaleX}, ${placement.scaleY})`;
}

function updateSauceDeck(root, selected) {
  const sauces = SAUCE_LAYER_NAMES.filter((name) => selected.has(name));
  const placements = SAUCE_LAYOUTS[sauces.length] || [];
  const deck = root.querySelector("[data-sauce-deck]");

  for (const name of SAUCE_LAYER_NAMES) {
    const layer = root.querySelector(`[data-food-layer="${name}"]`);
    if (!layer) continue;
    const slot = sauces.indexOf(name);
    const active = slot >= 0;
    layer.dataset.active = active ? "true" : "false";
    layer.setAttribute("aria-hidden", active ? "false" : "true");

    if (!active) {
      delete layer.dataset.sauceSlot;
      layer.style.removeProperty("transform");
      continue;
    }

    layer.dataset.sauceSlot = String(slot);
    layer.style.transform = sauceTransform(name, placements[slot]);
  }

  if (deck) {
    deck.dataset.sauceCount = String(sauces.length);
    deck.setAttribute("aria-hidden", sauces.length ? "false" : "true");
  }
  modal.dataset.assemblySauceCount = String(sauces.length);
}

function updateStage(groupMap) {
  const root = ensureStage();
  if (!root) return false;
  const selected = selectedNames(groupMap);
  for (const name of visualLayerNames) {
    const layer = root.querySelector(`[data-food-layer="${name}"]`);
    if (!layer) continue;
    const active = selected.has(name);
    layer.dataset.active = active ? "true" : "false";
    layer.setAttribute("aria-hidden", active ? "false" : "true");
  }
  updateSauceDeck(root, selected);

  const summary = [
    roleSummary(selected, "basis", "Basis wählen"),
    roleSummary(selected, "fresh", "ohne Gemüse"),
    roleSummary(selected, "sauce", "ohne Soße"),
  ].join(" — ");
  root.querySelector("[data-food-stage-summary]").textContent = summary;
  root.setAttribute("aria-label", `Stilisierte Döner/Yufka-Vorschau. ${summary}.`);

  modal.dataset.assemblyVisualLayers = String([...selected].filter((name) => visualLayerNames.includes(name)).length);
  modal.dataset.assemblyPresentation = "true";
  return true;
}

function clearStage() {
  if (!modal) return;
  if (modal.dataset.productBuilder === "doner-yufka") delete modal.dataset.productBuilder;
  delete modal.dataset.assemblyVisualLayers;
  delete modal.dataset.assemblySauceCount;
  delete modal.dataset.assemblyPresentation;
  setImageVisibility(false);
  stageRoot?.remove();
  stageRoot = null;
}

function applyStage() {
  const groupMap = modal?.classList.contains("open") ? presentationGroupMap() : null;
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
    if (modal?.classList.contains("open") && presentationGroupMap()) applyStage();
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