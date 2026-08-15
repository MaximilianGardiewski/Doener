const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function normalizeMenu(raw) {
  if (Array.isArray(raw?.categories) && raw.categories.every((category) => !Array.isArray(category))) {
    const categories = raw.categories.map((category) => ({
      id: category.id,
      name: category.name,
    }));
    const items = raw.categories.flatMap((category) => (category.products || []).map((product) => ({
      ...product,
      categoryId: category.id,
      modifierGroups: product.modifierGroups || [],
    })));
    return { categories, items };
  }

  const categories = (raw?.categories || []).map(([id, name]) => ({ id, name }));
  const items = (raw?.items || []).map(([id, categoryId, name, description, basePriceCents, variants, orderableOnline]) => ({
    id,
    categoryId,
    name,
    description,
    basePriceCents,
    orderableOnline,
    availableNow: orderableOnline,
    soldOut: false,
    modifierGroups: variants?.length ? [{
      id: `fallback-size-${id}`,
      minSelections: 1,
      maxSelections: 1,
      options: variants.map(([label, priceCents], index) => ({
        id: `fallback-size-${id}-${index}`,
        name: label,
        priceDeltaCents: priceCents - basePriceCents,
        defaultSelected: index === 0,
        soldOut: false,
      })),
    }] : [],
  }));
  return { categories, items };
}

function productOrderable(product) {
  return Boolean(product?.orderableOnline) && !product.soldOut && product.availableNow !== false;
}

function selectCategoryHighlights(menu, limit = 4) {
  const selected = [];
  for (const category of menu.categories) {
    const product = menu.items.find((candidate) => (
      candidate.categoryId === category.id && productOrderable(candidate)
    ));
    if (!product) continue;
    selected.push({ category, product });
    if (selected.length >= limit) break;
  }
  return selected;
}

async function loadCurrentMenu() {
  try {
    const response = await fetch("/api/menu", { cache: "no-store" });
    if (!response.ok) throw new Error("menu backend unavailable");
    return normalizeMenu(await response.json());
  } catch {
    const response = await fetch("/menu-seed.provisional.json", { cache: "no-store" });
    if (!response.ok) return { categories: [], items: [] };
    return normalizeMenu(await response.json());
  }
}

function ensureQuickOrderPanel() {
  const categoryRail = document.querySelector("#categoryRail");
  if (!categoryRail) return null;
  let panel = document.querySelector("#homepageQuickOrder");
  if (panel) return panel;

  panel = document.createElement("section");
  panel.id = "homepageQuickOrder";
  panel.className = "recommendation-box";
  panel.setAttribute("aria-labelledby", "homepageQuickOrderTitle");
  panel.innerHTML = `
    <div class="tag">Schnellzugriff</div>
    <h3 id="homepageQuickOrderTitle">Highlights & Schnellbestellung</h3>
    <p>Aktuelle Kategorie-Highlights aus der veröffentlichten Speisekarte – direkt konfigurieren oder bei einfachen Artikeln sofort in den Warenkorb.</p>
    <div class="recommendation-grid" id="homepageQuickOrderGrid" aria-live="polite"></div>`;
  categoryRail.before(panel);
  return panel;
}

function ensureStoryTeamSlot() {
  const target = document.querySelector("#ueber .two-col");
  if (!target || document.querySelector("#homepageTeamStory")) return;

  target.insertAdjacentHTML("beforeend", `
    <article class="story-card" id="homepageTeamStory">
      <img src="/media/placeholder.svg" alt="" />
      <div class="story-copy">
        <div class="kicker">Menschen hinter Mcello</div>
        <h3>Persönlichkeit gehört zur Geschichte.</h3>
        <p>Die persönliche Mcello-Story und das Team werden hier aus bestätigten First-Party-Inhalten erzählt. Bis dahin bleibt dieser Bereich bewusst ohne erfundene Namen oder Biografie.</p>
      </div>
    </article>`);
}

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function openQuickProduct(categoryId, productId, directEligible) {
  const categoryButton = document.querySelector(`[data-category="${categoryId}"]`);
  if (!categoryButton) return false;
  categoryButton.click();
  await waitFrame();

  const productButton = document.querySelector(`[data-product="${productId}"]`);
  if (!productButton || productButton.disabled) return false;
  productButton.click();
  await waitFrame();

  if (!directEligible) return true;
  const addButton = document.querySelector("#addToCart");
  const configurableInputs = document.querySelectorAll("#modifierGroups input");
  if (addButton && !addButton.disabled && configurableInputs.length === 0) {
    addButton.click();
  }
  return true;
}

function renderQuickOrder(panel, highlights) {
  const grid = panel.querySelector("#homepageQuickOrderGrid");
  if (!grid) return;
  if (!highlights.length) {
    grid.innerHTML = '<div class="notice">Aktuell sind keine online konfigurierbaren Highlights verfügbar.</div>';
    return;
  }

  grid.innerHTML = highlights.map(({ category, product }) => {
    const directEligible = (product.modifierGroups || []).length === 0;
    const action = directEligible ? "Direkt hinzufügen" : "Schnell konfigurieren";
    return `<article class="recommendation-card" data-home-quick-product="${esc(product.id)}">
      <div><strong>${esc(product.name)}</strong><small>${esc(category.name)} · ab ${euro.format(Number(product.basePriceCents || 0) / 100)}</small></div>
      <button class="ghost-btn" data-home-quick-action data-category-id="${esc(category.id)}" data-product-id="${esc(product.id)}" data-direct="${directEligible ? "true" : "false"}">${action}</button>
    </article>`;
  }).join("");

  grid.querySelectorAll("[data-home-quick-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const opened = await openQuickProduct(
        button.dataset.categoryId,
        button.dataset.productId,
        button.dataset.direct === "true",
      );
      button.disabled = false;
      if (!opened) {
        const notice = document.createElement("div");
        notice.className = "notice";
        notice.textContent = "Dieses Highlight hat sich gerade geändert. Bitte über die Speisekarte neu auswählen.";
        grid.prepend(notice);
      }
    });
  });
}

async function installHomepageComposition() {
  const panel = ensureQuickOrderPanel();
  ensureStoryTeamSlot();
  if (!panel) return;
  const menu = await loadCurrentMenu();
  renderQuickOrder(panel, selectCategoryHighlights(menu));
}

installHomepageComposition();
