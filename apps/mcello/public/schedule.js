import { connectPostgresRealtime } from "./realtime-client.js";

const weekdays = [
  [1, "Montag"], [2, "Dienstag"], [3, "Mittwoch"], [4, "Donnerstag"],
  [5, "Freitag"], [6, "Samstag"], [7, "Sonntag"],
];

let schedule = {
  openingHours: [], specialOpeningHours: [], orderingSettings: null,
  availabilityRules: [], products: [], categories: [], timezone: "Europe/Berlin",
};
let sessionCache = null;
let loading = false;
const message = document.querySelector("#scheduleMessage");
const weeklyTarget = document.querySelector("#weeklyHours");
const settingsForm = document.querySelector("#orderingSettingsForm");
const specialForm = document.querySelector("#specialForm");
const specialList = document.querySelector("#specialList");
const ruleForm = document.querySelector("#ruleForm");
const ruleList = document.querySelector("#ruleList");

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

async function getSession({ force = false } = {}) {
  if (!force && sessionCache && sessionCache.expiresAt > Date.now() + 60_000) return sessionCache;
  const response = await fetch("/api/admin/realtime-session", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.websocketUrl || !data.accessToken || !data.locationId) throw new Error(data.error || "Admin-Session nicht verfügbar");
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

function dayRows(weekday) {
  return schedule.openingHours.filter((row) => Number(row.weekday) === weekday);
}

function intervalHtml(row = {}) {
  return `<div class="interval">
    <input class="opens-at" type="time" value="${esc(row.opensAt || "")}" aria-label="Öffnet" />
    <input class="closes-at" type="time" value="${esc(row.closesAt || "")}" aria-label="Schließt" />
    <button class="btn danger remove-interval" type="button">Entfernen</button>
  </div>`;
}

function renderWeekly() {
  weeklyTarget.innerHTML = weekdays.map(([weekday, label]) => {
    const rows = dayRows(weekday);
    const explicitlyClosed = rows.some((row) => row.closed);
    const openRows = rows.filter((row) => !row.closed);
    return `<div class="day-card" data-weekday="${weekday}">
      <div class="day-head">
        <strong>${label}</strong>
        <label><input class="closed-day" type="checkbox" ${explicitlyClosed || !rows.length ? "checked" : ""}/> geschlossen</label>
        <button class="btn add-interval" type="button">+ Zeitfenster</button>
      </div>
      <div class="intervals">${openRows.map(intervalHtml).join("")}</div>
    </div>`;
  }).join("");

  weeklyTarget.querySelectorAll(".day-card").forEach((card) => {
    const closed = card.querySelector(".closed-day");
    const intervals = card.querySelector(".intervals");
    const sync = () => {
      intervals.hidden = closed.checked;
      card.querySelector(".add-interval").disabled = closed.checked;
    };
    closed.addEventListener("change", () => {
      if (!closed.checked && !intervals.children.length) intervals.insertAdjacentHTML("beforeend", intervalHtml({ opensAt: "11:00", closesAt: "22:00" }));
      bindIntervalRemovers(card);
      sync();
    });
    card.querySelector(".add-interval").addEventListener("click", () => {
      closed.checked = false;
      intervals.insertAdjacentHTML("beforeend", intervalHtml({}));
      bindIntervalRemovers(card);
      sync();
    });
    bindIntervalRemovers(card);
    sync();
  });
}

function bindIntervalRemovers(root) {
  root.querySelectorAll(".remove-interval").forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => button.closest(".interval")?.remove());
  });
}

function collectWeeklyRows() {
  const rows = [];
  weeklyTarget.querySelectorAll(".day-card").forEach((card) => {
    const weekday = Number(card.dataset.weekday);
    if (card.querySelector(".closed-day").checked) {
      rows.push({ weekday, opensAt: null, closesAt: null, closed: true, sort: 0 });
      return;
    }
    const intervals = [...card.querySelectorAll(".interval")];
    if (!intervals.length) throw new Error(`${weekdays.find(([id]) => id === weekday)?.[1]} braucht mindestens ein Zeitfenster oder „geschlossen“.`);
    intervals.forEach((interval, index) => {
      const opensAt = interval.querySelector(".opens-at").value;
      const closesAt = interval.querySelector(".closes-at").value;
      if (!opensAt || !closesAt) throw new Error("Bitte alle Öffnungs- und Schließzeiten ausfüllen.");
      rows.push({ weekday, opensAt, closesAt, closed: false, sort: (index + 1) * 10 });
    });
  });
  return rows;
}

