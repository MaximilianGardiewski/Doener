const motionStylesheet = document.createElement("link");
motionStylesheet.rel = "stylesheet";
motionStylesheet.href = "/motion.css";
motionStylesheet.dataset.mcelloMotion = "true";
document.head.appendChild(motionStylesheet);

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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
    revealImmediately(nodes);
    return;
  }

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
  if (!hero || !foodVisual) return;

  let frame = 0;
  const update = () => {
    frame = 0;
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
    if (frame) return;
    frame = requestAnimationFrame(update);
  };

  update();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  reducedMotion.addEventListener?.("change", schedule);
}

function installCommerceMotionContracts() {
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const category = target.closest("[data-category]");
    if (category) {
      const stage = document.querySelector(".store-stage");
      if (stage) stage.dataset.motionCategory = category.dataset.category || "selected";
      restartMotionClass(document.querySelector("#featuredGrid"), "motion-category-switch", 320);
      restartMotionClass(document.querySelector("#menuList"), "motion-category-switch", 320);
      restartMotionClass(category, "motion-category-chip", 260);
    }

    const productTrigger = target.closest("[data-product], [data-recommended-product]");
    if (productTrigger && !productTrigger.matches(":disabled")) {
      const source = productTrigger.closest(".food-card, .list-row, .recommendation-card");
      restartMotionClass(source, "motion-product-activate", 320);
      requestAnimationFrame(() => {
        const modal = document.querySelector("#productModal.open .modal");
        restartMotionClass(modal, "motion-product-open", 380);
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
    if (option) option.dataset.motionSelection = selection;
    restartMotionClass(option, "motion-ingredient-change", 360);

    const foodStage = document.querySelector("#productModal .modal-hero");
    if (foodStage) foodStage.dataset.motionIngredient = selection;
    restartMotionClass(foodStage, "motion-food-stage-change", 380);
    window.setTimeout(() => {
      if (option) delete option.dataset.motionSelection;
      if (foodStage) delete foodStage.dataset.motionIngredient;
    }, 400);
  });
}

installRevealMotion();
installHeroFoodDepth();
installCommerceMotionContracts();
