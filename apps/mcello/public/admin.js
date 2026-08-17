import { connectPostgresRealtime } from "./realtime-client.js";

let catalog = { categories: [], products: [], modifierGroups: [], crossSellRules: [] };
let loading = false;
let dirty = false;
let externalChangePending = false;
let directSessionCache = null;
const categoryTarget = document.querySelector("#categoryAdmin");
const productTarget = document.querySelector("#productAdmin");
const modifierTarget = document.querySelector("#modifierAdmin");
const crossSellRuleTarget = document.querySelector("#crossSellRuleAdmin");
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

function cents(value, { signed = false } = {}) {
  const normalized = String(value || "0").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || (!signed && amount < 0)) return NaN;
  return Math.round(amount * 100);
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

function modifierAssignment(product = {}) {
  if (!catalog.modifierGroups.length) {
    return '<p class="muted-help">Noch keine zentralen Zutaten-/Extra-Gruppen vorhanden.</p>';
  }
  const selected = new Set(product.modifierGroupIds || []);
  return `<fieldset class="group-assignment">
    <legend>Zutaten-/Saucen-/Extra-Gruppen</legend>
    <div class="checks">${catalog.modifierGroups.map((group) => `
      <label><input type="checkbox" name="modifierGroupIds" value="${group.id}" ${selected.has(group.id) ? "checked" : ""}/> ${esc(group.name)}</label>
    `).join("")}</div>
  </fieldset>`;
}

function crossSellAssignment(product = {}) {
  const candidates = catalog.products.filter((candidate) => candidate.id && candidate.id !== product.id);
  if (!candidates.length) {
    return '<p class="muted-help">Für direkte „Passt dazu“-Paare wird mindestens ein weiteres Produkt benötigt.</p>';
  }
  const selected = new Set(product.crossSellIds || []);
  return `<fieldset class="cross-sell-assignment">
    <legend>Direkte „Passt dazu“-Produkte</legend>
    <select name="crossSellIds" multiple aria-label="Direkt empfohlene Produkte">
      ${candidates.map((candidate) => `<option value="${candidate.id}" ${selected.has(candidate.id) ? "selected" : ""}>${esc(candidate.name)}</option>`).join("")}
    </select>
    <p class="muted-help">Mehrfachauswahl: Strg/Cmd gedrückt halten. Die Reihenfolge folgt der Produktliste.</p>
  </fieldset>`;
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
      ${modifierAssignment(product)}
      ${crossSellAssignment(product)}
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
  productTarget.querySelectorAll("[data-snooze-product]").forEach((button) => button.addEventListener("click", () => toggleProductSnooze(button)));
}

function modifierOptionForm(group, option = {}) {
  const id = option.id || "";
  const soldOut = Boolean(option.soldOut);
  return `<form class="option-row modifier-option-form" data-id="${id}" data-group-id="${group.id}">
    <input name="name" value="${esc(option.name || "")}" placeholder="Option, z. B. Knoblauch" required />
    <input name="price" value="${euros(option.priceDeltaCents)}" inputmode="decimal" placeholder="Aufpreis €" title="Preisänderung in Euro" />
    <input name="sort" type="number" value="${Number(option.sort ?? 100)}" placeholder="Sort" />
    <label class="wide-label"><input name="defaultSelected" type="checkbox" ${option.defaultSelected ? "checked" : ""}/> Standard</label>
    <label class="wide-label"><input name="active" type="checkbox" ${option.active !== false ? "checked" : ""}/> aktiv</label>
    <div class="actions">
      <button class="admin-btn primary" type="submit">Speichern</button>
      ${id ? `<button class="admin-btn ${soldOut ? "good" : "danger"}" type="button" data-snooze-modifier="${id}" data-active="${soldOut ? "1" : "0"}">${soldOut ? "Wieder da" : "Ausverkauft"}</button>` : ""}
    </div>
  </form>`;
}

