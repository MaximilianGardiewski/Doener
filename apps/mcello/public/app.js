const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const CART_KEY = "mcello-preview-cart-v2";
const CART_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const media = "/media/placeholder.svg";
const $ = (selector) => document.querySelector(selector);

const state = {
  categories: [],
  items: [],
  categoryId: null,
  cart: loadCart(),
  activeProduct: null,
  selections: [],
  backendReady: false,
  otpChallenge: null,
  locationId: null,
  slots: [],
  slotMinutes: 15,
  shopState: null,
};

const rail = $("#categoryRail");
const featured = $("#featuredGrid");
const list = $("#menuList");
const modal = $("#productModal");
const drawer = $("#cartDrawer");

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    const now = Date.now();
    return Array.isArray(raw)
      ? raw.filter((line) => !line.savedAt || now - Date.parse(line.savedAt) < CART_MAX_AGE_MS)
      : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  renderCart();
}

function resetOtp() {
  state.otpChallenge = null;
  $("#otpPanel").classList.add("hidden");
  $("#devOtpHint").classList.add("hidden");
  updateCheckoutControls();
}

function lineTotal(line) {
  return (line.unitPriceCents || 0) * (line.quantity || 1);
}

function shopAcceptsOrders() {
  if (!state.backendReady || !state.shopState) return false;
  const shop = state.shopState;
  if (shop.onlineOrderingEnabled === false || shop.pickupEnabled === false) return false;
  if (["force_closed", "pause", "today_closed"].includes(shop.override)) return false;
  if (shop.override === "force_open") return true;
  if (!shop.scheduledOpen) return false;
  return shop.minutesUntilScheduledClose == null
    || Number(shop.minutesUntilScheduledClose) > Number(shop.orderCutoffMinutes || 0);
}

function shopStatusCopy() {
  if (!state.backendReady) return "Ohne lokalen Backend-Stack bleibt die Preview vollständig read-only.";
  if (!state.shopState) return "Bestellstatus konnte nicht geladen werden. Speisekarte und Warenkorb bleiben verfügbar; Absenden ist vorsorglich gesperrt.";
  const shop = state.shopState;
  if (shop.onlineOrderingEnabled === false || shop.pickupEnabled === false) {
    return shop.operatorMessage || "Online-Abholung ist aktuell deaktiviert. Du kannst weiter stöbern und deinen Warenkorb behalten.";
  }
  if (shop.override === "pause") return shop.operatorMessage || "Online-Bestellungen sind gerade kurz pausiert. Dein Warenkorb bleibt gespeichert.";
  if (shop.override === "today_closed") return shop.operatorMessage || "Heute sind keine Online-Bestellungen möglich. Dein Warenkorb bleibt gespeichert.";
  if (shop.override === "force_closed") return shop.operatorMessage || "Online-Bestellungen sind aktuell geschlossen. Dein Warenkorb bleibt gespeichert.";
  if (shop.override !== "force_open" && !shop.scheduledOpen) {
    return shop.operatorMessage || "Aktuell geschlossen. Du kannst weiter stöbern und den Warenkorb für später vorbereiten.";
  }
  if (shop.override !== "force_open"
      && shop.minutesUntilScheduledClose != null
      && Number(shop.minutesUntilScheduledClose) <= Number(shop.orderCutoffMinutes || 0)) {
    return shop.operatorMessage || "Der Online-Bestellschluss für heute ist erreicht. Dein Warenkorb bleibt gespeichert.";
  }
  const closeHint = shop.override !== "force_open" && Number.isFinite(Number(shop.minutesUntilScheduledClose))
    ? ` · noch ca. ${Number(shop.minutesUntilScheduledClose)} Min. bis zur geplanten Schließung`
    : "";
  return `Online-Bestellung möglich${closeHint}. Preise, Verfügbarkeit und Kapazität werden beim Absenden erneut geprüft.`;
}

function updateCheckoutControls() {
  const canStart = state.cart.length > 0 && state.backendReady && shopAcceptsOrders();
  $("#requestOtp").disabled = !canStart;
  const submit = $("#submitOrder");
  if (submit) submit.disabled = !canStart || !state.otpChallenge;
}

