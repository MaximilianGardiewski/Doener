const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/doner-yufka-builder-v2.css";
stylesheet.dataset.mcelloDonerYufkaBuilder = "true";
document.head.appendChild(stylesheet);

const modal = document.querySelector("#productModal");
const foodStage = document.querySelector("#modalImage");
const groupsRoot = document.querySelector("#modifierGroups");
const presentationSauces = ["Curry", "Knoblauch", "Scharf"];

function optionName(label) {
  return label?.querySelector("span")?.textContent?.replace(/ · ausverkauft$/i, "")?.trim() || "";
}

function presentationSauceGroup() {
  if (!groupsRoot) return null;
  return [...groupsRoot.querySelectorAll(".modifier-group")].find((group) => {
    const name = group.querySelector(".modifier-head strong")?.textContent?.trim() || "";
    if (name !== "Soße") return false;
    const names = new Set([...group.querySelectorAll(".modifier-option")].map(optionName));
    return presentationSauces.length === names.size && presentationSauces.every((sauce) => names.has(sauce));
  }) || null;
}

function rememberOriginalStage() {
  if (!foodStage || foodStage.dataset.assemblyOriginalSrc) return;
  foodStage.dataset.assemblyOriginalSrc = foodStage.getAttribute("src") || "";
  foodStage.dataset.assemblyOriginalAlt = foodStage.getAttribute("alt") || "";
}

function restoreOriginalStage() {
  if (!foodStage?.dataset.assemblyOriginalSrc) return;
  foodStage.setAttribute("src", foodStage.dataset.assemblyOriginalSrc);
  foodStage.setAttribute("alt", foodStage.dataset.assemblyOriginalAlt || "");
  delete foodStage.dataset.assemblyOriginalSrc;
  delete foodStage.dataset.assemblyOriginalAlt;
  delete foodStage.dataset.assemblyPreview;
}

function selectedPresentationSauces(group) {
  return new Set([...group.querySelectorAll(".modifier-option")]
    .filter((label) => label.querySelector("input")?.checked)
    .map(optionName)
    .filter((name) => presentationSauces.includes(name)));
}

function sauceRibbon(selected, sauce, color, offset) {
  if (!selected.has(sauce)) return "";
  const y = 302 + offset;
  return `<path d="M214 ${y}c54-38 117-42 180-11 57 28 104 25 144-10" fill="none" stroke="${color}" stroke-width="18" stroke-linecap="round" opacity=".96"/><path d="M230 ${y + 28}c50-28 103-29 157-5 48 22 92 20 132-5" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" opacity=".78"/>`;
}

function assemblySvg(selected) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 620" role="img" aria-label="Schematische interaktive Döner- und Yufka-Vorschau">
    <defs>
      <linearGradient id="bread" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#efc27d"/><stop offset=".58" stop-color="#c78646"/><stop offset="1" stop-color="#8e532e"/></linearGradient>
      <linearGradient id="inner" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c3a2c"/><stop offset="1" stop-color="#2d2521"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-opacity=".3"/></filter>
      <clipPath id="fillClip"><path d="M181 233c54-91 132-134 235-125 103 9 168 61 193 155-36 114-104 201-207 260-97-60-170-157-221-290Z"/></clipPath>
    </defs>
    <ellipse cx="392" cy="548" rx="244" ry="42" fill="#171513" opacity=".22"/>
    <g filter="url(#shadow)" transform="rotate(-5 390 330)">
      <path d="M154 222c60-112 153-164 273-151 117 13 193 78 224 192-47 146-132 257-254 330-119-72-205-190-243-371Z" fill="url(#bread)"/>
      <path d="M181 233c54-91 132-134 235-125 103 9 168 61 193 155-36 114-104 201-207 260-97-60-170-157-221-290Z" fill="url(#inner)"/>
      <g clip-path="url(#fillClip)">
        <path d="M169 369c73-43 147-48 224-14 69 31 137 28 205-10l-18 111c-65 48-126 76-184 85-73-24-149-87-227-172Z" fill="#6f7650" opacity=".62"/>
        <path d="M197 263c55-50 119-72 193-65 76 7 139 38 189 94-67 37-132 43-195 18-62-25-124-27-187-6Z" fill="#8b5338" opacity=".82"/>
        ${sauceRibbon(selected, "Curry", "#e8b94e", 0)}
        ${sauceRibbon(selected, "Knoblauch", "#f4ead0", 42)}
        ${sauceRibbon(selected, "Scharf", "#c94b3d", 84)}
      </g>
      <path d="M154 222c60-112 153-164 273-151 117 13 193 78 224 192" fill="none" stroke="#f6d59e" stroke-width="7" opacity=".38"/>
    </g>
  </svg>`;
}

function pulseStage() {
  if (!foodStage || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  foodStage.animate?.([
    { opacity: .78, transform: "perspective(900px) rotateX(2deg) rotateY(-4deg) scale(.986)" },
    { opacity: 1, transform: "perspective(900px) rotateX(2deg) rotateY(-4deg) scale(1)" },
  ], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
}

function renderAssemblyPreview() {
  const group = presentationSauceGroup();
  if (!modal || !foodStage || !group) return false;
  rememberOriginalStage();
  const selected = selectedPresentationSauces(group);
  foodStage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(assemblySvg(selected))}`;
  const label = selected.size ? [...selected].join(", ") : "noch keine Präsentationssoße ausgewählt";
  foodStage.alt = `Schematische interaktive Döner/Yufka-Vorschau: ${label}.`;
  foodStage.dataset.assemblyPreview = "schematic";
  modal.dataset.assemblyVisualLayers = String(selected.size);
  modal.dataset.assemblyPresentation = "true";
  pulseStage();
  return true;
}

function clearAssemblyStage() {
  if (!modal) return;
  if (modal.dataset.productBuilder === "doner-yufka") delete modal.dataset.productBuilder;
  delete modal.dataset.assemblyVisualLayers;
  delete modal.dataset.assemblyPresentation;
  foodStage?.removeAttribute("data-assembly-stage");
  restoreOriginalStage();
}

function applyAssemblyStage() {
  if (!modal?.classList.contains("open") || !presentationSauceGroup()) return false;
  modal.dataset.productBuilder = "doner-yufka";
  modal.dataset.assemblyVisualLayers = "0";
  foodStage?.setAttribute("data-assembly-stage", "three-quarter");
  return renderAssemblyPreview();
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const trigger = target?.closest("[data-product], [data-recommended-product]");
  if (!trigger || trigger.matches(":disabled")) return;
  queueMicrotask(() => {
    if (!applyAssemblyStage()) clearAssemblyStage();
  });
});

groupsRoot?.addEventListener("change", () => {
  if (modal?.dataset.productBuilder === "doner-yufka") queueMicrotask(renderAssemblyPreview);
});

if (groupsRoot) {
  new MutationObserver(() => {
    if (modal?.classList.contains("open") && presentationSauceGroup()) applyAssemblyStage();
  }).observe(groupsRoot, { childList: true, subtree: true });
}

if (modal) {
  new MutationObserver(() => {
    if (modal.classList.contains("open")) {
      applyAssemblyStage();
      return;
    }
    clearAssemblyStage();
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });
}