function renderSettings() {
  const settings = schedule.orderingSettings || {};
  for (const [name, value] of Object.entries({
    orderCutoffMinutes: settings.orderCutoffMinutes ?? 30,
    acceptanceTimeoutMinutes: settings.acceptanceTimeoutMinutes ?? 5,
    slotMinutes: settings.slotMinutes ?? 15,
    slotCapacity: settings.slotCapacity ?? 6,
    preparationLeadMinutes: settings.preparationLeadMinutes ?? 25,
  })) {
    if (settingsForm.elements[name]) settingsForm.elements[name].value = value;
  }
  settingsForm.elements.onlineOrderingEnabled.checked = settings.onlineOrderingEnabled !== false;
  settingsForm.elements.pickupEnabled.checked = settings.pickupEnabled !== false;
  settingsForm.elements.deliveryEnabled.checked = Boolean(settings.deliveryEnabled);
}

function formatSpecial(row) {
  const state = row.closed ? "geschlossen" : `${row.opensAt}–${row.closesAt}`;
  return `<div class="special-card list-row">
    <div><strong>${esc(row.day)}</strong> · ${esc(state)}${row.publicNote ? `<div class="muted">${esc(row.publicNote)}</div>` : ""}</div>
    <button class="btn danger" data-delete-special="${row.id}" type="button">Löschen</button>
  </div>`;
}

function renderSpecials() {
  specialList.innerHTML = schedule.specialOpeningHours.map(formatSpecial).join("") || '<p class="muted">Keine Sondertage eingetragen.</p>';
  specialList.querySelectorAll("[data-delete-special]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await rpc("admin_delete_special_opening_hour", { _id: button.dataset.deleteSpecial });
      await loadSchedule();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  }));
}

function weekdayName(value) {
  return weekdays.find(([id]) => id === Number(value))?.[1] || "jeden Tag";
}

function ruleTarget(row) {
  return row.productId ? `Gericht · ${row.productName || row.productId}` : `Kategorie · ${row.categoryName || row.categoryId}`;
}

function renderRules() {
  ruleList.innerHTML = schedule.availabilityRules.map((row) => `<div class="rule-card list-row">
    <div>
      <strong>${esc(ruleTarget(row))}</strong>
      <div class="rule-meta">
        <span class="badge">${esc(weekdayName(row.weekday))}</span>
        <span class="badge">${row.startsAt && row.endsAt ? `${esc(row.startsAt)}–${esc(row.endsAt)}` : "ganztägig"}</span>
        ${row.validFrom || row.validUntil ? `<span class="badge">${esc(row.validFrom || "…")} → ${esc(row.validUntil || "…")}</span>` : ""}
        <span class="badge">${row.enabled ? "aktiv" : "inaktiv"}</span>
      </div>
    </div>
    <button class="btn danger" data-delete-rule="${row.id}" type="button">Löschen</button>
  </div>`).join("") || '<p class="muted">Keine zeitgesteuerten Regeln. Ohne Regel ist ein veröffentlichtes, online bestellbares Gericht grundsätzlich verfügbar.</p>';
  ruleList.querySelectorAll("[data-delete-rule]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await rpc("admin_delete_availability_rule", { _id: button.dataset.deleteRule });
      await loadSchedule();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  }));
}

function fillRuleSelectors() {
  const weekdaySelect = ruleForm.elements.weekday;
  if (weekdaySelect.options.length === 1) {
    weekdays.forEach(([id, label]) => weekdaySelect.add(new Option(label, String(id))));
  }
  const targetType = ruleForm.elements.targetType.value;
  const values = targetType === "product" ? schedule.products : schedule.categories;
  ruleForm.elements.targetId.innerHTML = values.map((item) => `<option value="${item.id}">${esc(item.name)}</option>`).join("");
}

function render() {
  renderWeekly();
  renderSettings();
  renderSpecials();
  fillRuleSelectors();
  renderRules();
}

async function loadSchedule() {
  if (loading) return;
  loading = true;
  try {
    const session = await getSession();
    const data = await rpc("admin_get_ordering_schedule", { _location_id: session.locationId });
    schedule = {
      openingHours: Array.isArray(data.openingHours) ? data.openingHours : [],
      specialOpeningHours: Array.isArray(data.specialOpeningHours) ? data.specialOpeningHours : [],
      orderingSettings: data.orderingSettings || {},
      availabilityRules: Array.isArray(data.availabilityRules) ? data.availabilityRules : [],
      products: Array.isArray(data.products) ? data.products : [],
      categories: Array.isArray(data.categories) ? data.categories : [],
      timezone: data.timezone || "Europe/Berlin",
    };
    message.textContent = `Zeitzone: ${schedule.timezone}`;
    render();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    loading = false;
  }
}

