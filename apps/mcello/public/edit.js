const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const token = new URLSearchParams(location.search).get("token");
const $ = (selector) => document.querySelector(selector);

const state = {
  context: null,
  products: [],
  categories: [],
  lines: [],
  slots: [],
  slotMinutes: 15,
  menuAt: null,
  saving: false,
};

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function showFatal(message) {
  $("#editContent").classList.add("hidden");
  const target = $("#editError");
  target.textContent = message;
  target.classList.remove("hidden");
}

function setMessage(message, type = "") {
  const target = $("#editMessage");
  target.textContent = message;
  target.className = `edit-message${type ? ` ${type}` : ""}`;
}

function productOrderable(product) {
  return Boolean(product?.orderableOnline) && !product?.soldOut && product?.availableNow !== false;
}

function normalizeMenu(raw) {
  const categories = (raw.categories || []).map((category) => ({
    id: category.id,
    name: category.name,
    sort: category.sort,
  }));
  const products = (raw.categories || []).flatMap((category) => (category.products || []).map((product) => ({
    ...product,
    categoryId: category.id,
    modifierGroups: product.modifierGroups || [],
  })));
  return { categories, products };
}

async function loadMenu(at = null) {
  const query = at ? `?at=${encodeURIComponent(at)}` : "";
  const response = await fetch(`/api/menu${query}`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Speisekarte konnte nicht geladen werden.");
  const normalized = normalizeMenu(data);
  state.categories = normalized.categories;
  state.products = normalized.products;
  state.menuAt = at;
}

function selectedMap(line) {
  return new Map((line.selections || []).map((selection) => [selection.groupId, selection.optionIds || []]));
}

function lineValidation(line) {
  const product = state.products.find((candidate) => candidate.id === line.productId);
  if (!product) return { valid: false, message: "Dieser Artikel ist nicht mehr in der aktuellen Speisekarte vorhanden." };
  if (!productOrderable(product)) return { valid: false, message: "Dieser Artikel ist für die gewählte Abholzeit nicht verfügbar." };
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
    return { valid: false, message: "Die Menge muss zwischen 1 und 99 liegen." };
  }

  const groups = new Map((product.modifierGroups || []).map((group) => [group.id, group]));
  const selections = selectedMap(line);
  for (const groupId of selections.keys()) {
    if (!groups.has(groupId)) return { valid: false, message: "Eine gespeicherte Option gehört nicht mehr zu diesem Artikel." };
  }

  for (const group of product.modifierGroups || []) {
    const optionIds = selections.get(group.id) || [];
    if (optionIds.length < group.minSelections || optionIds.length > group.maxSelections) {
      return { valid: false, message: `${group.name}: Bitte eine gültige Auswahl treffen.` };
    }
    for (const optionId of optionIds) {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option || option.soldOut) return { valid: false, message: `${group.name}: Eine gewählte Option ist nicht mehr verfügbar.` };
    }
  }
  return { valid: true, message: "" };
}

function lineUnitPrice(line) {
  const product = state.products.find((candidate) => candidate.id === line.productId);
  if (!product) return 0;
  let price = Number(product.basePriceCents || 0);
  const selections = selectedMap(line);
  for (const group of product.modifierGroups || []) {
    for (const optionId of selections.get(group.id) || []) {
      price += Number(group.options.find((option) => option.id === optionId)?.priceDeltaCents || 0);
    }
  }
  return price;
}

function cartTotal() {
  return state.lines.reduce((sum, line) => sum + lineUnitPrice(line) * (line.quantity || 0), 0);
}

function selectionFor(line, groupId) {
  let selection = line.selections.find((candidate) => candidate.groupId === groupId);
  if (!selection) {
    selection = { groupId, optionIds: [] };
    line.selections.push(selection);
  }
  return selection;
}

