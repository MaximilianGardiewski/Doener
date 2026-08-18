import "./doner-yufka-builder-v2.js";

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/pizza-builder-v2.css";
stylesheet.dataset.mcelloPizzaBuilder = "true";
document.head.appendChild(stylesheet);

const modal = document.querySelector("#productModal");
const foodStage = document.querySelector("#modalImage");
let pendingPizza = false;

function activeCategoryId() {
  return document.querySelector("#categoryRail [data-category].active")?.dataset.category || "";
}

function clearPizzaStage() {
  if (!modal) return;
  if (modal.dataset.productBuilder === "pizza") delete modal.dataset.productBuilder;
  delete modal.dataset.pizzaVisualLayers;
  foodStage?.removeAttribute("data-pizza-stage");
}

function applyPizzaStage() {
  if (!modal?.classList.contains("open") || !pendingPizza) return;
  modal.dataset.productBuilder = "pizza";
  modal.dataset.pizzaVisualLayers = "0";
  foodStage?.setAttribute("data-pizza-stage", "top-down");
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const product = target?.closest("[data-product], [data-recommended-product]");
  if (!product || product.matches(":disabled")) return;
  pendingPizza = activeCategoryId() === "pizza";
  queueMicrotask(() => pendingPizza ? applyPizzaStage() : clearPizzaStage());
});

if (modal) {
  new MutationObserver(() => {
    if (modal.classList.contains("open")) {
      if (pendingPizza) applyPizzaStage();
      return;
    }
    pendingPizza = false;
    clearPizzaStage();
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });
}
