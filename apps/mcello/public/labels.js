import { connectPostgresRealtime } from "./realtime-client.js";

let catalog = { allergens: [], categories: [], products: [], modifierGroups: [] };
let sessionCache = null;
let loading = false;
const message = document.querySelector("#labelsMessage");
const allergenDefinitions = document.querySelector("#allergenDefinitions");
const productSelect = document.querySelector("#labelProduct");
const productForm = document.querySelector("#productLabelsForm");
const productAllergens = document.querySelector("#productAllergens");
const optionAllergens = document.querySelector("#optionAllergens");
const newAllergenForm = document.querySelector("#newAllergenForm");

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

async function getSession({ force = false } = {}) {
  if (!force && sessionCache && sessionCache.expiresAt > Date.now() + 60_000) return sessionCache;
  const response = await fetch("/api/admin/realtime-session", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.websocketUrl || !data.accessToken || !data.locationId) {
    throw new Error(data.error || "Admin-Session nicht verfügbar");
  }
  const websocket = new URL(data.websocketUrl);
  const apiKey = websocket.searchParams.get("apikey");
  if (!apiKey) throw new Error("Öffentlicher Supabase-API-Key fehlt in der Session");
  sessionCache = {
    restBase: `${websocket.protocol === "wss:" ? "https:" : "http:"}//${websocket.host}`,
    apiKey,
    accessToken: data.accessToken,
    expiresAt: Number(data.expiresAt || Date.now() + 5 * 60_000),
    locationId: data.locationId,
  };
  return sessionCache;
}

async function rpc(name, args, retry = true) {
  const session = await getSession();
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
    if (response.status === 401 && retry) {
      sessionCache = null;
      await getSession({ force: true });
      return rpc(name, args, false);
    }
    throw new Error(data?.message || data?.error || `${name} wurde abgelehnt`);
  }
  return data;
}

function allergenChecks(selectedIds = [], prefix = "allergen") {
  if (!catalog.allergens.length) return '<span class="muted">Noch keine Allergen-Definitionen angelegt.</span>';
  const selected = new Set(selectedIds || []);
  return catalog.allergens.map((allergen) => `
    <label>
      <input type="checkbox" name="${prefix}" value="${allergen.id}" ${selected.has(allergen.id) ? "checked" : ""}/>
      ${allergen.code ? `<strong>${esc(allergen.code)}</strong> · ` : ""}${esc(allergen.name)}
    </label>
  `).join("");
}

function renderAllergenDefinitions() {
  allergenDefinitions.innerHTML = catalog.allergens.map((allergen) => `
    <form class="form allergen-definition" data-id="${allergen.id}">
      <div class="row">
        <input name="code" maxlength="32" value="${esc(allergen.code || "")}" placeholder="Code" />
        <input name="name" maxlength="120" value="${esc(allergen.name || "")}" placeholder="Bezeichnung" required />
        <button class="btn" type="submit">Speichern</button>
      </div>
    </form>
  `).join("") || '<p class="muted">Noch keine Definitionen. Lege sie erst nach fachlicher Prüfung an.</p>';

  allergenDefinitions.querySelectorAll(".allergen-definition").forEach((form) => {
    form.addEventListener("submit", (event) => saveAllergen(event, form));
  });
}

function renderProductPicker() {
  const previous = productSelect.value;
  const categoryById = new Map(catalog.categories.map((category) => [category.id, category.name]));
  productSelect.innerHTML = '<option value="">Gericht wählen …</option>' + catalog.products.map((product) => `
    <option value="${product.id}">${esc(categoryById.get(product.categoryId) || "Ohne Kategorie")} · ${esc(product.name)}</option>
  `).join("");
  if (catalog.products.some((product) => product.id === previous)) productSelect.value = previous;
  else if (catalog.products.length) productSelect.value = catalog.products[0].id;
  renderSelectedProduct();
}

function renderSelectedProduct() {
  const product = catalog.products.find((candidate) => candidate.id === productSelect.value);
  productForm.hidden = !product;
  if (!product) {
    productForm.elements.dietaryTags.value = "";
    productAllergens.innerHTML = '<span class="muted">Gericht wählen.</span>';
    return;
  }
  productForm.elements.dietaryTags.value = (product.dietaryTags || []).join(", ");
  productAllergens.innerHTML = allergenChecks(product.allergenIds || [], "productAllergen");
}

