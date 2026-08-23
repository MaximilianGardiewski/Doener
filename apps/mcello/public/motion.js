const motionStylesheet = document.createElement("link");
motionStylesheet.rel = "stylesheet";
motionStylesheet.href = "/motion.css";
motionStylesheet.dataset.mcelloMotion = "true";
document.head.appendChild(motionStylesheet);

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let commerceMotionV3 = null;
const revealSelector = [
  ".hero-copy",
  ".hero-media",
  ".section-head",
  ".story-card",
  ".news-stack",
  ".gallery",
].join(",");

function revealImmediately(nodes) {
  document.documentElement.classList.remove("motion-ready");
  nodes.forEach((node) => node.classList.add("is-revealed"));
}

function installRevealMotion() {
  const nodes = [...document.querySelectorAll(revealSelector)];
  nodes.forEach((node, index) => {
    node.dataset.reveal = node.classList.contains("hero-media") ? "hero-media" : "section";
    node.style.setProperty("--reveal-delay", `${Math.min(index % 3, 2) * 70}ms`);
  });

  if (reducedMotion.matches || !("IntersectionObserver" in window)) {
    document.documentElement.dataset.mcelloRevealEngine = reducedMotion.matches ? "reduced" : "v2";
    revealImmediately(nodes);
    return { nodes, observer: null, reduced: reducedMotion.matches };
  }

  document.documentElement.dataset.mcelloRevealEngine = "v2";
  document.documentElement.classList.add("motion-ready");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-revealed");
      observer.unobserve(entry.target);
    }
  }, {
    rootMargin: "0px 0px -8% 0px",
    threshold: 0.12,
  });

  nodes.forEach((node) => observer.observe(node));
  return { nodes, observer, reduced: false };
}

function restartMotionClass(node, className, duration = 420) {
  if (!node || reducedMotion.matches) return;
  node.classList.remove(className);
  requestAnimationFrame(() => {
    node.classList.add(className);
    window.setTimeout(() => node.classList.remove(className), duration);
  });
}

function installHeroFoodDepth() {
  const hero = document.querySelector(".hero-v2");
  const foodVisual = document.querySelector(".hero-media-v2 .hero-photo");
  if (!hero || !foodVisual) return null;

  let frame = 0;
  let active = true;

  const update = () => {
    frame = 0;
    if (!active) return;
    if (reducedMotion.matches) {
      foodVisual.style.removeProperty("--motion-hero-depth-y");
      return;
    }
    const rect = hero.getBoundingClientRect();
    const viewportCenter = window.innerHeight / 2;
    const heroCenter = rect.top + rect.height / 2;
    const normalized = Math.max(-1, Math.min(1, (viewportCenter - heroCenter) / Math.max(window.innerHeight, 1)));
    foodVisual.style.setProperty("--motion-hero-depth-y", `${(normalized * 10).toFixed(2)}px`);
  };

  const schedule = () => {
    if (!active || frame) return;
    frame = requestAnimationFrame(update);
  };

  const handlePreferenceChange = () => {
    document.documentElement.dataset.mcelloHeroEngine = reducedMotion.matches ? "reduced" : "v2";
    schedule();
  };

  document.documentElement.dataset.mcelloHeroEngine = reducedMotion.matches ? "reduced" : "v2";
  update();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  reducedMotion.addEventListener?.("change", handlePreferenceChange);

  return {
    hero,
    foodVisual,
    get reduced() {
      return reducedMotion.matches;
    },
    cleanup() {
      if (!active) return;
      active = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reducedMotion.removeEventListener?.("change", handlePreferenceChange);
      foodVisual.style.removeProperty("--motion-hero-depth-y");
    },
  };
}

function commerceEngineMode() {
  if (reducedMotion.matches) return "reduced";
  return commerceMotionV3 ? "gsap" : "v2";
}

function syncCommerceEngineLabels() {
  const mode = commerceEngineMode();
  document.documentElement.dataset.mcelloCategoryEngine = mode;
  document.documentElement.dataset.mcelloProductEngine = mode;
  document.documentElement.dataset.mcelloIngredientEngine = mode;
  document.documentElement.dataset.mcelloCartEngine = mode;
}

function activeFoodStage() {
  const donerYufkaStage = document.querySelector('#productModal.open [data-food-stage-v4="true"]');
  if (donerYufkaStage) return donerYufkaStage;
  if (document.querySelector("#productModal.open [data-pizza-stage]")) return null;
  return document.querySelector("#productModal.open .modal-hero");
}