function renderCart() {
  const quantity = state.cart.reduce((sum, line) => sum + (line.quantity || 1), 0);
  const total = state.cart.reduce((sum, line) => sum + lineTotal(line), 0);
  $("#cartCount").textContent = `${quantity} Artikel`;
  $("#cartAmount").textContent = euro.format(total / 100);
  $("#cartTotal").textContent = euro.format(total / 100);

  $("#cartItems").innerHTML = state.cart.length
    ? state.cart.map((line, index) => {
      const optionText = (line.selectionLabels || []).join(" · ");
      return `<div class="cart-item">
        <div><strong>${line.quantity || 1}× ${esc(line.name)}</strong>${optionText ? `<small>${esc(optionText)}</small>` : ""}${line.comment ? `<small>Wunsch: ${esc(line.comment)}</small>` : ""}</div>
        <div><strong>${euro.format(lineTotal(line) / 100)}</strong><br><button class="ghost-btn" data-remove="${index}" aria-label="Artikel entfernen">×</button></div>
      </div>`;
    }).join("")
    : '<p style="color:var(--muted)">Noch nichts drin.</p>';

  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.onclick = () => {
      state.cart.splice(Number(button.dataset.remove), 1);
      resetOtp();
      saveCart();
    };
  });
  updateCheckoutControls();
}

function renderRail() {
  rail.innerHTML = state.categories.map((category) => `
    <button class="${category.id === state.categoryId ? "active" : ""}" data-category="${category.id}">${esc(category.name)}</button>
  `).join("");
  rail.querySelectorAll("button").forEach((button) => {
    button.onclick = () => {
      state.categoryId = button.dataset.category;
      renderRail();
      renderMenu();
    };
  });
}

function productOrderable(product) {
  return Boolean(product.orderableOnline) && !product.soldOut && product.availableNow !== false;
}

function productBadge(product) {
  if (!product.orderableOnline) return '<span class="availability-badge">Nur vor Ort · online deaktiviert</span>';
  if (product.soldOut) return '<span class="availability-badge bad">Heute ausverkauft</span>';
  if (product.availableNow === false) return '<span class="availability-badge">Aktuell nicht verfügbar</span>';
  return '<span class="availability-badge good">Online konfigurierbar</span>';
}

function renderMenu() {
  const items = state.items.filter((item) => item.categoryId === state.categoryId);
  const card = (product, highlight = false) => {
    const disabled = productOrderable(product) ? "" : "disabled";
    const buttonLabel = productOrderable(product) ? "Konfigurieren" : "Ansehen";
    return `<article class="food-card">
      ${highlight ? '<div class="bestseller">Kategorie-Highlight</div>' : ""}
      <img src="${media}" alt="" />
      <div class="food-body">
        <h3>${esc(product.name)}</h3>
        <p>${esc(product.description || "Details werden strukturiert im CMS gepflegt.")}</p>
        ${productBadge(product)}
        <div class="price-row"><span class="price">ab ${euro.format(product.basePriceCents / 100)}</span><button class="ghost-btn" data-product="${product.id}" ${disabled}>${buttonLabel}</button></div>
      </div>
    </article>`;
  };

  featured.innerHTML = items.slice(0, 3).map((item, index) => card(item, index === 0)).join("");
  list.innerHTML = items.slice(3).map((product) => `
    <div class="list-row">
      <div><strong>${esc(product.name)}</strong><small>${esc(product.description || "Vorläufig aus der bereitgestellten Speisekarte übernommen")}</small>${productBadge(product)}</div>
      <span class="price">${euro.format(product.basePriceCents / 100)}</span>
      <button class="ghost-btn" data-product="${product.id}" ${productOrderable(product) ? "" : "disabled"}>${productOrderable(product) ? "Hinzufügen" : "Nicht online"}</button>
    </div>
  `).join("") || '<div class="list-row"><strong>Für diese Kategorie sind noch keine Positionen vorhanden.</strong></div>';

  document.querySelectorAll("[data-product]").forEach((button) => {
    button.onclick = () => openProduct(button.dataset.product);
  });
}

