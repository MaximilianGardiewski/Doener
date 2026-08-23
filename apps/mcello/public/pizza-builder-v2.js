import "./doner-yufka-builder-v2.js";

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/pizza-builder-v2.css";
stylesheet.dataset.mcelloPizzaBuilder = "true";
document.head.appendChild(stylesheet);

const modal = document.querySelector("#productModal");
const foodStage = document.querySelector("#modalImage");
const groupsRoot = document.querySelector("#modifierGroups");
const presentationIngredients = ["Kebap Fleisch", "Tomaten", "Broccoli", "Käse", "Zwiebeln"];
let pendingPizza = false;

// Categories this adapter presents with a top-down stage. Declared by the adapter,
// resolved from the real category the application published — never from a product name.
const TOP_DOWN_CATEGORIES = new Set(["pizza"]);

function activeCategorySlug() {
  const slug = String(modal?.dataset.categorySlug || "").trim().toLocaleLowerCase("de");
  return TOP_DOWN_CATEGORIES.has(slug) ? slug : "";
}

function optionName(label) {
  return label?.dataset.optionName
    || label?.querySelector("span")?.textContent?.replace(/ · ausverkauft$/i, "")?.trim()
    || "";
}

function presentationToppingGroup() {
  if (!groupsRoot) return null;
  return [...groupsRoot.querySelectorAll(".modifier-group")].find((group) => {
    const name = group.querySelector(".modifier-head strong")?.textContent?.trim() || "";
    if (name !== "Belag") return false;
    const names = new Set([...group.querySelectorAll(".modifier-option")].map(optionName));
    return presentationIngredients.every((ingredient) => names.has(ingredient));
  }) || null;
}

function rememberOriginalStage() {
  if (!foodStage || foodStage.dataset.pizzaOriginalSrc) return;
  foodStage.dataset.pizzaOriginalSrc = foodStage.getAttribute("src") || "";
  foodStage.dataset.pizzaOriginalAlt = foodStage.getAttribute("alt") || "";
}

function restoreOriginalStage() {
  if (!foodStage?.dataset.pizzaOriginalSrc) return;
  foodStage.setAttribute("src", foodStage.dataset.pizzaOriginalSrc);
  foodStage.setAttribute("alt", foodStage.dataset.pizzaOriginalAlt || "");
  delete foodStage.dataset.pizzaOriginalSrc;
  delete foodStage.dataset.pizzaOriginalAlt;
  delete foodStage.dataset.pizzaPreview;
}

function selectedPresentationIngredients(group) {
  return new Set([...group.querySelectorAll(".modifier-option")]
    .filter((label) => label.querySelector("input")?.checked)
    .map(optionName)
    .filter((name) => presentationIngredients.includes(name)));
}