function renderOptionAssignments() {
  optionAllergens.innerHTML = catalog.modifierGroups.map((group) => `
    <div class="card">
      <h3>${esc(group.name)}</h3>
      ${(group.options || []).map((option) => `
        <form class="option-card option-allergen-form" data-option-id="${option.id}">
          <div><strong>${esc(option.name)}</strong>${option.priceDeltaCents ? `<div class="muted">Preisänderung: ${(Number(option.priceDeltaCents) / 100).toFixed(2).replace(".", ",")} €</div>` : ""}</div>
          <div class="checks">${allergenChecks(option.allergenIds || [], "optionAllergen")}</div>
          <button class="btn" type="submit">Zuordnung speichern</button>
        </form>
      `).join("") || '<p class="muted">Keine Optionen.</p>'}
    </div>
  `).join("") || '<p class="muted">Noch keine Konfigurator-Gruppen vorhanden.</p>';

  optionAllergens.querySelectorAll(".option-allergen-form").forEach((form) => {
    form.addEventListener("submit", (event) => saveOptionAllergens(event, form));
  });
}

function render() {
  renderAllergenDefinitions();
  renderProductPicker();
  renderOptionAssignments();
}

async function loadCatalog() {
  if (loading) return;
  loading = true;
  try {
    const session = await getSession();
    const data = await rpc("admin_get_catalog", { _location_id: session.locationId });
    catalog = {
      allergens: Array.isArray(data.allergens) ? data.allergens : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
      products: Array.isArray(data.products) ? data.products : [],
      modifierGroups: Array.isArray(data.modifierGroups) ? data.modifierGroups : [],
    };
    render();
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    loading = false;
  }
}

async function saveAllergen(event, form) {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await rpc("admin_save_allergen", {
      _id: form.dataset.id || null,
      _code: form.elements.code.value.trim() || null,
      _name: form.elements.name.value.trim(),
    });
    message.textContent = "Allergen-Definition gespeichert.";
    await loadCatalog();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveOptionAllergens(event, form) {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const ids = [...form.querySelectorAll('input[name="optionAllergen"]:checked')].map((input) => input.value);
    await rpc("admin_set_modifier_option_allergens", {
      _option_id: form.dataset.optionId,
      _allergen_ids: ids,
    });
    message.textContent = "Option-Allergene gespeichert.";
    await loadCatalog();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

newAllergenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = newAllergenForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await rpc("admin_save_allergen", {
      _id: null,
      _code: newAllergenForm.elements.code.value.trim() || null,
      _name: newAllergenForm.elements.name.value.trim(),
    });
    newAllergenForm.reset();
    message.textContent = "Allergen-Definition angelegt.";
    await loadCatalog();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

productSelect.addEventListener("change", renderSelectedProduct);
productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const product = catalog.products.find((candidate) => candidate.id === productSelect.value);
  if (!product) return;
  const button = productForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const dietaryTags = productForm.elements.dietaryTags.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const allergenIds = [...productForm.querySelectorAll('input[name="productAllergen"]:checked')].map((input) => input.value);
    await rpc("admin_set_product_labels", {
      _product_id: product.id,
      _dietary_tags: dietaryTags,
      _allergen_ids: allergenIds,
    });
    message.textContent = "Gericht-Kennzeichnungen gespeichert.";
    await loadCatalog();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#reloadLabels").addEventListener("click", loadCatalog);

function setRealtimeStatus(status) {
  const dot = document.querySelector("#labelsDot");
  const text = document.querySelector("#labelsSync");
  dot.classList.toggle("offline", status !== "subscribed");
  text.textContent = ({
    connecting: "Realtime verbindet …",
    subscribed: "Realtime · live",
    reconnecting: "Realtime verbindet neu …",
    degraded: "Realtime gestört · Safety-Sync",
  })[status] || status;
}

await loadCatalog();
connectPostgresRealtime({
  sessionEndpoint: "/api/admin/realtime-session",
  topic: "realtime:mcello-labels",
  changes: (session) => [
    { event: "*", schema: "public", table: "allergens" },
    { event: "*", schema: "public", table: "product_allergens" },
    { event: "*", schema: "public", table: "modifier_option_allergens" },
    { event: "*", schema: "public", table: "menu_products", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "modifier_options" },
  ],
  onChange: () => loadCatalog(),
  onStatus: setRealtimeStatus,
  reconciliationMs: 30_000,
});
