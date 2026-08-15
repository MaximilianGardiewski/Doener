const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const token = new URLSearchParams(location.search).get("token");
const $ = (selector) => document.querySelector(selector);

const state = {
  draft: null,
  items: [],
  products: [],
  productById: new Map(),
  slots: [],
  saving: false,
};

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function setMessage(message, kind = "") {
  const box = $("#editMessage");
  box.textContent = message;
  box.className = `edit-message ${kind}`.trim();
}

function showFatal(message) {
  $("#editContent").classList.add("hidden");
  const box = $("#editError");
  box.textContent = message;
  box.classList.remove("hidden");
}

async function getJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "Anfrage fehlgeschlagen");
    error.status = response.status;
    error.code = data.error;
    throw error;
  }
  return data;
}

function normalizeMenu(raw) {
  return (raw.categories || []).flatMap((category) => (category.products || []).map((product) => ({
    ...product,
    categoryId: category.id,
    categoryName: category.name,
    modifierGroups: product.modifierGroups || [],
  })));
}

function selectedIds(line, groupId) {
  return new Set((line.selections || []).find((entry) => entry.groupId === groupId)?.optionIds || []);
}

function setSelection(line, groupId, optionIds) {
  const next = (line.selections || []).filter((entry) => entry.groupId !== groupId);
  if (optionIds.length) next.push({ groupId, optionIds });
  line.selections = next;
}

function productOrderable(product) {
  return Boolean(product?.orderableOnline) && !product?.soldOut && product?.availableNow !== false;
}

function configuredUnitPrice(line) {
  const product = state.productById.get(line.productId);
  if (!product) return 0;
  let total = Number(product.basePriceCents || 0);
  for (const group of product.modifierGroups || []) {
    const selected = selectedIds(line, group.id);
    for (const option of group.options || []) {
      if (selected.has(option.id)) total += Number(option.priceDeltaCents || 0);
    }
  }
  return total;
}

function renderTotal() {
  const total = state.items.reduce((sum, line) => sum + configuredUnitPrice(line) * Number(line.quantity || 1), 0);
  $("#editTotal").textContent = euro.format(total / 100);
}

function optionMarkup(line, group, option) {
  const selected = selectedIds(line, group.id).has(option.id);
  const disabled = Boolean(option.soldOut) && !selected;
  const price = Number(option.priceDeltaCents || 0);
  const suffix = price ? `${price > 0 ? "+" : ""}${euro.format(price / 100)}` : "inkl.";
  return `<label class="modifier-option">
    <input type="checkbox" data-group="${esc(group.id)}" data-option="${esc(option.id)}" ${selected ? "checked" : ""} ${disabled ? "disabled" : ""} />
    <span>${esc(option.name)}${option.soldOut ? " · aktuell ausverkauft" : ""}</span><span>${esc(suffix)}</span>
  </label>`;
}

function renderItem(line, index) {
  const product = state.productById.get(line.productId);
  if (!product) {
    return `<article class="edit-item unavailable" data-line="${index}">
      <div class="edit-item-head"><div><h3>Produkt nicht mehr im aktuellen Online-Menü</h3><p class="warning">Diese Position kann nicht erneut validiert werden. Bitte entfernen und bei Bedarf ein verfügbares Produkt neu hinzufügen.</p></div><button class="pill" data-remove="${index}">Entfernen</button></div>
    </article>`;
  }

  const groups = (product.modifierGroups || []).map((group) => {
    const min = Number(group.minSelections || 0);
    const max = Number(group.maxSelections || 0);
    return `<section class="modifier-group">
      <div class="modifier-head"><strong>${esc(group.name)}</strong><small>${min === max ? `${min} Auswahl` : `${min}–${max} Auswahlen`}</small></div>
      <div class="modifier-options">${(group.options || []).map((option) => optionMarkup(line, group, option)).join("")}</div>
    </section>`;
  }).join("");
  const unavailable = !productOrderable(product);

  return `<article class="edit-item ${unavailable ? "unavailable" : ""}" data-line="${index}">
    <div class="edit-item-head"><div><h3>${esc(product.name)}</h3><small>${esc(product.categoryName || "")}</small>${unavailable ? '<p class="warning">Aktuell nicht online bestellbar. Entfernen oder später erneut versuchen.</p>' : ""}</div><div><strong class="price">${euro.format(configuredUnitPrice(line) / 100)}</strong><br><button class="pill" data-remove="${index}" style="margin-top:8px">Entfernen</button></div></div>
    ${groups}
    <div class="qty-row">
      <label class="field"><span>Menge</span><input type="number" min="1" max="99" step="1" value="${Number(line.quantity || 1)}" data-quantity="${index}" /></label>
      <label class="field"><span>Artikelhinweis</span><input maxlength="500" value="${esc(line.comment || "")}" data-line-comment="${index}" placeholder="Optionaler Wunsch" /></label>
    </div>
  </article>`;
}