function lineMarkup(line, index) {
  const product = state.products.find((candidate) => candidate.id === line.productId);
  const validation = lineValidation(line);
  if (!product) {
    return `<article class="edit-line" data-line="${index}"><div class="edit-line-head"><div><h3>Artikel nicht mehr verfügbar</h3><small>${esc(validation.message)}</small></div><button class="pill" data-remove-line="${index}">Entfernen</button></div></article>`;
  }

  const selected = selectedMap(line);
  const modifiers = (product.modifierGroups || []).map((group) => {
    const inputType = group.maxSelections === 1 ? "radio" : "checkbox";
    const selectedIds = selected.get(group.id) || [];
    return `<section class="edit-modifier">
      <div class="edit-modifier-title"><strong>${esc(group.name)}</strong><small>${group.minSelections > 0 ? `Mind. ${group.minSelections}` : "Optional"}${group.maxSelections > 1 ? ` · max. ${group.maxSelections}` : ""}</small></div>
      <div class="edit-options">${group.options.map((option) => {
        const checked = selectedIds.includes(option.id) ? "checked" : "";
        const disabled = option.soldOut ? "disabled" : "";
        const delta = option.priceDeltaCents === 0 ? "inkl." : `${option.priceDeltaCents > 0 ? "+" : ""}${euro.format(option.priceDeltaCents / 100)}`;
        return `<label class="edit-option"><input type="${inputType}" name="edit-${index}-${group.id}" value="${option.id}" data-line-index="${index}" data-group-id="${group.id}" ${checked} ${disabled}><span>${esc(option.name)}${option.soldOut ? " · nicht verfügbar" : ""}</span><span>${delta}</span></label>`;
      }).join("")}</div>
    </section>`;
  }).join("");

  return `<article class="edit-line" data-line="${index}">
    <div class="edit-line-head"><div><h3>${esc(product.name)}</h3><small>${validation.valid ? euro.format(lineUnitPrice(line) / 100) + " pro Stück" : esc(validation.message)}</small></div><button class="pill" data-remove-line="${index}">Entfernen</button></div>
    <div class="edit-fields">
      <label class="edit-field"><span>Menge</span><input type="number" min="1" max="99" step="1" value="${line.quantity}" data-line-quantity="${index}"></label>
      <label class="edit-field"><span>Wunsch zu diesem Artikel</span><input type="text" maxlength="500" value="${esc(line.comment || "")}" data-line-comment="${index}" placeholder="Optional"></label>
    </div>
    <div class="edit-modifiers">${modifiers}</div>
  </article>`;
}

function renderLines() {
  const target = $("#editItems");
  target.innerHTML = state.lines.length
    ? state.lines.map(lineMarkup).join("")
    : '<div class="edit-message error">Die Bestellung braucht mindestens einen Artikel.</div>';

  target.querySelectorAll("[data-remove-line]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lines.splice(Number(button.dataset.removeLine), 1);
      renderLines();
    });
  });

  target.querySelectorAll("[data-line-quantity]").forEach((input) => {
    input.addEventListener("change", () => {
      const line = state.lines[Number(input.dataset.lineQuantity)];
      if (!line) return;
      line.quantity = Number(input.value);
      renderLines();
    });
  });

  target.querySelectorAll("[data-line-comment]").forEach((input) => {
    input.addEventListener("input", () => {
      const line = state.lines[Number(input.dataset.lineComment)];
      if (line) line.comment = input.value.slice(0, 500);
    });
  });

  target.querySelectorAll(".edit-options input").forEach((input) => {
    input.addEventListener("change", () => {
      const line = state.lines[Number(input.dataset.lineIndex)];
      const product = state.products.find((candidate) => candidate.id === line?.productId);
      const group = product?.modifierGroups.find((candidate) => candidate.id === input.dataset.groupId);
      if (!line || !group) return;
      const selection = selectionFor(line, group.id);
      if (group.maxSelections === 1) {
        selection.optionIds = input.checked ? [input.value] : [];
      } else if (input.checked) {
        if (selection.optionIds.length >= group.maxSelections) {
          input.checked = false;
          setMessage(`${group.name}: maximal ${group.maxSelections} Optionen.`, "error");
          return;
        }
        selection.optionIds.push(input.value);
      } else {
        selection.optionIds = selection.optionIds.filter((id) => id !== input.value);
      }
      renderLines();
    });
  });

  $("#editTotal").textContent = euro.format(cartTotal() / 100);
  renderProductSelect();
}