function pizzaSvg(selected) {
  const layer = (name, markup) => selected.has(name) ? markup : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720" role="img" aria-label="Schematische interaktive Pizza-Vorschau">
    <defs>
      <radialGradient id="crust" cx="42%" cy="34%"><stop offset="0" stop-color="#f1c678"/><stop offset=".72" stop-color="#c77c38"/><stop offset="1" stop-color="#8f4d26"/></radialGradient>
      <radialGradient id="sauce" cx="45%" cy="42%"><stop offset="0" stop-color="#c94d34"/><stop offset="1" stop-color="#8f2f27"/></radialGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-opacity=".32"/></filter>
    </defs>
    <ellipse cx="360" cy="600" rx="252" ry="48" fill="#171513" opacity=".24"/>
    <circle cx="360" cy="350" r="286" fill="url(#crust)" filter="url(#shadow)"/>
    <circle cx="360" cy="350" r="246" fill="url(#sauce)"/>
    ${layer("Käse", `<path d="M174 284c37-82 119-139 213-137 86 2 159 48 195 117-24 30-28 67-12 105 14 34 8 73-18 99-40 40-103 65-173 65-90 0-170-40-207-101-27-45-26-101 2-148Z" fill="#f0c75e" opacity=".92"/><g fill="#fff0aa" opacity=".5"><circle cx="280" cy="235" r="20"/><circle cx="438" cy="256" r="17"/><circle cx="493" cy="409" r="22"/><circle cx="312" cy="451" r="18"/></g>`)}
    ${layer("Tomaten", `<g fill="#c6382f" stroke="#f17b62" stroke-width="5"><circle cx="256" cy="301" r="38"/><circle cx="446" cy="321" r="35"/><circle cx="369" cy="458" r="34"/><circle cx="488" cy="438" r="31"/></g><g fill="#f6a07f" opacity=".62"><circle cx="249" cy="294" r="17"/><circle cx="440" cy="315" r="15"/><circle cx="365" cy="452" r="14"/><circle cx="484" cy="432" r="13"/></g>`)}
    ${layer("Broccoli", `<g fill="#3f6f42" stroke="#244f32" stroke-width="7"><circle cx="341" cy="264" r="27"/><circle cx="360" cy="250" r="24"/><circle cx="378" cy="269" r="26"/><circle cx="240" cy="414" r="23"/><circle cx="258" cy="400" r="22"/><circle cx="275" cy="417" r="23"/></g><g stroke="#5b7c42" stroke-width="14" stroke-linecap="round"><path d="M360 276v35"/><path d="M258 425v33"/></g>`)}
    ${layer("Kebap Fleisch", `<g fill="#7b412b" stroke="#a8663f" stroke-width="5" stroke-linejoin="round"><path d="M203 347l71-28 32 42-71 31Z"/><path d="M397 368l76-21 27 42-72 31Z"/><path d="M310 378l69-25 25 40-67 31Z"/><path d="M385 218l67 12-13 47-68-15Z"/><path d="M277 488l68-23 25 39-65 31Z"/></g>`)}
    ${layer("Zwiebeln", `<g fill="none" stroke="#f2d7e4" stroke-width="12" stroke-linecap="round" opacity=".94"><path d="M205 268c38-34 75-43 111-28"/><path d="M420 475c34-30 70-38 108-25"/><path d="M442 195c28 8 52 25 72 51"/><path d="M196 463c29-19 59-22 90-9"/></g><g fill="none" stroke="#9b6c91" stroke-width="5" opacity=".75"><path d="M209 274c36-30 70-38 102-25"/><path d="M425 481c31-26 64-33 98-22"/></g>`)}
    <circle cx="360" cy="350" r="246" fill="none" stroke="#fff4dc" stroke-width="3" opacity=".24"/>
  </svg>`;
}

function pulseStage() {
  if (!foodStage || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
  foodStage.animate?.([
    { opacity: .76, transform: "scale(.988)" },
    { opacity: 1, transform: "scale(1)" },
  ], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
}

function renderPizzaPreview() {
  const group = presentationToppingGroup();
  if (!modal || !foodStage || !group) {
    if (modal?.dataset.productBuilder === "pizza") modal.dataset.pizzaVisualLayers = "0";
    return false;
  }
  rememberOriginalStage();
  const selected = selectedPresentationIngredients(group);
  foodStage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pizzaSvg(selected))}`;
  foodStage.alt = `Schematische interaktive Pizza-Vorschau: ${selected.size} von ${presentationIngredients.length} Präsentationsbelägen ausgewählt.`;
  foodStage.dataset.pizzaPreview = "schematic";
  modal.dataset.pizzaVisualLayers = String(selected.size);
  modal.dataset.pizzaPresentation = "true";
  pulseStage();
  return true;
}

function clearPizzaStage() {
  if (!modal) return;
  if (modal.dataset.productBuilder === "pizza") delete modal.dataset.productBuilder;
  delete modal.dataset.pizzaVisualLayers;
  delete modal.dataset.pizzaPresentation;
  foodStage?.removeAttribute("data-pizza-stage");
  restoreOriginalStage();
}

function applyPizzaStage() {
  if (!modal?.classList.contains("open")) return;
  const hasPresentationGroup = Boolean(presentationToppingGroup());
  if (!pendingPizza && !hasPresentationGroup) return;
  modal.dataset.productBuilder = "pizza";
  modal.dataset.pizzaVisualLayers = "0";
  foodStage?.setAttribute("data-pizza-stage", "top-down");
  renderPizzaPreview();
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const product = target?.closest("[data-product], [data-recommended-product]");
  if (!product || product.matches(":disabled")) return;
  queueMicrotask(() => {
    pendingPizza = activeCategorySlug() === "pizza";
    if (pendingPizza) applyPizzaStage();
    else clearPizzaStage();
  });
});

groupsRoot?.addEventListener("change", () => {
  if (modal?.dataset.productBuilder === "pizza") queueMicrotask(renderPizzaPreview);
});

if (groupsRoot) {
  new MutationObserver(() => {
    if (!modal?.classList.contains("open")) return;
    if (presentationToppingGroup()) applyPizzaStage();
  }).observe(groupsRoot, { childList: true, subtree: true });
}

if (modal) {
  new MutationObserver(() => {
    if (modal.classList.contains("open")) {
      pendingPizza = activeCategorySlug() === "pizza";
      if (pendingPizza) applyPizzaStage();
      else clearPizzaStage();
      return;
    }
    pendingPizza = false;
    clearPizzaStage();
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });
}