function modifierGroupCard(group = {}) {
  const id = group.id || "";
  const options = group.options || [];
  return `<details class="modifier-card" ${id ? "" : "open"}>
    <summary><span><strong>${esc(group.name || "Neue Gruppe")}</strong></span><span class="badge">${id ? `${Number(group.minSelections || 0)}–${Number(group.maxSelections ?? 1)} Auswahl` : "neu"}</span></summary>
    <form class="admin-form modifier-group-form" data-id="${id}">
      <input name="name" value="${esc(group.name || "")}" placeholder="Gruppe, z. B. Saucen / Zutaten / Extras" required />
      <div class="form-row three">
        <label>Min.<input name="minSelections" type="number" min="0" value="${Number(group.minSelections ?? 0)}" required /></label>
        <label>Max.<input name="maxSelections" type="number" min="0" value="${Number(group.maxSelections ?? 1)}" required /></label>
        <label>Sort.<input name="sort" type="number" value="${Number(group.sort ?? 100)}" /></label>
      </div>
      <div class="actions"><button class="admin-btn primary" type="submit">Gruppe speichern</button></div>
    </form>
    ${id ? `<div class="modifier-options">
      <p class="muted-help">Optionen · Aufpreis kann 0,00 € sein. „Standard“ darf die Maximalanzahl der Gruppe nicht überschreiten.</p>
      ${options.map((option) => modifierOptionForm(group, option)).join("")}
      <div data-new-option-target="${id}"></div>
      <button class="admin-btn" type="button" data-new-option="${id}">+ Option</button>
    </div>` : '<p class="muted-help">Speichere die Gruppe zuerst, danach kannst du Optionen anlegen.</p>'}
  </details>`;
}

function renderModifierGroups(extraNew = false) {
  modifierTarget.innerHTML = `${extraNew ? modifierGroupCard({}) : ""}${catalog.modifierGroups.map(modifierGroupCard).join("")}` || '<p class="empty">Noch keine Zutaten-/Extra-Gruppen.</p>';
  modifierTarget.querySelectorAll(".modifier-group-form").forEach((form) => {
    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("submit", (event) => saveModifierGroup(event, form));
  });
  bindModifierOptionForms();
  modifierTarget.querySelectorAll("[data-new-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = catalog.modifierGroups.find((candidate) => candidate.id === button.dataset.newOption);
      const target = modifierTarget.querySelector(`[data-new-option-target="${button.dataset.newOption}"]`);
      if (!group || !target) return;
      target.innerHTML = modifierOptionForm(group, {});
      bindModifierOptionForms(target);
    });
  });
}

function bindModifierOptionForms(root = modifierTarget) {
  root.querySelectorAll(".modifier-option-form").forEach((form) => {
    if (form.dataset.bound) return;
    form.dataset.bound = "1";
    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("submit", (event) => saveModifierOption(event, form));
  });
  root.querySelectorAll("[data-snooze-modifier]").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => toggleModifierSnooze(button));
  });
}

function ruleReferenceOptions(kind, current = "") {
  let choices = [];
  if (kind === "category") {
    choices = catalog.categories.map((category) => ({ id: category.id, label: category.name }));
  } else if (kind === "option") {
    choices = catalog.modifierGroups.flatMap((group) => (group.options || []).map((option) => ({
      id: option.id,
      label: `${group.name} · ${option.name}`,
    })));
  } else if (kind === "product") {
    choices = catalog.products.map((product) => ({ id: product.id, label: product.name }));
  }
  return '<option value="">Bitte wählen …</option>' + choices.map((choice) => (
    `<option value="${choice.id}" ${choice.id === current ? "selected" : ""}>${esc(choice.label)}</option>`
  )).join("");
}

