const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const lanes = ["incoming", "planned", "preparing", "ready"];
const target = Object.fromEntries(lanes.map((lane) => [lane, document.querySelector(`#${lane}`)]));
let orders = [];
let refreshing = false;
let shopOverride = "auto";
let soundEnabled = false;
let audioContext = null;
let alarmTimer = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function stateToLane(state) {
  return ({ waiting_for_acceptance: "incoming", scheduled: "planned", preparing: "preparing", ready: "ready" })[state];
}

function formatClock(iso) {
  if (!iso) return "jetzt";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function normalize(raw) {
  return {
    id: raw.id,
    number: raw.order_number,
    state: raw.state,
    lane: stateToLane(raw.state),
    customer: raw.customer_first_name,
    comment: raw.comment,
    time: raw.accepted_pickup_at || raw.requested_pickup_at || raw.submitted_at,
    totalCents: raw.total_cents,
    items: (raw.order_items ?? []).map((item) => ({
      name: item.product_name_snapshot,
      quantity: item.quantity,
      comment: item.comment,
      options: (item.order_item_options ?? []).map((option) => option.option_name_snapshot),
    })),
  };
}

function actions(order) {
  if (order.lane === "incoming") return `
    <div class="quick">
      <button data-action="accept" data-id="${order.id}" data-minutes="15">15 Min</button>
      <button data-action="accept" data-id="${order.id}" data-minutes="20">20 Min</button>
      <button data-action="accept" data-id="${order.id}" data-minutes="30">30 Min</button>
    </div>
    <div class="quick">
      <button class="danger" data-action="reject" data-id="${order.id}" data-reason="Zu viel los">Zu viel los</button>
      <button class="danger" data-action="reject" data-id="${order.id}" data-reason="Artikel/Zutat ausverkauft">Ausverkauft</button>
      <button class="danger" data-action="reject" data-id="${order.id}" data-reason="Küche schließt">Küche schließt</button>
    </div>`;
  if (order.lane === "planned") return `<div class="quick"><button data-action="activate" data-id="${order.id}">Jetzt aktivieren</button></div>`;
  if (order.lane === "preparing") return `
    <div class="quick">
      <button data-action="ready" data-id="${order.id}">Fertig</button>
      <button data-action="delay" data-id="${order.id}" data-minutes="5">+5</button>
      <button data-action="delay" data-id="${order.id}" data-minutes="10">+10</button>
      <button data-action="delay" data-id="${order.id}" data-minutes="15">+15</button>
    </div>`;
  return `<div class="quick"><button data-action="complete" data-id="${order.id}">Erledigt</button></div>`;
}

function render() {
  const counts = Object.fromEntries(lanes.map((lane) => [lane, 0]));
  lanes.forEach((lane) => { target[lane].innerHTML = ""; });

  for (const order of orders) {
    if (!order.lane || !target[order.lane]) continue;
    counts[order.lane] += 1;
    const el = document.createElement("article");
    el.className = `order ${order.lane === "incoming" ? "alert" : ""}`;
    const itemHtml = order.items.map((item) => {
      const options = item.options.length ? `<small>${item.options.map(escapeHtml).join(" · ")}</small>` : "";
      const comment = item.comment ? `<small>Wunsch: ${escapeHtml(item.comment)}</small>` : "";
      return `<li><strong>${item.quantity}×</strong> ${escapeHtml(item.name)}${options}${comment}</li>`;
    }).join("");
    el.innerHTML = `
      <div class="order-head"><strong>#${order.number} · ${escapeHtml(order.customer)}</strong><small>${formatClock(order.time)}</small></div>
      <ul>${itemHtml}</ul>
      ${order.comment ? `<p><small>Bestellhinweis: ${escapeHtml(order.comment)}</small></p>` : ""}
      <p><strong>${euro.format(order.totalCents / 100)}</strong></p>${actions(order)}`;
    target[order.lane].appendChild(el);
  }

  for (const lane of lanes) {
    document.querySelector(`#${lane}Count`).textContent = counts[lane];
    if (counts[lane] === 0) target[lane].innerHTML = '<div class="empty">Keine Bestellungen</div>';
  }
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => act(button)));
  syncAlarm();
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const [ordersResponse, shopResponse] = await Promise.all([
      fetch("/api/kds/orders", { cache: "no-store" }),
      fetch("/api/kds/shop-state", { cache: "no-store" }),
    ]);
    if (!ordersResponse.ok || !shopResponse.ok) throw new Error("KDS backend unavailable");
    orders = (await ordersResponse.json()).map(normalize);
    const shop = await shopResponse.json();
    shopOverride = shop.override ?? "auto";
    document.querySelector("#rush").textContent = shopOverride === "pause" ? "Rush/Pause AKTIV" : "Rush/Pause";
    setConnection(true);
    render();
  } catch {
    setConnection(false);
    const error = document.querySelector("#kdsError");
    error.hidden = false;
    error.textContent = "Lokales KDS ist noch nicht verbunden. Starte zuerst das Supabase-Setup-Skript und danach `npm run preview:mcello`.";
  } finally {
    refreshing = false;
  }
}

function setConnection(online) {
  document.querySelector("#syncDot").classList.toggle("offline", !online);
  document.querySelector("#syncText").textContent = online ? "Lokale DB · Sync 1 s" : "Offline";
  if (online) document.querySelector("#kdsError").hidden = true;
}

async function act(button) {
  const body = {
    orderId: button.dataset.id,
    action: button.dataset.action,
  };
  if (button.dataset.minutes) body.minutes = Number(button.dataset.minutes);
  if (button.dataset.reason) body.reason = button.dataset.reason;
  button.disabled = true;
  try {
    const response = await fetch("/api/kds/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("transition rejected");
    await refresh();
  } catch {
    const error = document.querySelector("#kdsError");
    error.hidden = false;
    error.textContent = "Die Aktion wurde vom Backend abgelehnt. Der Bestellstatus wurde neu geladen.";
    await refresh();
  } finally {
    button.disabled = false;
  }
}

document.querySelector("#rush").addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  try {
    const override = shopOverride === "pause" ? "auto" : "pause";
    const response = await fetch("/api/kds/shop-override", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ override, operatorMessage: override === "pause" ? "Online-Bestellungen kurz pausiert" : "" }),
    });
    if (!response.ok) throw new Error("override rejected");
    await refresh();
  } finally {
    event.currentTarget.disabled = false;
  }
});

document.querySelector("#sound").addEventListener("click", async (event) => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
  }
  event.currentTarget.textContent = soundEnabled ? "Ton aktiv" : "Ton aktivieren";
  syncAlarm();
});

function syncAlarm() {
  const hasIncoming = orders.some((order) => order.lane === "incoming");
  if (!soundEnabled || !hasIncoming) {
    clearInterval(alarmTimer);
    alarmTimer = null;
    return;
  }
  if (alarmTimer) return;
  beep();
  alarmTimer = setInterval(beep, 1800);
}

function beep() {
  if (!audioContext || audioContext.state !== "running") return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = 760;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.24);
}

refresh();
setInterval(refresh, 1000);
