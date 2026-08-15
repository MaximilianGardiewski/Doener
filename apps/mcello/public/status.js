const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const token = new URLSearchParams(location.search).get("token");
const $ = (selector) => document.querySelector(selector);
const terminalStates = new Set(["completed", "rejected", "cancelled"]);
let pollTimer = null;
let pollDelay = 2500;
let current = null;

const stateCopy = {
  waiting_for_acceptance: ["Eingegangen", "Mcello hat deine Bestellung erhalten und bestätigt sie gleich."],
  scheduled: ["Bestätigt", "Deine Vorbestellung ist bestätigt und für den gewünschten Zeitpunkt eingeplant."],
  preparing: ["In Zubereitung", "Deine Bestellung wird gerade frisch zubereitet."],
  ready: ["Abholbereit", "Deine Bestellung ist fertig und kann abgeholt werden."],
  completed: ["Abgeholt", "Danke für deine Bestellung bei Mcello."],
  rejected: ["Leider nicht möglich", "Mcello konnte diese Bestellung nicht annehmen."],
  cancelled: ["Storniert", "Diese Bestellung wurde storniert."],
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function formatClock(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function countdownText(iso) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  if (!Number.isFinite(minutes)) return "";
  if (minutes === 0) return "jeden Moment";
  return `noch ca. ${minutes} Minute${minutes === 1 ? "" : "n"}`;
}

function progressRank(state) {
  if (state === "waiting_for_acceptance") return 0;
  if (state === "scheduled" || state === "preparing") return 1;
  if (state === "ready") return 2;
  if (state === "completed") return 3;
  return -1;
}

function paymentCopy(payment) {
  if (payment?.mode === "pay_on_site" && payment?.method === "cash_or_card") {
    return "Vor Ort · bar oder Karte";
  }
  return "Zahlungsart wird bestätigt";
}

function render(status) {
  current = status;
  $("#statusError").classList.add("hidden");
  $("#statusContent").classList.remove("hidden");
  $("#orderNumber").textContent = `Bestellung #${status.orderNumber}`;
  const [title, message] = stateCopy[status.state] ?? ["Bestellstatus", status.state];
  $("#statusTitle").textContent = title;
  $("#statusMessage").textContent = status.rejectionReason
    ? `${message} Grund: ${status.rejectionReason}`
    : message;

  const rank = progressRank(status.state);
  [...document.querySelectorAll("[data-step]")].forEach((step, index) => {
    step.classList.toggle("done", rank > index);
    step.classList.toggle("active", rank === index);
  });

  const eta = status.acceptedPickupAt || status.requestedPickupAt;
  $("#etaBlock").classList.toggle("hidden", !eta || status.state === "rejected" || status.state === "cancelled");
  $("#eta").textContent = eta ? `${formatClock(eta)} Uhr` : "–";
  $("#countdown").textContent = eta && !terminalStates.has(status.state) ? countdownText(eta) : "";

  $("#statusItems").innerHTML = (status.items ?? []).map((item) => {
    const options = (item.options ?? []).map((option) => escapeHtml(option.option)).join(" · ");
    const comment = item.comment ? `<small>Wunsch: ${escapeHtml(item.comment)}</small>` : "";
    return `<div class="status-item"><div><strong>${item.quantity}× ${escapeHtml(item.name)}</strong>${options ? `<small>${options}</small>` : ""}${comment}</div><strong>${euro.format((item.lineTotalCents ?? 0) / 100)}</strong></div>`;
  }).join("") || '<p style="color:var(--muted)">Keine Positionen verfügbar.</p>';
  $("#statusTotal").textContent = euro.format((status.totalCents ?? 0) / 100);
  $("#statusPayment").textContent = paymentCopy(status.payment);
  $("#cancelOrder").classList.toggle("hidden", status.state !== "waiting_for_acceptance");
}

function showError(message) {
  $("#statusContent").classList.add("hidden");
  const box = $("#statusError");
  box.textContent = message;
  box.classList.remove("hidden");
}

async function fetchStatus({ manual = false } = {}) {
  if (!token) {
    showError("Dieser Statuslink ist unvollständig. Bitte öffne den Link aus deiner Bestellbestätigung.");
    return;
  }
  try {
    const response = await fetch(`/api/order-status?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("status unavailable");
    render(await response.json());
    pollDelay = 2500;
    if (!terminalStates.has(current.state)) schedulePoll();
  } catch {
    if (!current) showError("Der Bestellstatus konnte gerade nicht geladen werden.");
    pollDelay = Math.min(manual ? 2500 : pollDelay * 1.7, 15000);
    schedulePoll();
  }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => fetchStatus(), pollDelay);
}

$("#refreshStatus").addEventListener("click", () => {
  clearTimeout(pollTimer);
  fetchStatus({ manual: true });
});

$("#cancelOrder").addEventListener("click", async () => {
  if (!token || current?.state !== "waiting_for_acceptance") return;
  const button = $("#cancelOrder");
  button.disabled = true;
  try {
    const response = await fetch("/api/order-status/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error("not cancellable");
    render(await response.json());
  } catch {
    await fetchStatus({ manual: true });
  } finally {
    button.disabled = false;
  }
});

fetchStatus();