function crossSellRuleForm(rule = {}) {
  const triggerKind = rule.triggerModifierOptionId ? "option" : "category";
  const triggerReference = rule.triggerModifierOptionId || rule.triggerCategoryId || "";
  const targetKind = rule.suggestedProductId ? "product" : "category";
  const targetReference = rule.suggestedProductId || rule.suggestedCategoryId || "";
  const id = rule.id || "";
  return `<article class="rule-card">
    <form class="admin-form cross-sell-rule-form" data-id="${id}">
      <input name="name" maxlength="120" value="${esc(rule.name || "")}" placeholder="Regelname, z. B. Getränk zu Hauptgericht" required />
      <div class="form-row">
        <label>Auslöser<select name="triggerKind"><option value="category" ${triggerKind === "category" ? "selected" : ""}>Produktkategorie</option><option value="option" ${triggerKind === "option" ? "selected" : ""}>gewählte Zutat/Sauce</option></select></label>
        <label>Auswahl<select name="triggerReference" required>${ruleReferenceOptions(triggerKind, triggerReference)}</select></label>
      </div>
      <div class="form-row">
        <label>Empfehlungsziel<select name="targetKind"><option value="category" ${targetKind === "category" ? "selected" : ""}>Kategorie</option><option value="product" ${targetKind === "product" ? "selected" : ""}>ein Produkt</option></select></label>
        <label>Auswahl<select name="targetReference" required>${ruleReferenceOptions(targetKind, targetReference)}</select></label>
      </div>
      <div class="form-row three">
        <label>Max.<input name="maxSuggestions" type="number" min="1" max="6" value="${Number(rule.maxSuggestions || 3)}" required /></label>
        <label>Sort.<input name="sort" type="number" value="${Number(rule.sort ?? 100)}" /></label>
        <label class="wide-label"><input name="enabled" type="checkbox" ${rule.enabled !== false ? "checked" : ""}/> aktiv</label>
      </div>
      <div class="actions"><button class="admin-btn primary" type="submit">Regel speichern</button>${id ? `<button class="admin-btn danger" type="button" data-delete-cross-sell-rule="${id}">Löschen</button>` : ""}</div>
    </form>
  </article>`;
}

function bindCrossSellRuleForms() {
  crossSellRuleTarget.querySelectorAll(".cross-sell-rule-form").forEach((form) => {
    form.addEventListener("input", () => { dirty = true; });
    form.elements.triggerKind.addEventListener("change", () => {
      form.elements.triggerReference.innerHTML = ruleReferenceOptions(form.elements.triggerKind.value);
    });
    form.elements.targetKind.addEventListener("change", () => {
      form.elements.targetReference.innerHTML = ruleReferenceOptions(form.elements.targetKind.value);
    });
    form.addEventListener("submit", (event) => saveCrossSellRule(event, form));
  });
  crossSellRuleTarget.querySelectorAll("[data-delete-cross-sell-rule]").forEach((button) => {
    button.addEventListener("click", () => deleteCrossSellRule(button.dataset.deleteCrossSellRule, button));
  });
}

function renderCrossSellRules(extraNew = false) {
  crossSellRuleTarget.innerHTML = `${extraNew ? crossSellRuleForm({}) : ""}${catalog.crossSellRules.map(crossSellRuleForm).join("")}`
    || '<p class="muted-help">Noch keine automatische Empfehlungsregel. Direkte Produktpaare können trotzdem schon in den Produktformularen gepflegt werden.</p>';
  bindCrossSellRuleForms();
}