function renderProductSelect() {
  const select = $("#addProduct");
  const grouped = state.categories.map((category) => {
    const products = state.products.filter((product) => product.categoryId === category.id && productOrderable(product));
    if (!products.length) return "";
    return `<optgroup label="${esc(category.name)}">${products.map((product) => `<option value="${product.id}">${esc(product.name)} · ${euro.format(product.basePriceCents / 100)}</option>`).join("")}</optgroup>`;
  }).join("");
  select.innerHTML = '<option value="">Artikel auswählen …</option>' + grouped;
}

function defaultSelections(product) {
  return (product.modifierGroups || []).map((group) => {
    let optionIds = group.options.filter((option) => option.defaultSelected && !option.soldOut).map((option) => option.id);
    if (optionIds.length < group.minSelections) {
      optionIds = group.options.filter((option) => !option.soldOut).slice(0, group.minSelections).map((option) => option.id);
    }
    return { groupId: group.id, optionIds };
  });
}

function addSelectedProduct() {
  const product = state.products.find((candidate) => candidate.id === $("#addProduct").value);
  if (!product || !productOrderable(product)) {
    setMessage("Bitte einen aktuell verfügbaren Artikel auswählen.", "error");
    return;
  }
  state.lines.push({
    productId: product.id,
    quantity: 1,
    selections: defaultSelections(product),
    comment: "",
  });
  renderLines();
  setMessage(`${product.name} wurde hinzugefügt.`, "success");
}

function formatSlot(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Aktueller Slot";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

async function loadSlots({ preserve = true } = {}) {
  const select = $("#editPickupSlot");
  const previous = preserve ? select.value : "";
  select.disabled = true;
  select.innerHTML = '<option value="">Slots werden geladen …</option>';
  try {
    const response = await fetch("/api/slots?days=7", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Slots nicht verfügbar");
    state.slots = data.slots || [];
    state.slotMinutes = data.slotMinutes || 15;

    const current = state.context?.requestedPickupAt || null;
    const options = [];
    if (current && !state.slots.some((slot) => slot.startsAt === current)) {
      options.push(`<option value="${esc(current)}">Aktueller Slot · ${esc(formatSlot(current))}</option>`);
    }
    options.push(...state.slots.slice(0, 160).map((slot) => {
      const scarcity = slot.remaining <= 2 ? ` · noch ${slot.remaining} frei` : "";
      return `<option value="${esc(slot.startsAt)}">${esc(formatSlot(slot.startsAt) + scarcity)}</option>`;
    }));
    select.innerHTML = '<option value="">Bitte Slot auswählen</option>' + options.join("");
    const wanted = previous || current;
    if (wanted && [...select.options].some((option) => option.value === wanted)) select.value = wanted;
    select.disabled = false;
  } catch (error) {
    select.innerHTML = '<option value="">Slots konnten nicht geladen werden</option>';
    setMessage(error.message, "error");
  }
}

async function reloadForPickup(at) {
  setMessage("Verfügbarkeit für die Abholzeit wird neu geprüft …");
  await loadMenu(at);
  renderLines();
  const issues = state.lines.map(lineValidation).filter((result) => !result.valid);
  setMessage(
    issues.length ? issues[0].message : "Auswahl ist für diese Abholzeit lokal gültig. Der Server prüft beim Speichern erneut.",
    issues.length ? "error" : "success",
  );
}

function hydrateContext(context) {
  state.context = context;
  state.lines = (context.items || []).map((item) => ({
    productId: item.productId,
    quantity: Number(item.quantity || 1),
    selections: (item.selections || []).map((selection) => ({
      groupId: selection.groupId,
      optionIds: [...(selection.optionIds || [])],
    })),
    comment: item.comment || "",
  }));
  $("#editOrderNumber").textContent = `Bestellung #${context.orderNumber}`;
  $("#editOrderComment").value = context.comment || "";
  const statusUrl = `/status.html?token=${encodeURIComponent(token)}`;
  $("#backToStatus").href = statusUrl;
  $("#cancelEdit").href = statusUrl;
}

function editPayload() {
  const later = $("#editPickupMode").value === "later";
  const requestedPickupAt = later ? $("#editPickupSlot").value || null : null;
  return {
    token,
    comment: $("#editOrderComment").value.trim(),
    requestedPickupAt,
    items: state.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      selections: line.selections.map((selection) => ({
        groupId: selection.groupId,
        optionIds: [...selection.optionIds],
      })),
      comment: line.comment || null,
    })),
  };
}

