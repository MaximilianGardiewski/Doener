import { connectPostgresRealtime } from "./realtime-client.js";

let catalog = { categories: [], products: [], modifierGroups: [] };
let shopState = null;
let loading = false;
let shopLoading = false;
const productTarget = document.querySelector("#productOps");
const modifierTarget = document.querySelector("#modifierOps");
const message = document.querySelector("#opsMessage");
const shopMessage = document.querySelector("#shopMessage");
const shopMode = document.querySelector("#shopMode");
const shopModeHelp = document.querySelector("#shopModeHelp");
const shopOperatorMessage = document.querySelector("#shopOperatorMessage");

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function categoryName(id) {
  return catalog.categories.find((category) => category.id === id)?.name || "Ohne Kategorie";
}

function formatUntil(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function defaultSnoozeUntil() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(3, 0, 0, 0);
  return date.toISOString();
}

function renderProducts() {
  const grouped = new Map();
  for (const product of catalog.products) {
    const name = categoryName(product.categoryId);
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(product);
  }
  productTarget.innerHTML = [...grouped.entries()].map(([name, products]) => `
    <div class="group"><h3>${esc(name)}</h3>${products.map((product) => `
      <div class="ops-row">
        <div><strong>${esc(product.name)}</strong><small>${product.soldOut ? `Ausverkauft bis ${formatUntil(product.snoozedUntil)}` : "Verfügbar"}</small></div>
        <button class="ops-btn ${product.soldOut ? "good" : "danger"}" data-kind="product" data-id="${product.id}" data-active="${product.soldOut ? "1" : "0"}">${product.soldOut ? "Wieder da" : "Heute ausverkauft"}</button>
      </div>`).join("")}</div>
  `).join("") || '<p class="empty">Keine Produkte.</p>';
}

function renderModifiers() {
  modifierTarget.innerHTML = catalog.modifierGroups.map((group) => `
    <div class="group"><h3>${esc(group.name)}</h3>${(group.options || []).map((option) => `
      <div class="ops-row">
        <div><strong>${esc(option.name)}</strong><small>${option.soldOut ? `Ausverkauft bis ${formatUntil(option.snoozedUntil)}` : "Verfügbar"}</small></div>
        <button class="ops-btn ${option.soldOut ? "good" : "danger"}" data-kind="modifier" data-id="${option.id}" data-active="${option.soldOut ? "1" : "0"}">${option.soldOut ? "Wieder da" : "Ausverkauft"}</button>
      </div>`).join("")}</div>
  `).join("") || '<p class="empty">Keine strukturierten Optionen.</p>';
}

function renderShopState() {
  const override = shopState?.override || "auto";
  const labels = {
    auto: "Automatik",
    pause: "Online-Bestellungen pausiert",
    today_closed: "Heute geschlossen",
    force_closed: "Online-Bestellungen geschlossen",
    force_open: "Development: erzwungen geöffnet",
  };
  shopMode.textContent = labels[override] || override;

  if (override === "auto") {
    const closeMinutes = shopState?.minutesUntilScheduledClose;
    shopModeHelp.textContent = shopState?.scheduledOpen
      ? `Nach Öffnungsplan geöffnet${Number.isFinite(closeMinutes) ? ` · noch ca. ${closeMinutes} Min. bis Schließung` : ""}.`
      : "Nach Öffnungsplan aktuell geschlossen.";
  } else if (override === "pause") {
    shopModeHelp.textContent = "Neue Online-Bestellungen sind blockiert, bis das Team auf Automatik zurückstellt.";
  } else if (override === "today_closed") {
    shopModeHelp.textContent = "Für heute manuell geschlossen. Rückkehr zur Automatik erfolgt bewusst durch das Team.";
  } else if (override === "force_closed") {
    shopModeHelp.textContent = "Online-Bestellungen sind manuell geschlossen, unabhängig vom Öffnungsplan.";
  } else {
    shopModeHelp.textContent = "Dieser Zustand stammt aus der Development-Konfiguration und kann vom Staff nicht gesetzt werden.";
  }

  document.querySelectorAll("[data-shop-override]").forEach((button) => {
    button.classList.toggle("active", button.dataset.shopOverride === override);
  });
  if (document.activeElement !== shopOperatorMessage) {
    shopOperatorMessage.value = shopState?.operatorMessage || "";
  }
}

function bindButtons() {
  document.querySelectorAll("[data-kind][data-id]").forEach((button) => {
    button.addEventListener("click", () => toggleAvailability(button));
  });
}

function render() {
  renderProducts();
  renderModifiers();
  bindButtons();
}

async function loadCatalog() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch("/api/ops/catalog", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Betriebskatalog nicht verfügbar");
    catalog = data;
    message.textContent = "";
    render();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    loading = false;
  }
}

async function loadShopState() {
  if (shopLoading) return;
  shopLoading = true;
  try {
    const response = await fetch("/api/kds/shop-state", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Betriebsstatus nicht verfügbar");
    shopState = data;
    shopMessage.textContent = "";
    renderShopState();
  } catch (error) {
    shopMessage.textContent = error.message;
  } finally {
    shopLoading = false;
  }
}

async function toggleAvailability(button) {
  const active = button.dataset.active === "1";
  button.disabled = true;
  try {
    const response = await fetch(active ? "/api/ops/unsnooze" : "/api/ops/snooze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: button.dataset.kind,
        id: button.dataset.id,
        untilAt: active ? undefined : defaultSnoozeUntil(),
        reason: "Heute ausverkauft",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Änderung abgelehnt");
    await loadCatalog();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function setShopOverride(button) {
  const override = button.dataset.shopOverride;
  button.disabled = true;
  try {
    const response = await fetch("/api/kds/shop-override", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        override,
        operatorMessage: shopOperatorMessage.value.trim(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Betriebsmodus wurde abgelehnt");
    shopMessage.textContent = "Betriebsmodus aktualisiert.";
    await loadShopState();
  } catch (error) {
    shopMessage.textContent = error.message;
    await loadShopState();
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll("[data-shop-override]").forEach((button) => {
  button.addEventListener("click", () => setShopOverride(button));
});

function setRealtimeStatus(status) {
  const dot = document.querySelector("#opsDot");
  const text = document.querySelector("#opsSync");
  dot.classList.toggle("offline", status !== "subscribed");
  text.textContent = ({
    connecting: "Realtime verbindet …",
    subscribed: "Realtime · live",
    reconnecting: "Realtime verbindet neu …",
    degraded: "Realtime gestört · Safety-Sync",
  })[status] || status;
}

await Promise.all([loadCatalog(), loadShopState()]);
connectPostgresRealtime({
  sessionEndpoint: "/api/ops/realtime-session",
  topic: "realtime:mcello-ops",
  changes: (session) => [
    { event: "*", schema: "public", table: "snoozes", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "menu_products", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "modifier_options" },
    { event: "*", schema: "public", table: "ordering_settings", filter: `location_id=eq.${session.locationId}` },
  ],
  onChange: () => Promise.all([loadCatalog(), loadShopState()]),
  onStatus: setRealtimeStatus,
  reconciliationMs: 30_000,
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) Promise.all([loadCatalog(), loadShopState()]);
});