function cartCommitSucceededAfterClick() {
  const drawer = document.querySelector("#cartDrawer");
  return Boolean(drawer?.classList.contains("open") && !document.querySelector("#productModal.open"));
}

function cartFlightSourceRect() {
  const node = activeFoodStage() || document.querySelector("#productModal.open .modal-hero");
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return rect.width && rect.height ? rect : null;
}

// A deliberately small token, not a duplicate of the full FoodStage/product art.
const CART_FLIGHT_GHOST_SIZE = 64;

function createCartFlightGhost(rect, renderedSrc = null) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const ghost = document.createElement("div");
  ghost.className = "motion-cart-flight-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.setProperty("position", "fixed");
  ghost.style.setProperty("left", `${centerX - CART_FLIGHT_GHOST_SIZE / 2}px`);
  ghost.style.setProperty("top", `${centerY - CART_FLIGHT_GHOST_SIZE / 2}px`);
  ghost.style.setProperty("width", `${CART_FLIGHT_GHOST_SIZE}px`);
  ghost.style.setProperty("height", `${CART_FLIGHT_GHOST_SIZE}px`);
  if (renderedSrc) ghost.style.setProperty("background-image", `url("${renderedSrc}")`);
  document.body.appendChild(ghost);
  return ghost;
}

let fallbackCartFlightGhost = null;

/*
 * GSAP-unavailable path: a bounded CSS keyframe carries the same ghost to the
 * same destination instead of a GSAP timeline, then removes the node itself.
 */
function runFallbackCartFlight(ghost, travel) {
  if (fallbackCartFlightGhost && fallbackCartFlightGhost !== ghost) fallbackCartFlightGhost.remove();
  fallbackCartFlightGhost = ghost;
  ghost.style.setProperty("--motion-flight-x", `${travel.deltaX}px`);
  ghost.style.setProperty("--motion-flight-y", `${travel.deltaY}px`);
  ghost.style.setProperty("--motion-flight-scale", `${travel.scale}`);
  const remove = () => {
    if (fallbackCartFlightGhost === ghost) fallbackCartFlightGhost = null;
    ghost.remove();
  };
  ghost.addEventListener("animationend", remove, { once: true });
  window.setTimeout(remove, 640);
  ghost.classList.add("motion-cart-flight");
}

function launchCartFlight(sourceRect, renderedSrc = null) {
  if (reducedMotion.matches || !sourceRect || !cartCommitSucceededAfterClick()) return;
  const cartTarget = document.querySelector(".sticky-order") || document.querySelector("#cartCount");
  if (!cartTarget) return;
  const targetRect = cartTarget.getBoundingClientRect();
  if (!targetRect.width || !targetRect.height) return;

  const ghost = createCartFlightGhost(sourceRect, renderedSrc);
  const travel = {
    deltaX: (targetRect.left + targetRect.width / 2) - (sourceRect.left + sourceRect.width / 2),
    deltaY: (targetRect.top + targetRect.height / 2) - (sourceRect.top + sourceRect.height / 2),
    scale: 0.55,
  };

  const handledByV3 = Boolean(commerceMotionV3?.animateHandoffFlight({ ghost, ...travel }));
  if (!handledByV3) runFallbackCartFlight(ghost, travel);
}