function openProduct(id) {
  const product = state.items.find((item) => item.id === id);
  if (!product) return;
  state.activeProduct = product;
  state.selections = (product.modifierGroups || []).map((group) => ({
    groupId: group.id,
    optionIds: group.options.filter((option) => option.defaultSelected && !option.soldOut).map((option) => option.id),
  }));

  $("#modalTitle").textContent = product.name;
  $("#modalDescription").textContent = product.description || "Produktdetails werden aus dem Backend gepflegt.";
  $("#modalImage").src = media;
  $("#specialRequest").value = "";
  $("#productAvailability").innerHTML = productBadge(product);
  renderModifiers();
  updateAddButton();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeProduct() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function renderModifiers() {
  const product = state.activeProduct;
  const groups = product?.modifierGroups || [];
  $("#modifierGroups").innerHTML = groups.map((group) => {
    const inputType = group.maxSelections === 1 ? "radio" : "checkbox";
    const requiredText = group.minSelections > 0 ? `Mind. ${group.minSelections}` : "Optional";
    return `<section class="modifier-group">
      <div class="modifier-head"><strong>${esc(group.name)}</strong><small>${requiredText}${group.maxSelections > 1 ? ` · max. ${group.maxSelections}` : ""}</small></div>
      <div class="modifier-options">${group.options.map((option) => {
        const checked = selectedOptionIds(group.id).includes(option.id) ? "checked" : "";
        const disabled = option.soldOut ? "disabled" : "";
        const delta = option.priceDeltaCents === 0 ? "inkl." : `${option.priceDeltaCents > 0 ? "+" : ""}${euro.format(option.priceDeltaCents / 100)}`;
        return `<label class="modifier-option"><input type="${inputType}" name="modifier-${group.id}" value="${option.id}" data-group-id="${group.id}" ${checked} ${disabled}><span>${esc(option.name)}${option.soldOut ? " · ausverkauft" : ""}</span><span>${delta}</span></label>`;
      }).join("")}</div>
    </section>`;
  }).join("");

  document.querySelectorAll("#modifierGroups input").forEach((input) => {
    input.addEventListener("change", () => handleModifierChange(input));
  });
}

function selectedOptionIds(groupId) {
  return state.selections.find((selection) => selection.groupId === groupId)?.optionIds || [];
}

function handleModifierChange(input) {
  const product = state.activeProduct;
  const group = product.modifierGroups.find((item) => item.id === input.dataset.groupId);
  const selection = state.selections.find((item) => item.groupId === group.id);
  if (!group || !selection) return;

  if (group.maxSelections === 1) {
    selection.optionIds = input.checked ? [input.value] : [];
  } else if (input.checked) {
    if (selection.optionIds.length >= group.maxSelections) {
      input.checked = false;
      setCheckoutMessage(`Bei ${group.name} sind maximal ${group.maxSelections} Optionen möglich.`, "error");
      return;
    }
    selection.optionIds.push(input.value);
  } else {
    selection.optionIds = selection.optionIds.filter((id) => id !== input.value);
  }
  updateAddButton();
}

function configurationValid(product) {
  return (product.modifierGroups || []).every((group) => {
    const selected = selectedOptionIds(group.id);
    return selected.length >= group.minSelections && selected.length <= group.maxSelections && selected.every((id) => {
      const option = group.options.find((candidate) => candidate.id === id);
      return option && !option.soldOut;
    });
  });
}

function configuredPrice(product) {
  let total = product.basePriceCents;
  for (const group of product.modifierGroups || []) {
    for (const id of selectedOptionIds(group.id)) {
      total += group.options.find((option) => option.id === id)?.priceDeltaCents || 0;
    }
  }
  return total;
}

function updateAddButton() {
  const product = state.activeProduct;
  if (!product) return;
  const button = $("#addToCart");
  const valid = productOrderable(product) && configurationValid(product);
  button.disabled = !valid;
  button.textContent = productOrderable(product)
    ? `In den Warenkorb · ${euro.format(configuredPrice(product) / 100)}`
    : "Online derzeit nicht bestellbar";
}

function selectionLabels(product) {
  const labels = [];
  for (const group of product.modifierGroups || []) {
    for (const id of selectedOptionIds(group.id)) {
      const option = group.options.find((candidate) => candidate.id === id);
      if (option) labels.push(`${group.name}: ${option.name}`);
    }
  }
  return labels;
}

function addActiveProductToCart() {
  const product = state.activeProduct;
  if (!product || !productOrderable(product) || !configurationValid(product)) return;
  state.cart.push({
    productId: product.id,
    name: product.name,
    quantity: 1,
    unitPriceCents: configuredPrice(product),
    selections: structuredClone(state.selections),
    selectionLabels: selectionLabels(product),
    comment: $("#specialRequest").value.trim(),
    savedAt: new Date().toISOString(),
  });
  resetOtp();
  saveCart();
  closeProduct();
  drawer.classList.add("open");
}

function setCheckoutMessage(message, type = "") {
  const element = $("#checkoutMessage");
  element.textContent = message;
  element.className = `checkout-message${type ? ` ${type}` : ""}`;
}

function installSlotSelector() {
  const field = $("#pickupAtField");
  if (!field) return;
  field.innerHTML = `
    <span>Verfügbarer Abholslot</span>
    <select id="pickupSlot" disabled><option value="">Slots werden geladen …</option></select>
    <small id="slotHint" style="color:var(--muted)">Nur freie ${state.slotMinutes}-Minuten-Slots werden angezeigt.</small>`;
}

async function loadShopState({ quiet = false } = {}) {
  const wasAccepting = shopAcceptsOrders();
  if (!state.backendReady) {
    state.shopState = null;
    updateCheckoutControls();
    if (!quiet) setCheckoutMessage(shopStatusCopy());
    return false;
  }
  try {
    const response = await fetch("/api/kds/shop-state", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Bestellstatus nicht verfügbar");
    state.shopState = data;
    const accepting = shopAcceptsOrders();
    if (wasAccepting && !accepting) resetOtp();
    updateCheckoutControls();
    if (!quiet || wasAccepting !== accepting || !accepting) {
      setCheckoutMessage(shopStatusCopy(), accepting ? "success" : "");
    }
    return accepting;
  } catch (error) {
    state.shopState = null;
    resetOtp();
    if (!quiet) setCheckoutMessage(error.message || shopStatusCopy(), "error");
    return false;
  }
}

async function loadSlots({ preserveSelection = true } = {}) {
  const select = $("#pickupSlot");
  if (!select) return;
  const previous = preserveSelection ? select.value : "";
  select.disabled = true;
  select.innerHTML = '<option value="">Slots werden geladen …</option>';

  if (!state.backendReady || !shopAcceptsOrders()) {
    state.slots = [];
    select.innerHTML = `<option value="">${state.backendReady ? "Bestellungen aktuell geschlossen" : "Lokales Backend erforderlich"}</option>`;
    return;
  }

  try {
    const response = await fetch("/api/slots?days=7", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Slots nicht verfügbar");
    state.slots = data.slots || [];
    state.slotMinutes = data.slotMinutes || 15;
    $("#slotHint").textContent = `Nur freie ${state.slotMinutes}-Minuten-Slots werden angezeigt; Kapazität wird beim Absenden nochmals atomar geprüft.`;

    if (!state.slots.length) {
      select.innerHTML = '<option value="">Aktuell keine freien Slots</option>';
      return;
    }

    select.innerHTML = '<option value="">Bitte Slot auswählen</option>' + state.slots.slice(0, 160).map((slot) => {
      const label = slotLabel(slot);
      const scarcity = slot.remaining <= 2 ? ` · noch ${slot.remaining} frei` : "";
      return `<option value="${esc(slot.startsAt)}">${esc(label + scarcity)}</option>`;
    }).join("");
    if (previous && state.slots.some((slot) => slot.startsAt === previous)) select.value = previous;
    select.disabled = false;
  } catch (error) {
    state.slots = [];
    select.innerHTML = '<option value="">Slots konnten nicht geladen werden</option>';
    setCheckoutMessage(error.message, "error");
  }
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

async function requestOtp() {
  if (!state.cart.length) return;
  if (!await loadShopState()) {
    setCheckoutMessage(shopStatusCopy(), "error");
    return;
  }

  const firstName = $("#checkoutFirstName").value.trim();
  const mobile = $("#checkoutMobile").value.trim();
  if (!firstName || !mobile) {
    setCheckoutMessage("Bitte Vorname und Mobilnummer eingeben.", "error");
    return;
  }

  if ($("#pickupMode").value === "later") {
    const selectedBeforeRefresh = $("#pickupSlot")?.value || "";
    if (!selectedBeforeRefresh) {
      setCheckoutMessage("Bitte zuerst einen freien Abholslot auswählen.", "error");
      return;
    }
    await loadSlots({ preserveSelection: true });
    if (!$("#pickupSlot")?.value || $("#pickupSlot").value !== selectedBeforeRefresh) {
      setCheckoutMessage("Der gewählte Slot ist nicht mehr frei. Bitte einen neuen Slot auswählen.", "error");
      resetOtp();
      return;
    }
  }

  const button = $("#requestOtp");
  button.disabled = true;
  try {
    const response = await fetch("/api/dev/otp/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || "OTP konnte nicht gestartet werden");
    state.otpChallenge = data;
    $("#otpPanel").classList.remove("hidden");
    $("#otpCode").value = "";
    const hint = $("#devOtpHint");
    if (data.devCode) {
      hint.textContent = `Lokaler DEV-Code: ${data.devCode}`;
      hint.classList.remove("hidden");
      $("#otpCode").value = data.devCode;
    } else {
      hint.classList.add("hidden");
    }
    setCheckoutMessage("Code eingeben und die lokale Testbestellung absenden.", "success");
  } catch (error) {
    resetOtp();
    setCheckoutMessage(state.backendReady ? error.message : "Lokaler Backend-Stack ist nicht aktiv. Die statische Preview bleibt read-only.", "error");
  } finally {
    updateCheckoutControls();
  }
}

async function submitOrder() {
  if (!state.otpChallenge) {
    setCheckoutMessage("Bitte zuerst einen Bestätigungscode anfordern.", "error");
    return;
  }
  if (!await loadShopState()) {
    resetOtp();
    setCheckoutMessage(shopStatusCopy(), "error");
    return;
  }

  const pickupMode = $("#pickupMode").value;
  let requestedPickupAt = null;
  if (pickupMode === "later") {
    const selectedBeforeRefresh = $("#pickupSlot")?.value || "";
    if (!selectedBeforeRefresh) {
      setCheckoutMessage("Bitte einen freien Abholslot auswählen.", "error");
      return;
    }
    await loadSlots({ preserveSelection: true });
    if (!$("#pickupSlot")?.value || $("#pickupSlot").value !== selectedBeforeRefresh) {
      resetOtp();
      setCheckoutMessage("Der gewählte Slot ist nicht mehr frei. Bitte einen neuen Slot auswählen und die Nummer erneut verifizieren.", "error");
      return;
    }
    requestedPickupAt = selectedBeforeRefresh;
  }

  const button = $("#submitOrder");
  button.disabled = true;
  setCheckoutMessage("Backend prüft Preise, Optionen, Öffnungszeit und Slot-Kapazität …");
  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locationId: state.locationId,
        firstName: $("#checkoutFirstName").value.trim(),
        mobile: $("#checkoutMobile").value.trim(),
        comment: $("#checkoutComment").value.trim(),
        requestedPickupAt,
        otpChallengeId: state.otpChallenge.challengeId,
        otpCode: $("#otpCode").value.trim(),
        cart: state.cart.map((line) => ({
          productId: line.productId,
          quantity: line.quantity || 1,
          selections: line.selections || [],
          comment: line.comment || undefined,
          clientPriceCents: line.unitPriceCents,
        })),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.error === "SLOT_FULL" || /slot/i.test(data.message || "")) await loadSlots({ preserveSelection: false });
      throw new Error(data.message || data.error || "Bestellung konnte nicht angelegt werden");
    }
    state.cart = [];
    resetOtp();
    saveCart();
    setCheckoutMessage(`Testbestellung #${data.orderNumber} wurde lokal angelegt.`, "success");
    if (data.statusUrl) location.href = data.statusUrl;
  } catch (error) {
    resetOtp();
    setCheckoutMessage(`${error.message} Bitte die Mobilnummer erneut verifizieren.`, "error");
  } finally {
    updateCheckoutControls();
  }
}

function normalizeDbMenu(raw) {
  const categories = (raw.categories || []).map((category) => ({
    id: category.id, slug: category.slug, name: category.name, sort: category.sort,
  }));
  const items = (raw.categories || []).flatMap((category) => (category.products || []).map((product) => ({
    ...product, categoryId: category.id, modifierGroups: product.modifierGroups || [],
  })));
  return { locationId: raw.locationId, categories, items, source: "database" };
}

function normalizeFallback(raw) {
  const categories = raw.categories.map(([slug, name, sort]) => ({ id: slug, slug, name, sort }));
  const items = raw.items.map(([id, categoryId, name, description, basePriceCents, variants, orderableOnline]) => ({
    id, categoryId, name, description, basePriceCents, orderableOnline,
    availableNow: orderableOnline, soldOut: false, ownerConfirmed: false,
    modifierGroups: variants.length ? [{
      id: `fallback-size-${id}`, name: "Größe", minSelections: 1, maxSelections: 1,
      options: variants.map(([label, priceCents], index) => ({
        id: `fallback-size-${id}-${index}`, name: label,
        priceDeltaCents: priceCents - basePriceCents, defaultSelected: index === 0, soldOut: false,
      })),
    }] : [],
  }));
  return { locationId: "static-preview", categories, items, source: "static" };
}

async function loadMenu() {
  try {
    const response = await fetch("/api/menu", { cache: "no-store" });
    if (!response.ok) throw new Error("no local backend");
    return normalizeDbMenu(await response.json());
  } catch {
    const response = await fetch("/menu-seed.provisional.json", { cache: "no-store" });
    return normalizeFallback(await response.json());
  }
}

async function checkBackend() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();
    return data.backend === "local-supabase-ready";
  } catch {
    return false;
  }
}

