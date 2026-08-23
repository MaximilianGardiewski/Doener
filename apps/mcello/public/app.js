const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const CART_KEY = "mcello-preview-cart-v2";
const CART_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const media = "/media/placeholder.svg";
const $ = (selector) => document.querySelector(selector);

const state = {
  categories: [],
  items: [],
  crossSellRules: [],
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
  menuAt: null,
  analyticsSessionId: createUuid(),
  analyticsImpressions: new Set(),
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

function createUuid() {
  return globalThis.crypto?.randomUUID?.() || null;
}

function analyticsContext() {
  const clientEventId = createUuid();
  if (!clientEventId || !state.analyticsSessionId) return null;
  return {
    clientEventId,
    anonymousSessionId: state.analyticsSessionId,
    occurredAt: new Date().toISOString(),
  };
}

function emitAnalytics(eventName, details = {}) {
  const context = analyticsContext();
  if (!context || !state.backendReady || !state.locationId) return;
  fetch("/api/analytics/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...context, locationId: state.locationId, eventName, ...details }),
    keepalive: true,
  }).catch(() => undefined);
}

function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function saveCart() {
  persistCart();
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
      const optionLines = (line.selectionLabels || [])
        .map((label) => `<small class="cart-line-detail">${esc(label)}</small>`)
        .join("");
      return `<div class="cart-item">
        <div><strong>${line.quantity || 1}× ${esc(line.name)}</strong>${optionLines}${line.comment ? `<small class="cart-line-detail">Wunsch: ${esc(line.comment)}</small>` : ""}</div>
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
  renderCartRecommendations();
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
  const slotScoped = Boolean(state.menuAt);
  if (!product.orderableOnline) return '<span class="availability-badge">Nur vor Ort · online deaktiviert</span>';
  if (product.soldOut) return `<span class="availability-badge bad">${slotScoped ? "Für diesen Slot ausverkauft" : "Heute ausverkauft"}</span>`;
  if (product.availableNow === false) return `<span class="availability-badge">${slotScoped ? "Für diesen Abholslot nicht verfügbar" : "Aktuell nicht verfügbar"}</span>`;
  return `<span class="availability-badge good">${slotScoped ? "Für diesen Abholslot konfigurierbar" : "Online konfigurierbar"}</span>`;
}

function selectedOptions(selections = []) {
  return new Set(selections.flatMap((selection) => selection.optionIds || []));
}

function recommendationProducts(product, selections = [], limit = 4) {
  if (!product) return [];
  const recommendations = [];
  const seen = new Set([product.id, ...state.cart.map((line) => line.productId)]);
  const optionIds = selectedOptions(selections);
  const append = (id, ruleId = null) => {
    if (!id || seen.has(id) || recommendations.length >= limit) return;
    const suggested = state.items.find((candidate) => candidate.id === id);
    if (!suggested) return;
    seen.add(id);
    recommendations.push({ product: suggested, sourceProductId: product.id, ruleId });
  };

  for (const id of product.crossSellIds || []) append(id);
  for (const rule of state.crossSellRules) {
    if (recommendations.length >= limit) break;
    const matches = (rule.triggerCategoryId && rule.triggerCategoryId === product.categoryId)
      || (rule.triggerModifierOptionId && optionIds.has(rule.triggerModifierOptionId));
    if (!matches) continue;
    const ruleTargets = rule.suggestedProductId
      ? [rule.suggestedProductId]
      : state.items.filter((candidate) => candidate.categoryId === rule.suggestedCategoryId).map((candidate) => candidate.id);
    for (const id of ruleTargets.slice(0, Number(rule.maxSuggestions || 3))) append(id, rule.id);
  }

  return recommendations;
}

function recommendationAnalyticsDetails(recommendation, surface) {
  return {
    productId: recommendation.product.id,
    sourceProductId: recommendation.sourceProductId,
    crossSellRuleId: recommendation.ruleId || undefined,
    surface,
  };
}

function trackRecommendationImpressions(recommendations, surface) {
  for (const recommendation of recommendations) {
    const key = [surface, recommendation.sourceProductId, recommendation.product.id, recommendation.ruleId || "curated"].join(":");
    if (state.analyticsImpressions.has(key)) continue;
    state.analyticsImpressions.add(key);
    emitAnalytics("recommendation_impression", recommendationAnalyticsDetails(recommendation, surface));
  }
}

function bindRecommendationButtons(target, surface) {
  target.querySelectorAll("[data-recommended-product]").forEach((button) => {
    button.onclick = () => {
      emitAnalytics("recommendation_select", {
        productId: button.dataset.recommendedProduct,
        sourceProductId: button.dataset.sourceProduct,
        crossSellRuleId: button.dataset.crossSellRule || undefined,
        surface,
      });
      drawer.classList.remove("open");
      openProduct(button.dataset.recommendedProduct);
    };
  });
}

function recommendationMarkup(recommendations, title, description) {
  return `<h3>${esc(title)}</h3><p>${esc(description)}</p><div class="recommendation-grid">${recommendations.map((recommendation) => `
    <article class="recommendation-card">
      <div><strong>${esc(recommendation.product.name)}</strong><small>${euro.format(recommendation.product.basePriceCents / 100)}</small></div>
      <button class="ghost-btn" data-recommended-product="${recommendation.product.id}" data-source-product="${recommendation.sourceProductId}" ${recommendation.ruleId ? `data-cross-sell-rule="${recommendation.ruleId}"` : ""} ${productOrderable(recommendation.product) ? "" : "disabled"}>${productOrderable(recommendation.product) ? "Ansehen" : "Nicht verfügbar"}</button>
    </article>
  `).join("")}</div>`;
}

function renderProductRecommendations() {
  const target = $("#productRecommendations");
  const recommendations = recommendationProducts(state.activeProduct, state.selections);
  target.classList.toggle("hidden", recommendations.length === 0);
  target.innerHTML = recommendations.length
    ? recommendationMarkup(recommendations, "Passt dazu", "Direkt gepflegt oder passend zu deiner aktuellen Auswahl.")
    : "";
  if (recommendations.length) {
    bindRecommendationButtons(target, "product_modal");
    trackRecommendationImpressions(recommendations, "product_modal");
  }
}

function renderCartRecommendations() {
  const target = $("#cartRecommendations");
  const recommendations = [];
  const seen = new Set();
  for (const line of state.cart) {
    const product = state.items.find((candidate) => candidate.id === line.productId);
    for (const recommendation of recommendationProducts(product, line.selections || [], 4)) {
      if (seen.has(recommendation.product.id)) continue;
      seen.add(recommendation.product.id);
      recommendations.push(recommendation);
      if (recommendations.length >= 4) break;
    }
    if (recommendations.length >= 4) break;
  }
  target.classList.toggle("hidden", recommendations.length === 0);
  target.innerHTML = recommendations.length
    ? recommendationMarkup(recommendations, "Noch etwas dazu?", "Kuratierte Ergänzungen zu deinem Warenkorb.")
    : "";
  if (recommendations.length) {
    bindRecommendationButtons(target, "cart");
    trackRecommendationImpressions(recommendations, "cart");
  }
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

  const category = state.categories.find((entry) => entry.id === product.categoryId);
  modal.dataset.productId = product.id;
  modal.dataset.categorySlug = category?.slug || "";
  modal.dataset.defaultOptionCount = String((product.modifierGroups || [])
    .reduce((total, group) => total + group.options.filter((option) => option.defaultSelected && !option.soldOut).length, 0));

  $("#modalTitle").textContent = product.name;
  $("#modalDescription").textContent = product.description || "Produktdetails werden aus dem Backend gepflegt.";
  $("#modalImage").src = media;
  $("#specialRequest").value = "";
  $("#productAvailability").innerHTML = productBadge(product);
  renderModifiers();
  renderProductRecommendations();
  updateAddButton();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  emitAnalytics("product_view", { productId: product.id });
}

function closeProduct() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  delete modal.dataset.productId;
  delete modal.dataset.categorySlug;
  delete modal.dataset.defaultOptionCount;
  delete modal.dataset.configurationValid;
}

function renderModifiers() {
  const product = state.activeProduct;
  const groups = product?.modifierGroups || [];
  $("#modifierGroups").innerHTML = groups.map((group) => {
    const inputType = group.maxSelections === 1 ? "radio" : "checkbox";
    const required = group.minSelections > 0;
    const requiredText = required ? `Pflicht · mind. ${group.minSelections}` : "Optional";
    return `<section class="modifier-group" data-group-id="${esc(group.id)}" data-group-name="${esc(group.name)}" data-required="${required}" data-min-selections="${group.minSelections}" data-max-selections="${group.maxSelections}">
      <div class="modifier-head"><strong>${esc(group.name)}</strong><small>${requiredText}${group.maxSelections > 1 ? ` · max. ${group.maxSelections}` : ""}</small></div>
      <div class="modifier-options">${group.options.map((option) => {
        const checked = selectedOptionIds(group.id).includes(option.id) ? "checked" : "";
        const disabled = option.soldOut ? "disabled" : "";
        const paid = option.priceDeltaCents > 0;
        const delta = option.priceDeltaCents === 0 ? "inkl." : `${paid ? "+" : ""}${euro.format(option.priceDeltaCents / 100)}`;
        return `<label class="modifier-option" data-option-id="${esc(option.id)}" data-option-name="${esc(option.name)}" data-price-delta-cents="${option.priceDeltaCents}" data-paid="${paid}" data-default-selected="${Boolean(option.defaultSelected)}" data-sold-out="${Boolean(option.soldOut)}"><input type="${inputType}" name="modifier-${group.id}" value="${option.id}" data-group-id="${group.id}" ${checked} ${disabled}><span>${esc(option.name)}${option.soldOut ? " · ausverkauft" : ""}</span><span>${delta}</span></label>`;
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
  renderProductRecommendations();
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
  const orderable = productOrderable(product);
  const valid = orderable && configurationValid(product);
  button.disabled = !valid;
  modal.dataset.configurationValid = String(valid);
  /*
   * Published separately because "cannot order" and "configuration incomplete"
   * are different situations with different remedies, and presentation must not
   * guess which one it is looking at from a disabled button.
   */
  modal.dataset.productOrderable = String(orderable);
  button.textContent = productOrderable(product)
    ? `In den Warenkorb · ${euro.format(configuredPrice(product) / 100)}`
    : "Online derzeit nicht bestellbar";
}

function selectionLabels(product, selections = state.selections) {
  const selectedIn = (groupId) => selections.find((selection) => selection.groupId === groupId)?.optionIds || [];
  const labels = [];
  const removed = [];

  for (const group of product.modifierGroups || []) {
    const chosen = selectedIn(group.id);
    // Follow the catalog's option order so the summary stays stable no matter
    // in which order the guest tapped.
    const names = group.options.filter((option) => chosen.includes(option.id)).map((option) => option.name);
    if (names.length) labels.push(`${group.name}: ${names.join(", ")}`);

    /*
     * "Ohne" means the guest took something out, and only a group they can add
     * to and remove from can express that. In a single-choice group, picking the
     * large size is not "without the small one" -- the choice is already stated
     * by the line above, and saying it twice puts a contradiction on the kitchen
     * ticket. A sold-out default is not a removal either: the guest was never
     * able to select it.
     */
    if (group.maxSelections === 1) continue;
    for (const option of group.options) {
      if (!option.defaultSelected || option.soldOut) continue;
      if (!chosen.includes(option.id)) removed.push(option.name);
    }
  }

  if (removed.length) labels.push(`Ohne: ${removed.join(", ")}`);
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
  emitAnalytics("cart_add", { productId: product.id });
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
  $("#pickupSlot").addEventListener("change", async () => {
    resetOtp();
    const selected = $("#pickupSlot").value || null;
    await refreshMenuSnapshot(selected);
    if (selected) {
      const issues = validateAndRepriceCart();
      if (issues.length) setCheckoutMessage(issues[0], "error");
    }
  });
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

function currentSelectionsForLine(line) {
  return new Map((line.selections || []).map((selection) => [selection.groupId, selection.optionIds || []]));
}

function validateAndRepriceCart() {
  const issues = [];
  let changed = false;

  for (const line of state.cart) {
    const product = state.items.find((candidate) => candidate.id === line.productId);
    if (!product || !productOrderable(product)) {
      issues.push(`${line.name} ist für den gewählten Abholzeitpunkt nicht verfügbar. Bitte aus dem Warenkorb entfernen oder einen anderen Slot wählen.`);
      continue;
    }

    const groups = new Map((product.modifierGroups || []).map((group) => [group.id, group]));
    const selected = currentSelectionsForLine(line);
    let valid = true;

    for (const groupId of selected.keys()) {
      if (!groups.has(groupId)) {
        valid = false;
        break;
      }
    }

    let currentPrice = product.basePriceCents;
    for (const group of product.modifierGroups || []) {
      const optionIds = selected.get(group.id) || [];
      if (optionIds.length < group.minSelections || optionIds.length > group.maxSelections) {
        valid = false;
        break;
      }
      for (const optionId of optionIds) {
        const option = group.options.find((candidate) => candidate.id === optionId);
        if (!option || option.soldOut) {
          valid = false;
          break;
        }
        currentPrice += option.priceDeltaCents || 0;
      }
      if (!valid) break;
    }

    if (!valid) {
      issues.push(`${line.name} wurde bei Zutaten, Sauce, Größe oder Extras geändert. Bitte neu konfigurieren.`);
      continue;
    }

    const labels = selectionLabels(product, [...selected].map(([groupId, optionIds]) => ({ groupId, optionIds })));

    if (line.name !== product.name || line.unitPriceCents !== currentPrice || JSON.stringify(line.selectionLabels || []) !== JSON.stringify(labels)) {
      line.name = product.name;
      line.unitPriceCents = currentPrice;
      line.selectionLabels = labels;
      changed = true;
    }
  }

  if (changed) {
    persistCart();
    renderCart();
  }
  return issues;
}

async function refreshMenuSnapshot(at = null) {
  if (!state.backendReady) return false;
  try {
    const catalog = await loadMenu(at, { allowFallback: false });
    const previousCategory = state.categoryId;
    state.locationId = catalog.locationId;
    state.categories = catalog.categories;
    state.items = catalog.items;
    state.crossSellRules = catalog.crossSellRules;
    state.menuAt = at;
    state.categoryId = state.categories.some((category) => category.id === previousCategory)
      ? previousCategory
      : null;
    if (!state.categoryId) setInitialCategory();
    renderRail();
    renderMenu();
    renderCart();
    return true;
  } catch (error) {
    setCheckoutMessage(error.message || "Speisekarte konnte für den Abholzeitpunkt nicht aktualisiert werden.", "error");
    return false;
  }
}

async function prepareCartForCheckout(requestedPickupAt = null) {
  const refreshed = await refreshMenuSnapshot(requestedPickupAt);
  if (!refreshed) return false;
  const issues = validateAndRepriceCart();
  if (issues.length) {
    setCheckoutMessage(issues[0], "error");
    return false;
  }
  return true;
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

  let requestedPickupAt = null;
  if ($("#pickupMode").value === "later") {
    const selectedBeforeRefresh = $("#pickupSlot")?.value || "";
    if (!selectedBeforeRefresh) {
      setCheckoutMessage("Bitte zuerst einen freien Abholslot auswählen.", "error");
      return;
    }
    await loadSlots({ preserveSelection: true });
    if (!$("#pickupSlot")?.value || $("#pickupSlot").value !== selectedBeforeRefresh) {
      await refreshMenuSnapshot(null);
      setCheckoutMessage("Der gewählte Slot ist nicht mehr frei. Bitte einen neuen Slot auswählen.", "error");
      resetOtp();
      return;
    }
    requestedPickupAt = selectedBeforeRefresh;
  }

  if (!await prepareCartForCheckout(requestedPickupAt)) return;

  emitAnalytics("checkout_started");

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
      await refreshMenuSnapshot(null);
      setCheckoutMessage("Der gewählte Slot ist nicht mehr frei. Bitte einen neuen Slot auswählen und die Nummer erneut verifizieren.", "error");
      return;
    }
    requestedPickupAt = selectedBeforeRefresh;
  }

  if (!await prepareCartForCheckout(requestedPickupAt)) return;

  const button = $("#submitOrder");
  button.disabled = true;
  setCheckoutMessage("Backend prüft Preise, Optionen, Öffnungszeit und Slot-Kapazität …");
  try {
    const orderAnalytics = analyticsContext();
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
        analytics: orderAnalytics || undefined,
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
  const crossSellsByProduct = new Map((raw.productCrossSells || []).map((entry) => [
    entry.productId,
    Array.isArray(entry.suggestedProductIds) ? entry.suggestedProductIds : [],
  ]));
  const categories = (raw.categories || []).map((category) => ({
    id: category.id, slug: category.slug, name: category.name, sort: category.sort,
  }));
  const items = (raw.categories || []).flatMap((category) => (category.products || []).map((product) => ({
    ...product,
    categoryId: category.id,
    modifierGroups: product.modifierGroups || [],
    crossSellIds: crossSellsByProduct.get(product.id) || [],
  })));
  return {
    locationId: raw.locationId,
    categories,
    items,
    crossSellRules: Array.isArray(raw.crossSellRules) ? raw.crossSellRules : [],
    source: "database",
  };
}

function normalizeFallback(raw) {
  const categories = raw.categories.map(([slug, name, sort]) => ({ id: slug, slug, name, sort }));
  const items = raw.items.map(([id, categoryId, name, description, basePriceCents, variants, orderableOnline]) => ({
    id, categoryId, name, description, basePriceCents, orderableOnline,
    availableNow: orderableOnline, soldOut: false, ownerConfirmed: false,
    crossSellIds: [],
    modifierGroups: variants.length ? [{
      id: `fallback-size-${id}`, name: "Größe", minSelections: 1, maxSelections: 1,
      options: variants.map(([label, priceCents], index) => ({
        id: `fallback-size-${id}-${index}`, name: label,
        priceDeltaCents: priceCents - basePriceCents, defaultSelected: index === 0, soldOut: false,
      })),
    }] : [],
  }));
  return { locationId: "static-preview", categories, items, crossSellRules: [], source: "static" };
}

async function loadMenu(at = null, { allowFallback = true } = {}) {
  try {
    const query = at ? `?at=${encodeURIComponent(at)}` : "";
    const response = await fetch(`/api/menu${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Speisekarte konnte nicht aus dem lokalen Backend geladen werden.");
    return normalizeDbMenu(await response.json());
  } catch (error) {
    if (!allowFallback) throw error;
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
  if (before !== state.cart.length) persistCart();
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
  state.crossSellRules = catalog.crossSellRules;
  state.backendReady = backendReady && catalog.source === "database";
  state.menuAt = null;
  setInitialCategory();
  reconcileCartWithMenu();
  renderRail();
  renderMenu();
  renderCart();
  emitAnalytics("menu_view");

  $("#menuSourceText").textContent = catalog.source === "database"
    ? "Lokale DB-Speisekarte: 97 transkribierte Positionen bleiben bis zur Inhaber-Freigabe ausdrücklich vorläufig. Bei Vorbestellungen wird die Produkt- und Zutatenverfügbarkeit für den gewählten Abholslot neu ausgewertet."
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
  if (later && await loadShopState({ quiet: true })) {
    await loadSlots({ preserveSelection: false });
  } else if (!later) {
    await refreshMenuSnapshot(null);
    validateAndRepriceCart();
  }
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
