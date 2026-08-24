const EVENT_NAME = "mcello:builder-visual-state";
const CONTRACT_VERSION = 1;

const modal = document.querySelector("#productModal");
const groups = document.querySelector("#modifierGroups");

function selectedOptions(section) {
  const options = [...section.querySelectorAll(".modifier-option")]
    .filter((option) => option.querySelector("input:checked"));
  return {
    optionIds: options.map((option) => option.dataset.optionId || option.querySelector("input")?.value || "").filter(Boolean),
    optionNames: options.map((option) => option.dataset.optionName || "").filter(Boolean),
  };
}

function snapshot() {
  return {
    version: CONTRACT_VERSION,
    productId: modal?.dataset.productId || null,
    categorySlug: modal?.dataset.categorySlug || null,
    groups: groups
      ? [...groups.querySelectorAll(".modifier-group")].map((section) => ({
          groupId: section.dataset.groupId || "",
          groupName: section.dataset.groupName || "",
          ...selectedOptions(section),
        })).filter((group) => group.groupId)
      : [],
  };
}

if (modal && groups) {
  let revision = 0;
  let scheduled = false;
  let scheduledReason = "content-refresh";

  modal.dataset.builderVisualContract = "ingredient-layer-v1";
  modal.dataset.builderVisualState = "idle";

  const publish = () => {
    scheduled = false;
    if (!modal.classList.contains("open")) return;
    revision += 1;
    modal.dataset.builderVisualState = "active";
    modal.dataset.builderVisualRevision = String(revision);
    document.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: {
        ...snapshot(),
        revision,
        reason: scheduledReason,
      },
    }));
  };

  const schedule = (reason) => {
    scheduledReason = reason;
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(publish);
  };

  groups.addEventListener("change", () => schedule("selection-change"));

  new MutationObserver(() => {
    if (modal.classList.contains("open")) schedule("content-refresh");
  }).observe(groups, { childList: true, subtree: true });

  new MutationObserver(() => {
    if (modal.classList.contains("open")) {
      schedule("open");
      return;
    }
    modal.dataset.builderVisualState = "idle";
  }).observe(modal, {
    attributes: true,
    attributeFilter: ["class", "data-product-id", "data-category-slug"],
  });
}
