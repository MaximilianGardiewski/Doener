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

function decorateGroups() {
  if (!groups) return;
  const sections = [...groups.querySelectorAll(".modifier-group")];
  groups.dataset.builderSteps = String(sections.length);
  sections.forEach((section, index) => {
    section.classList.add("builder-step");
    section.dataset.builderStepIndex = String(index + 1);
    section.style.setProperty("--builder-step-index", String(index + 1));
    section.querySelector(".modifier-head")?.setAttribute("data-builder-step-label", `Schritt ${index + 1}`);
    for (const option of section.querySelectorAll(".modifier-option")) option.dataset.builderOption = "true";
  });
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
  updateSelectionState();
}

function decorateBuilder() {
  modal?.setAttribute("data-builder-version", "core-v2");
  foodStage?.setAttribute("data-builder-food-stage", "true");
  content?.setAttribute("data-builder-controls", "true");
  groups?.setAttribute("data-builder-modifiers", "true");
  footer?.setAttribute("data-builder-action-bar", "true");
  decorateGroups();
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
  }).observe(modalBackdrop, { attributes: true, attributeFilter: ["class"] });
}
