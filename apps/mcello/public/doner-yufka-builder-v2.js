const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/doner-yufka-builder-v2.css";
stylesheet.dataset.mcelloDonerYufkaBuilder = "true";
document.head.appendChild(stylesheet);

const modal = document.querySelector("#productModal");
const foodStageImage = document.querySelector("#modalImage");
const groupsRoot = document.querySelector("#modifierGroups");

const presentationGroups = new Map([
  ["Basis", ["Fleisch", "Falafel"]],
  ["Gemüse", ["Salat", "Tomate", "Gurke", "Zwiebel"]],
  ["Soße", ["Curry", "Knoblauch", "Scharf"]],
]);

const visualLayerNames = ["Fleisch", "Falafel", "Salat", "Tomate", "Gurke", "Zwiebel", "Curry", "Knoblauch", "Scharf"];
let stageRoot = null;

function optionName(label) {
  return label?.querySelector("span")?.textContent?.replace(/ · ausverkauft$/i, "")?.trim() || "";
}

function groupName(group) {
  return group?.querySelector(".modifier-head strong")?.textContent?.trim() || "";
}

function presentationGroupMap() {
  if (!groupsRoot) return null;
  const found = new Map([...groupsRoot.querySelectorAll(".modifier-group")].map((group) => [groupName(group), group]));
  for (const [name, expected] of presentationGroups) {
    const group = found.get(name);
    if (!group) return null;
    const names = new Set([...group.querySelectorAll(".modifier-option")].map(optionName));
    if (names.size !== expected.length || !expected.every((option) => names.has(option))) return null;
  }
  return found;
}

function selectedNames(groupMap) {
  const selected = new Set();
  for (const name of presentationGroups.keys()) {
    const group = groupMap.get(name);
    for (const label of group.querySelectorAll(".modifier-option")) {
      const input = label.querySelector("input");
      if (input?.checked) selected.add(optionName(label));
    }
  }
  return selected;
}