function validateBeforeSave() {
  if (!state.lines.length) return "Die Bestellung braucht mindestens einen Artikel.";
  if ($("#editPickupMode").value === "later" && !$("#editPickupSlot").value) return "Bitte einen Abholslot auswählen.";
  for (const line of state.lines) {
    const result = lineValidation(line);
    if (!result.valid) return result.message;
  }
  return null;
}

async function saveEdit() {
  if (state.saving) return;
  const issue = validateBeforeSave();
  if (issue) {
    setMessage(issue, "error");
    return;
  }

  state.saving = true;
  $("#saveEdit").disabled = true;
  setMessage("Mcello prüft Preise, Optionen, Öffnungszeit und Slot-Kapazität erneut …");
  try {
    const response = await fetch("/api/order-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editPayload()),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) {
        throw new Error("Die Bestellung wurde inzwischen angenommen oder kann mit der aktuellen Auswahl nicht mehr geändert werden.");
      }
      throw new Error("Die Änderungen sind ungültig. Bitte Auswahl und Abholzeit prüfen.");
    }
    setMessage("Änderungen gespeichert. Zurück zum aktuellen Status …", "success");
    location.href = data.statusUrl || `/status.html?token=${encodeURIComponent(token)}`;
  } catch (error) {
    setMessage(error.message || "Änderungen konnten nicht gespeichert werden.", "error");
  } finally {
    state.saving = false;
    $("#saveEdit").disabled = false;
  }
}

async function init() {
  if (!token) {
    showFatal("Dieser Bearbeiten-Link ist unvollständig. Bitte öffne ihn über deinen Bestellstatus.");
    return;
  }

  const response = await fetch(`/api/order-edit?token=${encodeURIComponent(token)}`, { cache: "no-store" });
  const context = await response.json().catch(() => ({}));
  if (!response.ok || context.state !== "waiting_for_acceptance") {
    showFatal("Diese Bestellung kann online nicht mehr bearbeitet werden. Bitte öffne den aktuellen Bestellstatus.");
    return;
  }

  hydrateContext(context);
  await loadMenu(context.requestedPickupAt || null);
  $("#editContent").classList.remove("hidden");
  renderLines();

  const later = Boolean(context.requestedPickupAt);
  $("#editPickupMode").value = later ? "later" : "asap";
  $("#editPickupAtField").classList.toggle("hidden", !later);
  if (later) await loadSlots({ preserve: false });
  setMessage("Du kannst die Bestellung jetzt ändern. Beim Speichern entscheidet ausschließlich der aktuelle Serverstand.", "success");
}

$("#addProductButton").addEventListener("click", addSelectedProduct);
$("#saveEdit").addEventListener("click", saveEdit);
$("#editPickupMode").addEventListener("change", async () => {
  const later = $("#editPickupMode").value === "later";
  $("#editPickupAtField").classList.toggle("hidden", !later);
  if (later) {
    await loadSlots({ preserve: false });
    const selected = $("#editPickupSlot").value || state.context?.requestedPickupAt || null;
    if (selected) await reloadForPickup(selected);
  } else {
    await reloadForPickup(null);
  }
});
$("#editPickupSlot").addEventListener("change", async () => {
  const selected = $("#editPickupSlot").value || null;
  if (selected) await reloadForPickup(selected);
});

init().catch((error) => {
  console.error(error);
  showFatal("Der Bearbeiten-Modus konnte nicht geladen werden. Bitte öffne erneut deinen Bestellstatus.");
});
