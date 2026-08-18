const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/doner-yufka-builder-v2.css";
stylesheet.dataset.mcelloDonerYufkaBuilder = "true";
document.head.appendChild(stylesheet);

const modal = document.querySelector("#productModal");
const foodStage = document.querySelector("#modalImage");
const firstPartyAssemblyProducts = new Set(["warm-013", "warm-014", "warm-015", "warm-016", "warm-017", "warm-018"]);
let pendingAssembly = false;

function clearAssemblyStage() {
  if (!modal) return;
  if (modal.dataset.productBuilder === "doner-yufka") delete modal.dataset.productBuilder;
  delete modal.dataset.assemblyVisualLayers;
  foodStage?.removeAttribute("data-assembly-stage");
}

function applyAssemblyStage() {
  if (!modal?.classList.contains("open") || !pendingAssembly) return;
  modal.dataset.productBuilder = "doner-yufka";
  modal.dataset.assemblyVisualLayers = "0";
  foodStage?.setAttribute("data-assembly-stage", "three-quarter");
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const trigger = target?.closest("[data-product], [data-recommended-product]");
  if (!trigger || trigger.matches(":disabled")) return;
  const productId = trigger.dataset.product || trigger.dataset.recommendedProduct || "";
  pendingAssembly = firstPartyAssemblyProducts.has(productId);
  queueMicrotask(() => pendingAssembly ? applyAssemblyStage() : clearAssemblyStage());
});

if (modal) {
  new MutationObserver(() => {
    if (modal.classList.contains("open")) {
      if (pendingAssembly) applyAssemblyStage();
      return;
    }
    pendingAssembly = false;
    clearAssemblyStage();
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });
}