function stageMarkup() {
  return `
    <div class="mc-food-stage-v4__halo" aria-hidden="true"></div>
    <svg class="mc-food-stage-v4__art" viewBox="0 0 760 620" aria-hidden="true">
      <defs>
        <linearGradient id="mcBread" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd99b"/><stop offset=".55" stop-color="#d9954f"/><stop offset="1" stop-color="#a95e30"/></linearGradient>
        <linearGradient id="mcBreadInner" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#74452c"/><stop offset="1" stop-color="#35241e"/></linearGradient>
        <linearGradient id="mcMeat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a95b38"/><stop offset=".5" stop-color="#7d3d29"/><stop offset="1" stop-color="#54291f"/></linearGradient>
        <filter id="mcStageShadow"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#3a2418" flood-opacity=".28"/></filter>
        <clipPath id="mcPocketClip"><path d="M196 229c47-82 119-123 213-116 95 8 157 55 184 143-30 104-92 187-187 250-91-54-160-146-210-277Z"/></clipPath>
      </defs>
      <ellipse cx="392" cy="550" rx="238" ry="34" fill="#271a13" opacity=".16"/>
      <g class="mc-food-vessel" filter="url(#mcStageShadow)" transform="rotate(-4 390 330)">
        <path d="M158 218c58-106 148-157 263-146 114 11 190 73 222 181-41 143-124 253-246 330-117-67-204-184-239-365Z" fill="url(#mcBread)" stroke="#834521" stroke-width="5"/>
        <path d="M196 229c47-82 119-123 213-116 95 8 157 55 184 143-30 104-92 187-187 250-91-54-160-146-210-277Z" fill="url(#mcBreadInner)"/>
        <g clip-path="url(#mcPocketClip)">
          <path d="M176 434c80-27 153-29 218-4 70 27 142 20 218-22l-20 132H183Z" fill="#8c5a34" opacity=".55"/>

          <g class="mc-food-layer mc-food-layer--salat" data-food-layer="Salat"><path d="M177 392c26-33 53-31 78-4 20-43 49-49 77-15 23-43 54-46 82-9 28-42 59-40 85 0 24-28 51-25 82 8-24 62-64 101-119 119-91 6-179-24-285-99Z" fill="#79a84a" stroke="#4f7a34" stroke-width="5"/><path d="M230 407c45 13 84 30 117 52m45-48c-23 24-37 48-44 73m115-70c-22 18-38 41-48 68" fill="none" stroke="#a7ca69" stroke-width="7" stroke-linecap="round" opacity=".72"/></g>

          <g class="mc-food-layer mc-food-layer--protein mc-food-layer--fleisch" data-food-layer="Fleisch">
            <path d="M224 282c38-30 72-24 99 8l-25 67-82-16Z" fill="url(#mcMeat)" stroke="#572b20" stroke-width="4"/><path d="M318 258c40-21 77-9 102 28l-29 67-87-23Z" fill="#934a31" stroke="#572b20" stroke-width="4"/><path d="M416 279c34-21 69-9 100 34l-35 58-81-25Z" fill="#7b3827" stroke="#572b20" stroke-width="4"/><path d="M275 351c39-17 75-5 106 36l-38 55-88-28Z" fill="#a35635" stroke="#572b20" stroke-width="4"/><path d="M384 350c40-18 82-5 119 37l-42 56-98-32Z" fill="#85402c" stroke="#572b20" stroke-width="4"/>
            <path d="M244 302l48 17m50-38l52 20m42 5l51 21m-191 51l52 20m53-18l58 20" stroke="#d28155" stroke-width="7" stroke-linecap="round" opacity=".62"/>
          </g>

          <g class="mc-food-layer mc-food-layer--protein mc-food-layer--falafel" data-food-layer="Falafel">
            <circle cx="275" cy="326" r="43" fill="#a97838" stroke="#69502e" stroke-width="5"/><circle cx="370" cy="300" r="45" fill="#b78742" stroke="#69502e" stroke-width="5"/><circle cx="470" cy="330" r="42" fill="#9b7139" stroke="#69502e" stroke-width="5"/><circle cx="330" cy="397" r="42" fill="#ae8141" stroke="#69502e" stroke-width="5"/><circle cx="428" cy="402" r="43" fill="#a8793d" stroke="#69502e" stroke-width="5"/>
            <g fill="#d5b56a" opacity=".7"><circle cx="263" cy="315" r="5"/><circle cx="287" cy="338" r="4"/><circle cx="359" cy="286" r="5"/><circle cx="385" cy="316" r="4"/><circle cx="458" cy="318" r="5"/><circle cx="337" cy="385" r="5"/><circle cx="417" cy="388" r="5"/></g>
          </g>

          <g class="mc-food-layer mc-food-layer--tomate" data-food-layer="Tomate"><g fill="#e9583f" stroke="#a9342d" stroke-width="4"><ellipse cx="260" cy="392" rx="58" ry="27" transform="rotate(-13 260 392)"/><ellipse cx="383" cy="374" rx="62" ry="28" transform="rotate(8 383 374)"/><ellipse cx="495" cy="405" rx="56" ry="26" transform="rotate(-8 495 405)"/></g><g fill="#ffc9a4" opacity=".72"><ellipse cx="260" cy="392" rx="29" ry="8" transform="rotate(-13 260 392)"/><ellipse cx="383" cy="374" rx="31" ry="8" transform="rotate(8 383 374)"/><ellipse cx="495" cy="405" rx="28" ry="8" transform="rotate(-8 495 405)"/></g></g>

          <g class="mc-food-layer mc-food-layer--gurke" data-food-layer="Gurke"><g fill="#a7ce65" stroke="#477739" stroke-width="5"><ellipse cx="248" cy="445" rx="46" ry="24" transform="rotate(12 248 445)"/><ellipse cx="348" cy="432" rx="47" ry="24" transform="rotate(-7 348 432)"/><ellipse cx="452" cy="449" rx="46" ry="24" transform="rotate(11 452 449)"/><ellipse cx="530" cy="430" rx="42" ry="22" transform="rotate(-11 530 430)"/></g><g fill="#d7eca0" opacity=".9"><ellipse cx="248" cy="445" rx="28" ry="12" transform="rotate(12 248 445)"/><ellipse cx="348" cy="432" rx="28" ry="12" transform="rotate(-7 348 432)"/><ellipse cx="452" cy="449" rx="28" ry="12" transform="rotate(11 452 449)"/><ellipse cx="530" cy="430" rx="25" ry="11" transform="rotate(-11 530 430)"/></g></g>

          <g class="mc-food-layer mc-food-layer--zwiebel" data-food-layer="Zwiebel"><g fill="none" stroke="#d4a6cf" stroke-width="11" stroke-linecap="round"><path d="M234 347c32-31 70-27 93 8 15 25 5 49-22 61-28 13-57 3-67-20-9-22 4-43 28-51"/><path d="M391 323c31-28 69-22 88 14 14 28 0 51-30 60-28 8-55-4-62-29-6-22 8-41 34-47"/><path d="M490 365c28-26 61-20 77 11 12 24 0 45-26 54-26 8-50-3-57-24-7-21 6-39 29-46"/></g></g>

          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--curry" data-food-layer="Curry"><path d="M219 343c62-44 127-47 193-10 54 30 102 27 148-9" fill="none" stroke="#efbd43" stroke-width="19" stroke-linecap="round"/><path d="M238 372c56-31 111-31 165-4 47 23 90 20 127-4" fill="none" stroke="#f6d56d" stroke-width="9" stroke-linecap="round"/></g>
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--knoblauch" data-food-layer="Knoblauch"><path d="M215 382c59-38 120-40 183-7 59 31 110 27 157-8" fill="none" stroke="#f6efd8" stroke-width="19" stroke-linecap="round"/><path d="M235 410c50-28 104-29 160-2 49 24 91 19 129-4" fill="none" stroke="#fff9e8" stroke-width="9" stroke-linecap="round"/></g>
          <g class="mc-food-layer mc-food-layer--sauce mc-food-layer--scharf" data-food-layer="Scharf"><path d="M221 420c58-36 120-37 183-4 55 29 105 24 151-9" fill="none" stroke="#d64736" stroke-width="19" stroke-linecap="round"/><path d="M245 447c49-25 101-25 153-1 45 21 84 17 119-4" fill="none" stroke="#ed7051" stroke-width="9" stroke-linecap="round"/></g>
        </g>
        <path d="M158 218c58-106 148-157 263-146 114 11 190 73 222 181" fill="none" stroke="#ffe3b4" stroke-width="8" opacity=".62"/>
        <path d="M176 205c23 5 41 13 55 24m272-89c24 18 43 38 57 61" fill="none" stroke="#fff0c8" stroke-width="9" stroke-linecap="round" opacity=".42"/>
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

function setImageVisibility(active) {
  if (!foodStageImage) return;
  foodStageImage.hidden = active;
  if (active) foodStageImage.setAttribute("aria-hidden", "true");
  else foodStageImage.removeAttribute("aria-hidden");
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

  const basis = selected.has("Falafel") ? "Falafel" : selected.has("Fleisch") ? "Fleisch" : "Basis wählen";
  const fresh = ["Salat", "Tomate", "Gurke", "Zwiebel"].filter((name) => selected.has(name));
  const sauces = ["Curry", "Knoblauch", "Scharf"].filter((name) => selected.has(name));
  const summary = [basis, fresh.length ? fresh.join(" · ") : "ohne Gemüse", sauces.length ? sauces.join(" · ") : "ohne Soße"].join(" — ");
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
  delete modal.dataset.assemblyPresentation;
  setImageVisibility(false);
  stageRoot?.remove();
  stageRoot = null;
}

function applyStage() {
  const groupMap = modal?.classList.contains("open") ? presentationGroupMap() : null;
  if (!groupMap) return false;
  modal.dataset.productBuilder = "doner-yufka";
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
