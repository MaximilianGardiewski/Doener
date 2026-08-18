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
}

function installCommerceMotionContracts() {
  syncCommerceEngineLabels();
  reducedMotion.addEventListener?.("change", syncCommerceEngineLabels);

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
    if (addToCart && !addToCart.matches(":disabled")) {
      const sticky = document.querySelector(".sticky-order");
      if (sticky) sticky.dataset.motionCart = "added";
      restartMotionClass(sticky, "motion-cart-confirm", 440);
      window.setTimeout(() => {
        if (sticky) delete sticky.dataset.motionCart;
      }, 460);
    }
  });

  document.addEventListener("change", (event) => {
    const input = event.target instanceof HTMLInputElement
      ? event.target.closest("#modifierGroups input")
      : null;
    if (!input) return;

    const option = input.closest(".modifier-option");
    const selection = input.checked ? "added" : "removed";
    const foodStage = document.querySelector("#productModal .modal-hero");
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
installCommerceMotionContracts();
scheduleMotionV3Adapter(revealController, heroController);