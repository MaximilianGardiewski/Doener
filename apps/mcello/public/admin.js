import { connectPostgresRealtime } from "./realtime-client.js";

let catalog = { categories: [], products: [] };
let loading = false;
let dirty = false;
let externalChangePending = false;
const categoryTarget = document.querySelector("#categoryAdmin");
const productTarget = document.querySelector("#productAdmin");
const message = document.querySelector("#adminMessage");
const search = document.querySelector("#productSearch");
const categoryFilter = document.querySelector("#categoryFilter");

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function euros(cents) {
  return (Number(cents || 0) / 100).toFixed(2).replace(".", ",");
}

function cents(value) {
  const normalized = String(value || "0").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : NaN;
}

function defaultSnoozeUntil() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(3, 0, 0, 0);
  return date.toISOString();
}

function formStatusOptions(current) {
  return ["draft", "published", "archived"].map((value) => `<option value="${value}" ${value === current ? "selected" : ""}>${value}</option>`).join("");
}

function renderCategoryFilter() {
  const previous = categoryFilter.value;
  categoryFilter.innerHTML = '<option value="">Alle Kategorien</option>' + catalog.categories.map((category) => `<option value="${category.id}">${esc(category.name)}</option>`).join("");
  if ([...categoryFilter.options].some((option) => option.value === previous)) categoryFilter.value = previous;
}

function categoryForm(category = {}) {
  const id = category.id || "";
  return `<div class="category-card" data-category-card="${id || "new"}">
    <form class="admin-form category-form" data-id="${id}">
      <input name="name" value="${esc(category.name || "")}" placeholder="Kategoriename" required />
      <input name="slug" value="${esc(category.slug || "")}" placeholder="slug" required />
      <textarea name="description" placeholder="Beschreibung">${esc(category.description || "")}</textarea>
      <div class="form-row">
        <input name="sort" type="number" value="${Number(category.sort ?? 100)}" placeholder="Sortierung" />
        <select name="status">${formStatusOptions(category.status || "draft")}</select>
      </div>
      <div class="checks"><label><input name="visible" type="checkbox" ${category.visible !== false ? "checked" : ""}/> sichtbar</label></div>
      <div class="actions"><button class="admin-btn primary" type="submit">Kategorie speichern</button></div>
    </form>
  </div>`;
}

function renderCategories(extraNew = false) {
  categoryTarget.innerHTML = `${extraNew ? categoryForm({}) : ""}${catalog.categories.map(categoryForm).join("")}`;
  categoryTarget.querySelectorAll(".category-form").forEach((form) => {
    const nameInput = form.elements.name;
    const slugInput = form.elements.slug;
    nameInput.addEventListener("input", () => {
      dirty = true;
      if (!form.dataset.id && !slugInput.dataset.touched) slugInput.value = slugify(nameInput.value);
    });
    slugInput.addEventListener("input", () => { dirty = true; slugInput.dataset.touched = "1"; });
    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("submit", (event) => saveCategory(event, form));
  });
}

function productForm(product = {}) {
  const id = product.id || "";
  const categoryOptions = catalog.categories.map((category) => `<option value="${category.id}" ${category.id === product.categoryId ? "selected" : ""}>${esc(category.name)}</option>`).join("");
  const soldOut = Boolean(product.soldOut);
  return `<details class="product-card" data-product-card data-name="${esc(product.name || "")}" data-category="${esc(product.categoryId || "")}" ${id ? "" : "open"}>
    <summary><span><strong>${esc(product.name || "Neues Produkt")}</strong> <span class="badge">${esc(product.status || "draft")}</span></span><span>${id ? euros(product.basePriceCents) + " €" : "neu"}</span></summary>
    <form class="admin-form product-form" data-id="${id}">
      <div class="form-row"><input name="name" value="${esc(product.name || "")}" placeholder="Produktname" required/><input name="slug" value="${esc(product.slug || "")}" placeholder="slug" required/></div>
      <textarea name="description" placeholder="Beschreibung">${esc(product.description || "")}</textarea>
      <div class="form-row"><select name="categoryId" required><option value="">Kategorie wählen …</option>${categoryOptions}</select><input name="price" value="${euros(product.basePriceCents)}" inputmode="decimal" placeholder="Preis in €" required/></div>
      <div class="form-row"><input name="sort" type="number" value="${Number(product.sort ?? 100)}" placeholder="Sortierung"/><select name="status">${formStatusOptions(product.status || "draft")}</select></div>
      <div class="checks">
        <label><input name="bestseller" type="checkbox" ${product.bestseller ? "checked" : ""}/> Bestseller</label>
        <label><input name="orderableOnline" type="checkbox" ${product.orderableOnline !== false ? "checked" : ""}/> online bestellbar</label>
        <label><input name="ownerConfirmed" type="checkbox" ${product.ownerConfirmed ? "checked" : ""}/> vom Inhaber bestätigt</label>
      </div>
      <div class="actions">
        <button class="admin-btn primary" type="submit">Produkt speichern</button>
        ${id ? `<button class="admin-btn ${soldOut ? "good" : "danger"}" type="button" data-snooze-product="${id}" data-active="${soldOut ? "1" : "0"}">${soldOut ? "Wieder verfügbar" : "Heute ausverkauft"}</button>` : ""}
      </div>
    </form>
  </details>`;
}

