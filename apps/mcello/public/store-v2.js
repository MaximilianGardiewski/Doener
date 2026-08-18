const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/store-v2.css";
stylesheet.dataset.mcelloStoreV2 = "true";
document.head.appendChild(stylesheet);

const storeStage = document.querySelector(".store-stage");
const featuredGrid = document.querySelector("#featuredGrid");
const menuList = document.querySelector("#menuList");
const categoryRail = document.querySelector("#categoryRail");
const stickyCart = document.querySelector(".sticky-order");

function decorateStore() {
  storeStage?.setAttribute("data-store-version", "v2");
  categoryRail?.setAttribute("data-store-navigation", "categories");
  stickyCart?.setAttribute("data-store-cart", "sticky");

  const cards = [...(featuredGrid?.querySelectorAll(".food-card") || [])];
  cards.forEach((card, index) => {
    const role = index === 0 ? "signature" : "support";
    card.dataset.productRole = role;
    card.classList.toggle("signature-product", role === "signature");
    card.classList.toggle("support-product", role === "support");
    card.querySelector("img")?.setAttribute("data-food-object", role);
  });

  for (const row of menuList?.querySelectorAll(".list-row") || []) {
    row.dataset.productRole = "compact";
    row.classList.add("compact-product");
  }
}

decorateStore();

for (const target of [featuredGrid, menuList, categoryRail]) {
  if (!target) continue;
  new MutationObserver(decorateStore).observe(target, { childList: true, subtree: true });
}