function bindItems() {
  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => {
      state.items.splice(Number(button.dataset.remove), 1);
      renderItems();
    };
  });
  document.querySelectorAll("[data-quantity]").forEach((input) => {
    input.oninput = () => {
      const quantity = Math.max(1, Math.min(99, Number(input.value) || 1));
      state.items[Number(input.dataset.quantity)].quantity = quantity;
      renderTotal();
    };
  });
  document.querySelectorAll("[data-line-comment]").forEach((input) => {
    input.oninput = () => { state.items[Number(input.dataset.lineComment)].comment = input.value; };
  });
  document.querySelectorAll("[data-group][data-option]").forEach((input) => {
    input.onchange = () => {
      const card = input.closest("[data-line]");
      const line = state.items[Number(card.dataset.line)];
      const product = state.productById.get(line.productId);
      const group = product?.modifierGroups?.find((entry) => entry.id === input.dataset.group);
      if (!group) return;
      const selected = selectedIds(line, group.id);
      if (input.checked) {
        if (selected.size >= Number(group.maxSelections || 0)) {
          input.checked = false;
          setMessage(`${group.name}: maximal ${group.maxSelections} Auswahl.`, "error");
          return;
        }
        selected.add(input.dataset.option);
      } else {
        selected.delete(input.dataset.option);
      }
      setSelection(line, group.id, [...selected]);
      renderTotal();
    };
  });
}

function renderItems() {
  $("#editItems").innerHTML = state.items.length
    ? state.items.map(renderItem).join("")
    : '<div class="edit-message error">Die Bestellung braucht mindestens eine Position.</div>';
  bindItems();
  renderTotal();
}

function renderAddProducts() {
  const select = $("#addProduct");
  const options = state.products.filter(productOrderable).map((product) =>
    `<option value="${esc(product.id)}">${esc(product.categoryName || "")} · ${esc(product.name)} · ${euro.format(Number(product.basePriceCents || 0) / 100)}</option>`,
  );
  select.innerHTML = '<option value="">Produkt wählen …</option>' + options.join("");
}