function installCommerceMotionContracts() {
  syncCommerceEngineLabels();
  reducedMotion.addEventListener?.("change", syncCommerceEngineLabels);

  /*
   * Capture phase snapshots the source geometry while the product is still on
   * screen. The flight itself is deferred until after event dispatch so the
   * application has committed the cart mutation and closed the product modal.
   */
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const addToCart = target?.closest("#addToCart");
    if (!addToCart || addToCart.matches(":disabled") || reducedMotion.matches) return;
    const sourceRect = cartFlightSourceRect();
    if (!sourceRect) return;
    const renderedSrc = document.querySelector("#modalImage")?.getAttribute("src") || null;
    queueMicrotask(() => launchCartFlight(sourceRect, renderedSrc));
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const category = target.closest("[data-category]");
    if (category) {
      const categoryId = category.dataset.category || "selected";
      const stage = document.querySelector(".store-stage");
      if (stage) stage.dataset.motionCategory = categoryId;
      const featuredGrid = document.querySelector("#featuredGrid");
      const menuList = document.querySelector("#menuList");
      const activeChip = document.querySelector(`[data-category="${CSS.escape(categoryId)}"]`);
      const handledByV3 = !reducedMotion.matches && Boolean(commerceMotionV3?.animateCategoryChange({
        categoryId,
        stage,
        featuredGrid,
        menuList,
        activeChip,
      }));
      if (!handledByV3) {
        restartMotionClass(featuredGrid, "motion-category-switch", 320);
        restartMotionClass(menuList, "motion-category-switch", 320);
        restartMotionClass(activeChip, "motion-category-chip", 260);
      }
    }

    const productTrigger = target.closest("[data-product], [data-recommended-product]");
    if (productTrigger && !productTrigger.matches(":disabled")) {
      const source = productTrigger.closest(".food-card, .list-row, .recommendation-card");
      requestAnimationFrame(() => {
        const modal = document.querySelector("#productModal.open .modal");
        const handledByV3 = !reducedMotion.matches && Boolean(commerceMotionV3?.animateProductOpen({ source, modal }));
        if (!handledByV3) {
          restartMotionClass(source, "motion-product-activate", 320);
          restartMotionClass(modal, "motion-product-open", 380);
        }
      });
    }

    const addToCart = target.closest("#addToCart");
    if (addToCart && !addToCart.matches(":disabled") && cartCommitSucceededAfterClick()) {
      const sticky = document.querySelector(".sticky-order");
      const handledByV3 = !reducedMotion.matches && Boolean(commerceMotionV3?.animateCartConfirmation(sticky));
      if (!handledByV3 && !reducedMotion.matches && sticky) {
        sticky.dataset.motionCart = "added";
        restartMotionClass(sticky, "motion-cart-confirm", 440);
        window.setTimeout(() => {
          if (sticky) delete sticky.dataset.motionCart;
        }, 460);
      }
    }
  });

  document.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement
      ? event.target.closest("#modifierGroups input")
      : null;
    if (!input) return;

    const option = input.closest(".modifier-option");
    const selection = input.checked ? "added" : "removed";
    const foodStage = activeFoodStage();
    const handledByV3 = !reducedMotion.matches && Boolean(commerceMotionV3?.animateIngredientChange({
      option,
      foodStage,
      selection,
    }));
    if (handledByV3) return;

    if (option) option.dataset.motionSelection = selection;
    restartMotionClass(option, "motion-ingredient-change", 360);
    if (foodStage) foodStage.dataset.motionIngredient = selection;
    restartMotionClass(foodStage, "motion-food-stage-change", 380);
    window.setTimeout(() => {
      if (option) delete option.dataset.motionSelection;
      if (foodStage) delete foodStage.dataset.motionIngredient;
    }, 400);
  });
}

/*
 * Builder step and configured-total feedback read rendered DOM only. The Builder
 * shell decides which step is current and the application decides what the total
 * is; this layer just explains that something changed.
 */
function installBuilderStateMotion() {
  const groups = document.querySelector("#modifierGroups");
  const addAction = document.querySelector("#addToCart");
  const modal = document.querySelector("#productModal");

  if (groups) {
    let lastStepIndex = null;
    /*
     * Reset on close. The index survived the modal otherwise, so opening the
     * next product after stepping forward compared step 1 against the previous
     * product's last step and played a "back" transition for a move the guest
     * never made.
     */
    if (modal) {
      new MutationObserver(() => {
        if (!modal.classList.contains("open")) lastStepIndex = null;
      }).observe(modal, { attributes: true, attributeFilter: ["class"] });
    }
    new MutationObserver((records) => {
      const changed = records.some((record) => record.attributeName === "data-builder-step-current");
      if (!changed) return;
      const step = groups.querySelector('.builder-step[data-builder-step-current="true"]');
      if (!step) return;
      const index = Number(step.dataset.builderStepIndex || 0);
      const previous = lastStepIndex;
      lastStepIndex = index;
      if (previous === null || previous === index) return;

      const direction = index > previous ? 1 : -1;
      const handledByV3 = !reducedMotion.matches
        && Boolean(commerceMotionV3?.animateBuilderStep({ step, direction }));
      if (handledByV3) return;

      step.dataset.motionStepDirection = direction === 1 ? "forward" : "back";
      restartMotionClass(step, "motion-step-change", 340);
      window.setTimeout(() => delete step.dataset.motionStepDirection, 360);
    }).observe(groups, { subtree: true, attributes: true, attributeFilter: ["data-builder-step-current"] });
  }

  if (addAction) {
    let lastLabel = addAction.textContent;
    new MutationObserver(() => {
      const label = addAction.textContent;
      if (label === lastLabel) return;
      // The count-up engine echoes its own interpolation frames onto this same
      // node; comparing against its own last-written marker (rather than any
      // price arithmetic) is what lets a genuinely new application value be
      // told apart from this engine's own presentation frames.
      const isOwnEcho = label === addAction.dataset.motionTotalRendered;
      const previousLabel = lastLabel;
      lastLabel = label;
      if (isOwnEcho) return;
      if (!modal?.classList.contains("open")) return;

      const handledByV3 = !reducedMotion.matches
        && Boolean(commerceMotionV3?.animateTotalChange({ node: addAction, from: previousLabel, to: label }));
      if (handledByV3) return;

      restartMotionClass(addAction, "motion-total-change", 320);
    }).observe(addAction, { childList: true, characterData: true, subtree: true });
  }
}

