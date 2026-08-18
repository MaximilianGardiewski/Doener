import "./pizza-builder-v2.js";

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/builder-core-v2.css";
stylesheet.dataset.mcelloBuilderCore = "true";
document.head.appendChild(stylesheet);

const modalBackdrop = document.querySelector("#productModal");
const modal = modalBackdrop?.querySelector(".modal");
const foodStage = document.querySelector("#modalImage");
const content = modal?.querySelector(".modal-content");
const groups = document.querySelector("#modifierGroups");
const footer = modal?.querySelector(".modal-footer");
const addButton = document.querySelector("#addToCart");
let guidedStepIndex = 0;

function currentSelectionSignature() {
  if (!groups) return "[]";
  return JSON.stringify([...groups.querySelectorAll("input:checked")]
    .map((input) => [input.dataset.groupId || "", input.value])
    .sort(([aGroup, aValue], [bGroup, bValue]) => aGroup.localeCompare(bGroup) || aValue.localeCompare(bValue)));
}

function ensureBuilderContext() {
  if (!content || !groups) return null;
  let context = content.querySelector("[data-builder-context]");
  if (context) return context;

  context = document.createElement("section");
  context.className = "builder-context";
  context.dataset.builderContext = "true";
  context.innerHTML = `
    <div>
      <span class="builder-context-label">Mcello Original</span>
      <strong>Dein Ausgangspunkt</strong>
    </div>
    <small data-builder-selection-state>Standardauswahl · anpassbar</small>
  `;
  groups.before(context);
  return context;
}

function ensureGuidedNavigation() {
  if (!content || !groups) return null;
  let navigation = content.querySelector("[data-builder-guided-nav]");
  if (navigation) return navigation;

  navigation = document.createElement("nav");
  navigation.className = "builder-guided-nav";
  navigation.dataset.builderGuidedNav = "true";
  navigation.setAttribute("aria-label", "Builder Schritte");
  navigation.innerHTML = `
    <button class="pill" type="button" data-builder-step-back>Zurück</button>
    <div class="builder-guided-progress" aria-live="polite">
      <strong data-builder-step-progress>1 / 1</strong>
      <span data-builder-step-name>Auswahl</span>
    </div>
    <button class="primary" type="button" data-builder-step-next>Weiter</button>
  `;
  groups.before(navigation);
  navigation.querySelector("[data-builder-step-back]")?.addEventListener("click", () => moveGuidedStep(-1));
  navigation.querySelector("[data-builder-step-next]")?.addEventListener("click", () => moveGuidedStep(1));
  return navigation;
}

function ensureOrientationGate() {
  if (!modalBackdrop) return null;
  let gate = modalBackdrop.querySelector("[data-builder-orientation-gate]");
  if (gate) return gate;

  gate = document.createElement("section");
  gate.className = "builder-orientation-gate";
  gate.dataset.builderOrientationGate = "true";
  gate.setAttribute("aria-label", "Querformat für den Mcello Builder erforderlich");
  gate.setAttribute("aria-hidden", "true");
  gate.innerHTML = `
    <div class="builder-orientation-card">
      <span class="builder-orientation-icon" aria-hidden="true">↻</span>
      <div>
        <span class="builder-context-label">Mcello Builder</span>
        <h2>Bitte ins Querformat drehen.</h2>
        <p>Auf Smartphone und Tablet wird der Builder als breite Food-Workbench genutzt. Deine bisherige Auswahl bleibt beim Drehen erhalten.</p>
      </div>
      <button class="pill" type="button" data-builder-gate-close>Zurück zum Shop</button>
    </div>
  `;
  gate.querySelector("[data-builder-gate-close]")?.addEventListener("click", () => modal?.querySelector("[data-close-modal]")?.click());
  modalBackdrop.appendChild(gate);
  return gate;
}

function isTouchBuilderDevice() {
  const coarsePointer = globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const touchCapable = coarsePointer || Number(navigator.maxTouchPoints || 0) > 0;
  return touchCapable && window.innerWidth <= 1366;
}

function updateViewportContract() {
  if (!modalBackdrop) return;
  const touch = isTouchBuilderDevice();
  const orientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
  modalBackdrop.dataset.builderDevice = touch ? "touch" : "desktop";
  modalBackdrop.dataset.builderOrientation = orientation;
  const gate = ensureOrientationGate();
  const gated = Boolean(modalBackdrop.classList.contains("open") && touch && orientation === "portrait");
  if (gate) gate.setAttribute("aria-hidden", gated ? "false" : "true");
}

function stepSections() {
  return groups ? [...groups.querySelectorAll(".modifier-group")] : [];
}

function stepName(section, index) {
  return section?.querySelector(".modifier-head strong")?.textContent?.trim() || `Schritt ${index + 1}`;
}