function render() {
  renderCategoryFilter();
  renderCategories();
  renderProducts();
  renderModifierGroups();
  renderCrossSellRules();
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
    const session = await getDirectAdminSession();
    const [response, recommendationConfig] = await Promise.all([
      fetch("/api/admin/catalog", { cache: "no-store" }),
      adminRpcDirect("admin_get_cross_sell_config", { _location_id: session.locationId }),
    ]);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Admin-Katalog nicht verfügbar");
    const crossSellsByProduct = new Map((recommendationConfig.productCrossSells || []).map((entry) => [
      entry.productId,
      Array.isArray(entry.suggestedProductIds) ? entry.suggestedProductIds : [],
    ]));
    catalog = {
      categories: Array.isArray(data.categories) ? data.categories : [],
      products: Array.isArray(data.products) ? data.products.map((product) => ({
        ...product,
        crossSellIds: crossSellsByProduct.get(product.id) || [],
      })) : [],
      modifierGroups: Array.isArray(data.modifierGroups) ? data.modifierGroups : [],
      crossSellRules: Array.isArray(recommendationConfig.rules) ? recommendationConfig.rules : [],
    };
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

async function getDirectAdminSession() {
  if (directSessionCache && directSessionCache.expiresAt > Date.now() + 60_000) return directSessionCache;
  const response = await fetch("/api/admin/realtime-session", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.websocketUrl || !data.accessToken || !data.locationId) {
    throw new Error(data.error || "Admin-Session nicht verfügbar");
  }
  const websocket = new URL(data.websocketUrl);
  const apiKey = websocket.searchParams.get("apikey");
  if (!apiKey) throw new Error("Öffentlicher Supabase-API-Key fehlt in der Session");
  const restProtocol = websocket.protocol === "wss:" ? "https:" : "http:";
  directSessionCache = {
    restBase: `${restProtocol}//${websocket.host}`,
    apiKey,
    accessToken: data.accessToken,
    expiresAt: Number(data.expiresAt || Date.now() + 5 * 60_000),
    locationId: data.locationId,
  };
  return directSessionCache;
}

async function adminRpcDirect(name, args) {
  const session = await getDirectAdminSession();
  const response = await fetch(`${session.restBase}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: session.apiKey,
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    if (response.status === 401) directSessionCache = null;
    throw new Error(data?.message || data?.error || `Admin-RPC ${name} abgelehnt`);
  }
  return data;
}

async function saveCategory(event, form) {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const session = await getDirectAdminSession();
    await adminRpcDirect("admin_save_menu_category", {
      _id: form.dataset.id || null,
      _location_id: session.locationId,
      _name: form.elements.name.value.trim(),
      _slug: form.elements.slug.value.trim(),
      _description: form.elements.description.value.trim(),
      _sort: Number(form.elements.sort.value || 100),
      _status: form.elements.status.value,
      _visible: form.elements.visible.checked,
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
    const session = await getDirectAdminSession();
    const existing = catalog.products.find((product) => product.id === form.dataset.id);
    const groupIds = [...form.querySelectorAll('input[name="modifierGroupIds"]:checked')].map((input) => input.value);
    const crossSellIds = form.elements.crossSellIds
      ? [...form.elements.crossSellIds.selectedOptions].map((option) => option.value)
      : [];
    await adminRpcDirect("admin_save_menu_product_recommended", {
      _id: form.dataset.id || null,
      _location_id: session.locationId,
      _category_id: form.elements.categoryId.value,
      _name: form.elements.name.value.trim(),
      _slug: form.elements.slug.value.trim(),
      _description: form.elements.description.value.trim(),
      _base_price_cents: price,
      _sort: Number(form.elements.sort.value || 100),
      _status: form.elements.status.value,
      _bestseller: form.elements.bestseller.checked,
      _orderable_online: form.elements.orderableOnline.checked,
      _owner_confirmed: form.elements.ownerConfirmed.checked,
      _modifier_group_ids: groupIds,
      _dietary_tags: existing?.dietaryTags || [],
      _allergen_ids: existing?.allergenIds || [],
      _suggested_product_ids: crossSellIds,
    });
    dirty = false;
    message.textContent = "Produkt, Konfigurator-Gruppen, Kennzeichnungen und direkte Empfehlungen gespeichert.";
    await loadCatalog({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveModifierGroup(event, form) {
  event.preventDefault();
  const minSelections = Number(form.elements.minSelections.value);
  const maxSelections = Number(form.elements.maxSelections.value);
  if (!Number.isInteger(minSelections) || !Number.isInteger(maxSelections) || minSelections < 0 || maxSelections < minSelections) {
    message.textContent = "Ungültige Min-/Max-Auswahl für die Gruppe.";
    return;
  }
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const session = await getDirectAdminSession();
    await adminRpcDirect("admin_save_modifier_group", {
      _id: form.dataset.id || null,
      _location_id: session.locationId,
      _name: form.elements.name.value.trim(),
      _min_selections: minSelections,
      _max_selections: maxSelections,
      _sort: Number(form.elements.sort.value || 100),
    });
    dirty = false;
    message.textContent = "Zutaten-/Extra-Gruppe gespeichert.";
    await loadCatalog({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveModifierOption(event, form) {
  event.preventDefault();
  const priceDelta = cents(form.elements.price.value, { signed: true });
  if (!Number.isFinite(priceDelta)) {
    message.textContent = "Bitte einen gültigen Aufpreis eingeben.";
    return;
  }
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await adminRpcDirect("admin_save_modifier_option", {
      _id: form.dataset.id || null,
      _group_id: form.dataset.groupId,
      _name: form.elements.name.value.trim(),
      _price_delta_cents: priceDelta,
      _default_selected: form.elements.defaultSelected.checked,
      _active: form.elements.active.checked,
      _sort: Number(form.elements.sort.value || 100),
    });
    dirty = false;
    message.textContent = "Option gespeichert.";
    await loadCatalog({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveCrossSellRule(event, form) {
  event.preventDefault();
  const triggerKind = form.elements.triggerKind.value;
  const targetKind = form.elements.targetKind.value;
  const triggerReference = form.elements.triggerReference.value || null;
  const targetReference = form.elements.targetReference.value || null;
  if (!triggerReference || !targetReference) {
    message.textContent = "Bitte Auslöser und Empfehlungsziel vollständig auswählen.";
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const session = await getDirectAdminSession();
    await adminRpcDirect("admin_save_cross_sell_rule", {
      _id: form.dataset.id || null,
      _location_id: session.locationId,
      _name: form.elements.name.value.trim(),
      _trigger_category_id: triggerKind === "category" ? triggerReference : null,
      _trigger_modifier_option_id: triggerKind === "option" ? triggerReference : null,
      _suggested_category_id: targetKind === "category" ? targetReference : null,
      _suggested_product_id: targetKind === "product" ? targetReference : null,
      _max_suggestions: Number(form.elements.maxSuggestions.value || 3),
      _sort: Number(form.elements.sort.value || 100),
      _enabled: form.elements.enabled.checked,
    });
    dirty = false;
    message.textContent = "Empfehlungsregel gespeichert.";
    await loadCatalog({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function deleteCrossSellRule(id, button) {
  button.disabled = true;
  try {
    const session = await getDirectAdminSession();
    await adminRpcDirect("admin_delete_cross_sell_rule", {
      _id: id,
      _location_id: session.locationId,
    });
    dirty = false;
    message.textContent = "Empfehlungsregel gelöscht.";
    await loadCatalog({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function toggleProductSnooze(button) {
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

async function toggleModifierSnooze(button) {
  const active = button.dataset.active === "1";
  button.disabled = true;
  try {
    await postJson(active ? "/api/admin/unsnooze" : "/api/admin/snooze", {
      type: "modifier",
      id: button.dataset.snoozeModifier,
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
document.querySelector("#newModifierGroup").addEventListener("click", () => renderModifierGroups(true));
document.querySelector("#newCrossSellRule").addEventListener("click", () => renderCrossSellRules(true));
document.querySelector("#reloadAdmin").addEventListener("click", () => loadCatalog({ force: true }));

await loadCatalog({ force: true });
connectPostgresRealtime({
  sessionEndpoint: "/api/admin/realtime-session",
  topic: "realtime:mcello-admin",
  changes: (session) => [
    { event: "*", schema: "public", table: "menu_products", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "modifier_groups", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "modifier_options" },
    { event: "*", schema: "public", table: "product_modifier_groups" },
    { event: "*", schema: "public", table: "product_cross_sells" },
    { event: "*", schema: "public", table: "cross_sell_rules", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "snoozes", filter: `location_id=eq.${session.locationId}` },
  ],
  onChange: () => loadCatalog(),
  onStatus: setRealtimeStatus,
  reconciliationMs: 30_000,
});