/*
 * Skeleton placeholders. Wired only where the application already starts a
 * surface empty (before its first real render): both grids are literally
 * childless in the static markup until `renderMenu()` runs. Skeleton cards
 * are inserted as ordinary children so the application's own later
 * `innerHTML` replace removes them for free; the shimmer itself is pure CSS
 * and stays authoritative-content-free.
 */
/*
 * Marks images as arrived so the shimmer underneath them can stop. Purely a
 * presentation signal: it says nothing about the image, only that the browser is
 * done with it, and "errored" counts as done because a shimmer over a broken
 * image is worse than none.
 */
function installImageLoadMarkers() {
  const mark = (image) => { image.dataset.loaded = "true"; };
  const track = (image) => {
    if (image.dataset.loaded === "true") return;
    if (image.complete) return mark(image);
    image.addEventListener("load", () => mark(image), { once: true });
    image.addEventListener("error", () => mark(image), { once: true });
  };

  for (const image of document.querySelectorAll(".food-card img, .modal-hero img")) track(image);

  // The grid and the modal are rendered after this runs, so watch for later ones.
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(".food-card img, .modal-hero img")) track(node);
        for (const image of node.querySelectorAll?.(".food-card img, .modal-hero img") ?? []) track(image);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

function installLoadingSkeletons() {
  installImageLoadMarkers();
  const skeletonCardCount = { "#featuredGrid": 3, "#menuList": 4 };
  for (const [selector, count] of Object.entries(skeletonCardCount)) {
    const node = document.querySelector(selector);
    if (!node || node.children.length > 0) continue;

    const observer = new MutationObserver(() => {
      if (node.querySelector(".motion-skeleton-card")) return;
      node.classList.remove("motion-skeleton-grid");
      node.removeAttribute("aria-busy");
      observer.disconnect();
    });
    observer.observe(node, { childList: true });

    node.classList.add("motion-skeleton-grid");
    node.setAttribute("aria-busy", "true");
    node.insertAdjacentHTML(
      "beforeend",
      Array.from({ length: count }, () => '<div class="motion-skeleton-card" aria-hidden="true"></div>').join(""),
    );
  }
}

function publishMotionEngineMode(engine) {
  document.documentElement.dataset.mcelloMotionEngine = engine?.mode || "fallback";
  window.dispatchEvent(new CustomEvent("mcello:motion-engine", {
    detail: {
      mode: engine?.mode || "fallback",
      version: engine?.version || null,
    },
  }));
}

async function primeMotionV3Adapter(revealController, heroController) {
  try {
    const { loadMcelloMotionEngine } = await import("./motion/engine.js");
    const engine = await loadMcelloMotionEngine();
    publishMotionEngineMode(engine);
    if (!engine.available) return;

    try {
      const homepageMotion = await import("./motion/homepage.js");
      try {
        if (revealController?.observer) homepageMotion.upgradePendingRevealsToGsap(engine, revealController);
      } catch {
        // V2 observer remains authoritative if the V3 reveal slice cannot initialize.
      }
      try {
        if (heroController) homepageMotion.upgradeHeroDepthToGsap(engine, heroController);
      } catch {
        // V2 hero scroll handler remains authoritative if the V3 hero slice cannot initialize.
      }
    } catch {
      // Homepage V2 fallbacks remain active if the optional V3 homepage module cannot load.
    }

    try {
      const { createCommerceMotion } = await import("./motion/commerce.js");
      commerceMotionV3 = createCommerceMotion(engine);
      syncCommerceEngineLabels();
    } catch {
      commerceMotionV3 = null;
      syncCommerceEngineLabels();
    }
  } catch {
    publishMotionEngineMode(null);
  }
}

function scheduleMotionV3Adapter(revealController, heroController) {
  const prime = () => void primeMotionV3Adapter(revealController, heroController);
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(prime, { timeout: 1500 });
    return;
  }
  window.setTimeout(prime, 0);
}

const revealController = installRevealMotion();
const heroController = installHeroFoodDepth();
installBuilderStateMotion();
installCommerceMotionContracts();
installLoadingSkeletons();
scheduleMotionV3Adapter(revealController, heroController);