function renderProducts(extraNew = false) {
  const query = search.value.trim().toLowerCase();
  const categoryId = categoryFilter.value;
  const filtered = catalog.products.filter((product) => {
    if (categoryId && product.categoryId !== categoryId) return false;
    if (query && !`${product.name} ${product.description || ""}`.toLowerCase().includes(query)) return false;
    return true;
  });
  productTarget.innerHTML = `${extraNew ? productForm({ categoryId: categoryId || catalog.categories[0]?.id }) : ""}${filtered.map(productForm).join("")}` || '<p class="empty">Keine Produkte gefunden.</p>';
  productTarget.querySelectorAll(".product-form").forEach((form) => {
    const nameInput = form.elements.name;
    const slugInput = form.elements.slug;
    nameInput.addEventListener("input", () => {
      dirty = true;
      if (!form.dataset.id && !slugInput.dataset.touched) slugInput.value = slugify(nameInput.value);
    });
    slugInput.addEventListener("input", () => { dirty = true; slugInput.dataset.touched = "1"; });
    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("submit", (event) => saveProduct(event, form));
  });
  productTarget.querySelectorAll("[data-snooze-product]").forEach((button) => button.addEventListener("click", () => toggleSnooze(button)));
}

function render() {
  renderCategoryFilter();
  renderCategories();
  renderProducts();
}

async function loadCatalog({ force = false } = {}) {
  if (loading) return;
  if (dirty && !force) {
    externalChangePending = true;
    message.textContent = "Auf einem anderen Gerät wurde etwas geändert. Speichere zuerst oder klicke „Neu laden“.";
    return;
  }
  loading = true;
  try {
    const response = await fetch("/api/admin/catalog", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Admin-Katalog nicht verfügbar");
    catalog = data;
    dirty = false;
    externalChangePending = false;
    message.textContent = "";
    render();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    loading = false;
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Änderung abgelehnt");
  return data;
}

async function saveCategory(event, form) {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await postJson("/api/admin/category/save", {
      id: form.dataset.id || null,
      name: form.elements.name.value.trim(),
      slug: form.elements.slug.value.trim(),
      description: form.elements.description.value.trim(),
      sort: Number(form.elements.sort.value || 100),
      status: form.elements.status.value,
      visible: form.elements.visible.checked,
    });
    dirty = false;
    message.textContent = "Kategorie gespeichert.";
    await loadCatalog({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveProduct(event, form) {
  event.preventDefault();
  const price = cents(form.elements.price.value);
  if (!Number.isFinite(price)) {
    message.textContent = "Bitte einen gültigen Preis eingeben.";
    return;
  }
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await postJson("/api/admin/product/save", {
      id: form.dataset.id || null,
      categoryId: form.elements.categoryId.value,
      name: form.elements.name.value.trim(),
      slug: form.elements.slug.value.trim(),
      description: form.elements.description.value.trim(),
      basePriceCents: price,
      sort: Number(form.elements.sort.value || 100),
      status: form.elements.status.value,
      bestseller: form.elements.bestseller.checked,
      orderableOnline: form.elements.orderableOnline.checked,
      ownerConfirmed: form.elements.ownerConfirmed.checked,
    });
    dirty = false;
    message.textContent = "Produkt gespeichert.";
    await loadCatalog({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function toggleSnooze(button) {
  const active = button.dataset.active === "1";
  button.disabled = true;
  try {
    await postJson(active ? "/api/admin/unsnooze" : "/api/admin/snooze", {
      type: "product",
      id: button.dataset.snoozeProduct,
      untilAt: active ? undefined : defaultSnoozeUntil(),
      reason: "Heute ausverkauft",
    });
    await loadCatalog({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function setRealtimeStatus(status) {
  const dot = document.querySelector("#adminDot");
  const text = document.querySelector("#adminSync");
  dot.classList.toggle("offline", status !== "subscribed");
  text.textContent = ({
    connecting: "Realtime verbindet …",
    subscribed: "Realtime · live",
    reconnecting: "Realtime verbindet neu …",
    degraded: "Realtime gestört · Safety-Sync",
  })[status] || status;
}

search.addEventListener("input", () => renderProducts());
categoryFilter.addEventListener("change", () => renderProducts());
document.querySelector("#newCategory").addEventListener("click", () => renderCategories(true));
document.querySelector("#newProduct").addEventListener("click", () => renderProducts(true));
document.querySelector("#reloadAdmin").addEventListener("click", () => loadCatalog({ force: true }));

await loadCatalog({ force: true });
connectPostgresRealtime({
  sessionEndpoint: "/api/admin/realtime-session",
  topic: "realtime:mcello-admin",
  changes: (session) => [
    { event: "*", schema: "public", table: "menu_products", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "snoozes", filter: `location_id=eq.${session.locationId}` },
  ],
  onChange: () => loadCatalog(),
  onStatus: setRealtimeStatus,
  reconciliationMs: 30_000,
});
