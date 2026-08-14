import { connectPostgresRealtime } from "./realtime-client.js";

let catalog = { categories: [], products: [], modifierGroups: [] };
let loading = false;
const productTarget = document.querySelector("#productOps");
const modifierTarget = document.querySelector("#modifierOps");
const message = document.querySelector("#opsMessage");

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

await loadCatalog();
connectPostgresRealtime({
  sessionEndpoint: "/api/ops/realtime-session",
  topic: "realtime:mcello-ops",
  changes: (session) => [
    { event: "*", schema: "public", table: "snoozes", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "menu_products", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "modifier_options" },
  ],
  onChange: () => loadCatalog(),
  onStatus: setRealtimeStatus,
  reconciliationMs: 30_000,
});