function syncGuidedSteps({ reset = false } = {}) {
  const navigation = ensureGuidedNavigation();
  const sections = stepSections();
  if (!navigation) return;
  navigation.hidden = sections.length === 0;
  if (reset) guidedStepIndex = 0;
  if (!sections.length) return;
  guidedStepIndex = Math.max(0, Math.min(guidedStepIndex, sections.length - 1));
  sections.forEach((section, index) => {
    section.dataset.builderStepCurrent = index === guidedStepIndex ? "true" : "false";
  });
  navigation.querySelector("[data-builder-step-progress]").textContent = `${guidedStepIndex + 1} / ${sections.length}`;
  navigation.querySelector("[data-builder-step-name]").textContent = stepName(sections[guidedStepIndex], guidedStepIndex);
  const previous = navigation.querySelector("[data-builder-step-back]");
  const next = navigation.querySelector("[data-builder-step-next]");
  if (previous) previous.disabled = guidedStepIndex === 0;
  if (next) next.textContent = guidedStepIndex === sections.length - 1 ? "Fertig" : "Weiter";
}

function moveGuidedStep(direction) {
  const sections = stepSections();
  if (!sections.length) return;
  if (direction > 0 && guidedStepIndex === sections.length - 1) {
    addButton?.focus({ preventScroll: true });
    addButton?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  guidedStepIndex = Math.max(0, Math.min(guidedStepIndex + direction, sections.length - 1));
  syncGuidedSteps();
  sections[guidedStepIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function decorateGroups() {
  if (!groups) return;
  const sections = stepSections();
  groups.dataset.builderSteps = String(sections.length);
  sections.forEach((section, index) => {
    section.classList.add("builder-step");
    section.dataset.builderStepIndex = String(index + 1);
    section.style.setProperty("--builder-step-index", String(index + 1));
    section.querySelector(".modifier-head")?.setAttribute("data-builder-step-label", `Schritt ${index + 1}`);
    for (const option of section.querySelectorAll(".modifier-option")) option.dataset.builderOption = "true";
  });
  syncGuidedSteps();
}

function updateSelectionState() {
  if (!modalBackdrop?.classList.contains("open")) return;
  const state = document.querySelector("[data-builder-selection-state]");
  if (!state) return;
  const original = modalBackdrop.dataset.builderOriginalSelection || "[]";
  const current = currentSelectionSignature();
  const isOriginal = current === original;
  modalBackdrop.dataset.builderRecipeState = isOriginal ? "original" : "customized";
  state.textContent = isOriginal ? "Standardauswahl · anpassbar" : "Angepasst · Preis wird live aktualisiert";
}

function captureOriginalSelection() {
  if (!modalBackdrop?.classList.contains("open")) return;
  decorateGroups();
  const context = ensureBuilderContext();
  if (context) context.hidden = groups?.querySelectorAll(".modifier-group").length === 0;
  modalBackdrop.dataset.builderOriginalSelection = currentSelectionSignature();
  modalBackdrop.dataset.builderRecipeState = "original";
  syncGuidedSteps({ reset: true });
  updateSelectionState();
  updateViewportContract();
}

function decorateBuilder() {
  modal?.setAttribute("data-builder-version", "core-v2");
  foodStage?.setAttribute("data-builder-food-stage", "true");
  content?.setAttribute("data-builder-controls", "true");
  groups?.setAttribute("data-builder-modifiers", "true");
  footer?.setAttribute("data-builder-action-bar", "true");
  ensureOrientationGate();
  ensureGuidedNavigation();
  decorateGroups();
  updateViewportContract();
}

decorateBuilder();

if (groups) {
  new MutationObserver(() => {
    decorateGroups();
    if (modalBackdrop?.classList.contains("open") && !modalBackdrop.dataset.builderOriginalSelection) queueMicrotask(captureOriginalSelection);
  }).observe(groups, { childList: true, subtree: true });
  groups.addEventListener("change", () => queueMicrotask(updateSelectionState));
}

if (modalBackdrop) {
  new MutationObserver(() => {
    if (modalBackdrop.classList.contains("open")) {
      delete modalBackdrop.dataset.builderOriginalSelection;
      queueMicrotask(captureOriginalSelection);
      return;
    }
    delete modalBackdrop.dataset.builderOriginalSelection;
    delete modalBackdrop.dataset.builderRecipeState;
    guidedStepIndex = 0;
    updateViewportContract();
  }).observe(modalBackdrop, { attributes: true, attributeFilter: ["class"] });
}

window.addEventListener("resize", updateViewportContract, { passive: true });
globalThis.screen?.orientation?.addEventListener?.("change", updateViewportContract);