function slotLabel(slot) {
  const today = localDateInBerlin(new Date());
  const tomorrow = localDateInBerlin(new Date(Date.now() + 24 * 60 * 60 * 1000));
  if (slot.localDate === today) return `Heute · ${slot.localTime}`;
  if (slot.localDate === tomorrow) return `Morgen · ${slot.localTime}`;
  const date = new Date(`${slot.localDate}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(date);
  return `${weekday} · ${slot.localTime}`;
}

function localDateInBerlin(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

async function loadSlots(previous = "") {
  const select = $("#pickupAt");
  select.disabled = true;
  select.innerHTML = '<option value="">Slots werden geladen …</option>';
  try {
    const data = await getJson("/api/slots?days=7");
    state.slots = data.slots || [];
    let options = state.slots.slice(0, 160).map((slot) => {
      const scarcity = slot.remaining <= 2 ? ` · noch ${slot.remaining} frei` : "";
      return `<option value="${esc(slot.startsAt)}">${esc(slotLabel(slot) + scarcity)}</option>`;
    });
    if (previous && !state.slots.some((slot) => slot.startsAt === previous)) {
      options.unshift(`<option value="${esc(previous)}">Bisheriger Slot · ${esc(new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(previous)))}</option>`);
    }
    select.innerHTML = '<option value="">Bitte Slot auswählen</option>' + options.join("");
    if (previous) select.value = previous;
    select.disabled = false;
  } catch (error) {
    select.innerHTML = '<option value="">Slots konnten nicht geladen werden</option>';
    setMessage(error.message, "error");
  }
}

async function loadMenu(at) {
  const query = at ? `?at=${encodeURIComponent(at)}` : "";
  const raw = await getJson(`/api/menu${query}`);
  state.products = normalizeMenu(raw);
  state.productById = new Map(state.products.map((product) => [product.id, product]));
  renderAddProducts();
  renderItems();
}

function validateItems() {
  if (!state.items.length) return "Mindestens eine Position ist erforderlich.";
  for (const line of state.items) {
    if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) < 1 || Number(line.quantity) > 99) return "Eine Menge ist ungültig.";
    const product = state.productById.get(line.productId);
    if (!product || !productOrderable(product)) return `${product?.name || "Eine Position"} ist aktuell nicht online bestellbar.`;
    for (const group of product.modifierGroups || []) {
      const count = selectedIds(line, group.id).size;
      if (count < Number(group.minSelections || 0) || count > Number(group.maxSelections || 0)) {
        return `${product.name} · ${group.name}: ${group.minSelections}–${group.maxSelections} Auswahl erforderlich.`;
      }
      for (const optionId of selectedIds(line, group.id)) {
        const option = group.options?.find((entry) => entry.id === optionId);
        if (!option || option.soldOut) return `${product.name}: eine gewählte Option ist aktuell nicht verfügbar.`;
      }
    }
  }
  return null;
}

function requestedPickupAt() {
  return $("#pickupMode").value === "later" ? ($("#pickupAt").value || null) : null;
}

async function save() {
  if (state.saving) return;
  const validation = validateItems();
  if (validation) return setMessage(validation, "error");
  const pickupAt = requestedPickupAt();
  if ($("#pickupMode").value === "later" && !pickupAt) return setMessage("Bitte einen Abholslot auswählen.", "error");

  state.saving = true;
  $("#saveEdit").disabled = true;
  setMessage("Server prüft Slot, Verfügbarkeit, Optionen und Preise vollständig neu …");
  try {
    const status = await getJson("/api/order-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        comment: $("#orderComment").value,
        requestedPickupAt: pickupAt,
        items: state.items.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
          selections: line.selections || [],
          comment: line.comment || undefined,
        })),
      }),
    });
    setMessage("Änderungen gespeichert. Weiter zum Bestellstatus …", "success");
    location.href = status.statusUrl || `/status.html?token=${encodeURIComponent(token)}`;
  } catch (error) {
    if (error.status === 409) {
      setMessage("Die Bestellung ist nicht mehr editierbar oder wurde inzwischen angenommen. Bitte prüfe den aktuellen Status.", "error");
    } else {
      setMessage(error.message || "Änderungen konnten nicht gespeichert werden.", "error");
    }
    try {
      await loadMenu(pickupAt || null);
      if ($("#pickupMode").value === "later") await loadSlots(pickupAt || "");
    } catch {}
  } finally {
    state.saving = false;
    $("#saveEdit").disabled = false;
  }
}

async function init() {
  if (!token) return showFatal("Dieser Edit-Link ist unvollständig. Bitte öffne ihn über deinen Bestellstatus.");
  $("#backToStatus").href = `/status.html?token=${encodeURIComponent(token)}`;
  $("#cancelEdit").href = `/status.html?token=${encodeURIComponent(token)}`;

  try {
    const draft = await getJson(`/api/order-edit?token=${encodeURIComponent(token)}`);
    state.draft = draft;
    state.items = (draft.items || []).map((line) => ({
      productId: line.productId,
      quantity: Number(line.quantity || 1),
      selections: Array.isArray(line.selections) ? line.selections : [],
      comment: line.comment || "",
    }));
    $("#orderTag").textContent = `Bestellung #${draft.orderNumber}`;
    $("#customerName").textContent = draft.customerFirstName || "Bestellung";
    $("#orderComment").value = draft.comment || "";
    const later = Boolean(draft.requestedPickupAt);
    $("#pickupMode").value = later ? "later" : "asap";
    $("#pickupAtField").classList.toggle("hidden", !later);

    await Promise.all([
      loadMenu(draft.requestedPickupAt || null),
      later ? loadSlots(draft.requestedPickupAt) : Promise.resolve(),
    ]);
    $("#editContent").classList.remove("hidden");
  } catch (error) {
    showFatal(error.status === 409
      ? "Diese Bestellung kann nicht mehr geändert werden. Bitte öffne den Bestellstatus."
      : (error.message || "Die Bestellung konnte nicht zum Bearbeiten geladen werden."));
  }
}

$("#pickupMode").addEventListener("change", async () => {
  const later = $("#pickupMode").value === "later";
  $("#pickupAtField").classList.toggle("hidden", !later);
  if (later) await loadSlots($("#pickupAt").value || state.draft?.requestedPickupAt || "");
  await loadMenu(later ? ($("#pickupAt").value || null) : null).catch((error) => setMessage(error.message, "error"));
});

$("#pickupAt").addEventListener("change", () => {
  loadMenu($("#pickupAt").value || null).catch((error) => setMessage(error.message, "error"));
});

$("#addProductButton").addEventListener("click", () => {
  const product = state.productById.get($("#addProduct").value);
  if (!product || !productOrderable(product)) return;
  const selections = (product.modifierGroups || []).map((group) => ({
    groupId: group.id,
    optionIds: (group.options || []).filter((option) => option.defaultSelected && !option.soldOut).map((option) => option.id),
  })).filter((entry) => entry.optionIds.length);
  state.items.push({ productId: product.id, quantity: 1, selections, comment: "" });
  $("#addProduct").value = "";
  renderItems();
});

$("#orderComment").addEventListener("input", () => setMessage("Ungespeicherte Änderungen."));
$("#saveEdit").addEventListener("click", save);

init();