function reconcileCartWithMenu() {
  const ids = new Set(state.items.map((item) => item.id));
  const before = state.cart.length;
  state.cart = state.cart.filter((line) => ids.has(line.productId));
  if (before !== state.cart.length) saveCart();
}

function setInitialCategory() {
  const preferred = state.categories.find((category) => category.slug === "warm");
  state.categoryId = preferred?.id || state.categories[0]?.id || null;
}

async function init() {
  installSlotSelector();
  const [catalog, backendReady] = await Promise.all([loadMenu(), checkBackend()]);
  state.locationId = catalog.locationId;
  state.categories = catalog.categories;
  state.items = catalog.items;
  state.backendReady = backendReady && catalog.source === "database";
  setInitialCategory();
  reconcileCartWithMenu();
  renderRail();
  renderMenu();
  renderCart();

  $("#menuSourceText").textContent = catalog.source === "database"
    ? "Lokale DB-Speisekarte: 97 transkribierte Positionen bleiben bis zur Inhaber-Freigabe ausdrücklich vorläufig. Preise und Verfügbarkeit werden beim Checkout erneut geprüft."
    : "Statische Design-Preview: Produkte und Preise sind vorläufig. Echte Testbestellungen sind nur mit lokalem Backend möglich.";
  $("#prototypeBanner").textContent = state.backendReady
    ? "Lokaler E2E-Modus · echte Testorders in lokaler DB · Speisekarte weiterhin unbestätigt"
    : "Statische Entwicklungs-Preview · Preise vorläufig · keine echte Bestellung";

  await loadShopState();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

document.querySelectorAll("[data-open-cart]").forEach((button) => { button.onclick = () => drawer.classList.add("open"); });
document.querySelectorAll("[data-close-cart]").forEach((button) => { button.onclick = () => drawer.classList.remove("open"); });
document.querySelectorAll("[data-close-modal]").forEach((button) => { button.onclick = closeProduct; });
$("#addToCart").onclick = addActiveProductToCart;
$("#requestOtp").onclick = requestOtp;
$("#submitOrder").onclick = submitOrder;
$("#pickupMode").addEventListener("change", async () => {
  const later = $("#pickupMode").value === "later";
  $("#pickupAtField").classList.toggle("hidden", !later);
  resetOtp();
  if (later && await loadShopState({ quiet: true })) await loadSlots({ preserveSelection: false });
});
modal.onclick = (event) => { if (event.target === modal) closeProduct(); };

setInterval(() => loadShopState({ quiet: true }), 30_000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadShopState({ quiet: true });
});

init().catch((error) => {
  console.error(error);
  setCheckoutMessage("Die Preview konnte nicht vollständig initialisiert werden.", "error");
});