document.querySelector("#saveWeekly").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const session = await getSession();
    await rpc("admin_replace_weekly_opening_hours", { _location_id: session.locationId, _rows: collectWeeklyRows() });
    message.textContent = "Wochenplan gespeichert.";
    await loadSchedule();
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = settingsForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const session = await getSession();
    await rpc("admin_save_ordering_settings", {
      _location_id: session.locationId,
      _order_cutoff_minutes: Number(settingsForm.elements.orderCutoffMinutes.value),
      _acceptance_timeout_minutes: Number(settingsForm.elements.acceptanceTimeoutMinutes.value),
      _slot_minutes: Number(settingsForm.elements.slotMinutes.value),
      _slot_capacity: Number(settingsForm.elements.slotCapacity.value),
      _preparation_lead_minutes: Number(settingsForm.elements.preparationLeadMinutes.value),
      _online_ordering_enabled: settingsForm.elements.onlineOrderingEnabled.checked,
      _pickup_enabled: settingsForm.elements.pickupEnabled.checked,
      _delivery_enabled: settingsForm.elements.deliveryEnabled.checked,
    });
    message.textContent = "Bestellparameter gespeichert.";
    await loadSchedule();
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});

specialForm.elements.closed.addEventListener("change", () => {
  document.querySelector("#specialTimes").hidden = specialForm.elements.closed.checked;
  if (specialForm.elements.closed.checked) {
    specialForm.elements.opensAt.value = "";
    specialForm.elements.closesAt.value = "";
  }
});

specialForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = specialForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const session = await getSession();
    const closed = specialForm.elements.closed.checked;
    await rpc("admin_save_special_opening_hour", {
      _id: null,
      _location_id: session.locationId,
      _day: specialForm.elements.day.value,
      _opens_at: closed ? null : (specialForm.elements.opensAt.value || null),
      _closes_at: closed ? null : (specialForm.elements.closesAt.value || null),
      _closed: closed,
      _public_note: specialForm.elements.publicNote.value.trim() || null,
    });
    specialForm.reset();
    document.querySelector("#specialTimes").hidden = false;
    message.textContent = "Sondertag gespeichert.";
    await loadSchedule();
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});

ruleForm.elements.targetType.addEventListener("change", fillRuleSelectors);
ruleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = ruleForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const session = await getSession();
    const isProduct = ruleForm.elements.targetType.value === "product";
    const startsAt = ruleForm.elements.startsAt.value || null;
    const endsAt = ruleForm.elements.endsAt.value || null;
    if (Boolean(startsAt) !== Boolean(endsAt)) throw new Error("Von/Bis bitte gemeinsam ausfüllen oder beide leer lassen.");
    await rpc("admin_save_availability_rule", {
      _id: null,
      _location_id: session.locationId,
      _product_id: isProduct ? ruleForm.elements.targetId.value : null,
      _category_id: isProduct ? null : ruleForm.elements.targetId.value,
      _weekday: ruleForm.elements.weekday.value ? Number(ruleForm.elements.weekday.value) : null,
      _starts_at: startsAt,
      _ends_at: endsAt,
      _valid_from: ruleForm.elements.validFrom.value || null,
      _valid_until: ruleForm.elements.validUntil.value || null,
      _enabled: ruleForm.elements.enabled.checked,
    });
    ruleForm.reset();
    ruleForm.elements.enabled.checked = true;
    fillRuleSelectors();
    message.textContent = "Verfügbarkeitsregel gespeichert.";
    await loadSchedule();
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});

function setRealtimeStatus(status) {
  const dot = document.querySelector("#scheduleDot");
  const text = document.querySelector("#scheduleSync");
  dot.classList.toggle("offline", status !== "subscribed");
  text.textContent = ({
    connecting: "Realtime verbindet …",
    subscribed: "Realtime · live",
    reconnecting: "Realtime verbindet neu …",
    degraded: "Realtime gestört · Safety-Sync",
  })[status] || status;
}

await loadSchedule();
connectPostgresRealtime({
  sessionEndpoint: "/api/admin/realtime-session",
  topic: "realtime:mcello-schedule",
  changes: (session) => [
    { event: "*", schema: "public", table: "opening_hours", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "special_opening_hours", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "ordering_settings", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "availability_rules", filter: `location_id=eq.${session.locationId}` },
  ],
  onChange: () => loadSchedule(),
  onStatus: setRealtimeStatus,
  reconciliationMs: 30_000,
});
