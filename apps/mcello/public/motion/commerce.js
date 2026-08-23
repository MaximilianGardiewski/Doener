/*
 * The configured total is displayed as German-locale currency text; this reads
 * the amount already rendered by the application so the count-up tween never
 * derives a euro value on its own.
 */
const displayedAmountFormatter = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const DISPLAYED_AMOUNT_PATTERN = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s?€/;

function readDisplayedAmount(label) {
  const match = typeof label === "string" ? label.match(DISPLAYED_AMOUNT_PATTERN) : null;
  if (!match) return null;
  const amount = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  return { amount, index: match.index, raw: match[0] };
}

export function createCommerceMotion(engine) {
  if (!engine?.available) return null;

  const scope = engine.createScope(document);
  let gsap = null;
  const activeTweens = new Set();
  let productTransition = null;
  let ingredientTransition = null;
  let cartTransition = null;
  let stepTransition = null;
  let totalTransition = null;
  let handoffTransition = null;
  scope.context((tools) => {
    gsap = tools.gsap;
  });
  if (!gsap) {
    scope.cleanup();
    return null;
  }

  function track(tween) {
    if (!tween) return null;
    activeTweens.add(tween);
    return tween;
  }

  function clearProductPresentation() {
    if (!productTransition) return;
    const { timeline, nodes } = productTransition;
    timeline.kill();
    activeTweens.delete(timeline);
    for (const node of nodes) {
      gsap.set(node, { clearProps: "opacity,transform" });
      delete node.dataset.motionProductEngine;
    }
    productTransition = null;
  }

  function clearIngredientPresentation() {
    if (!ingredientTransition) return;
    const { timeline, option, foodStage } = ingredientTransition;
    timeline.kill();
    activeTweens.delete(timeline);
    if (option) {
      gsap.set(option, { clearProps: "opacity,transform" });
      delete option.dataset.motionSelection;
      delete option.dataset.motionIngredientEngine;
    }
    if (foodStage) {
      gsap.set(foodStage, { clearProps: "opacity,transform" });
      delete foodStage.dataset.motionIngredient;
      delete foodStage.dataset.motionIngredientEngine;
    }
    ingredientTransition = null;
  }

  function clearCartPresentation() {
    if (!cartTransition) return;
    const { timeline, sticky } = cartTransition;
    timeline.kill();
    activeTweens.delete(timeline);
    gsap.set(sticky, { clearProps: "transform" });
    delete sticky.dataset.motionCart;
    delete sticky.dataset.motionCartEngine;
    cartTransition = null;
  }

  function clearStepPresentation() {
    if (!stepTransition) return;
    const { timeline, step } = stepTransition;
    timeline.kill();
    activeTweens.delete(timeline);
    gsap.set(step, { clearProps: "opacity,transform" });
    delete step.dataset.motionStepEngine;
    delete step.dataset.motionStepDirection;
    stepTransition = null;
  }

  /*
   * Every text write this engine performs also stamps `motionTotalRendered`
   * with the exact string just written, synchronously in the same task. The
   * observing controller compares its next detected DOM text against this
   * marker to tell its own animation frames apart from a genuinely new
   * application-authored value, without ever guessing at that value itself.
   */
  function setTotalLabel(node, text) {
    node.textContent = text;
    node.dataset.motionTotalRendered = text;
  }

  function clearTotalPresentation() {
    if (!totalTransition) return;
    const { timeline, node, label } = totalTransition;
    timeline.kill();
    activeTweens.delete(timeline);
    if (label != null) setTotalLabel(node, label);
    gsap.set(node, { clearProps: "opacity,transform" });
    delete node.dataset.motionTotalEngine;
    totalTransition = null;
  }

  function clearHandoffPresentation() {
    if (!handoffTransition) return;
    const { timeline, ghost } = handoffTransition;
    timeline.kill();
    activeTweens.delete(timeline);
    ghost.remove();
    handoffTransition = null;
  }

  function animateCategoryChange({ categoryId, stage, featuredGrid, menuList, activeChip }) {
    if (!categoryId || (!featuredGrid && !menuList)) return false;

    const surfaces = [featuredGrid, menuList].filter(Boolean);
    gsap.killTweensOf(surfaces);
    if (activeChip) gsap.killTweensOf(activeChip);

    let surfaceTween;
    surfaceTween = gsap.fromTo(
      surfaces,
      { opacity: 0.72, x: 8 },
      {
        opacity: 1,
        x: 0,
        duration: 0.32,
        stagger: 0.035,
        ease: "power3.out",
        overwrite: "auto",
        clearProps: "opacity,transform",
        onComplete() {
          activeTweens.delete(surfaceTween);
        },
      },
    );
    track(surfaceTween);

    if (activeChip) {
      let chipTween;
      chipTween = gsap.fromTo(
        activeChip,
        { scale: 1 },
        {
          scale: 0.96,
          duration: 0.12,
          repeat: 1,
          yoyo: true,
          ease: "power2.inOut",
          overwrite: "auto",
          clearProps: "transform",
          onComplete() {
            activeTweens.delete(chipTween);
          },
        },
      );
      track(chipTween);
    }

    if (stage) stage.dataset.motionCategoryEngine = "gsap";
    return true;
  }

  function animateProductOpen({ source, modal }) {
    if (!modal?.closest("#productModal.open")) return false;

    clearProductPresentation();
    const nodes = [source, modal].filter(Boolean);
    for (const node of nodes) node.dataset.motionProductEngine = "gsap";

    let timeline;
    const finish = () => {
      if (!productTransition || productTransition.timeline !== timeline) return;
      for (const node of nodes) {
        gsap.set(node, { clearProps: "opacity,transform" });
        delete node.dataset.motionProductEngine;
      }
      activeTweens.delete(timeline);
      productTransition = null;
    };

    timeline = gsap.timeline({
      defaults: { overwrite: "auto" },
      onComplete: finish,
    });
    productTransition = { timeline, nodes };
    track(timeline);

    if (source) {
      timeline
        .to(source, { scale: 0.985, duration: 0.11, ease: "power2.in" }, 0)
        .to(source, { scale: 1, duration: 0.11, ease: "power2.out" }, 0.11);
    }

    timeline.fromTo(
      modal,
      { opacity: 0.76, y: 10, scale: 0.988 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.38,
        ease: "power3.out",
      },
      0.035,
    );
    return true;
  }

  function animateIngredientChange({ option, foodStage, selection }) {
    if (!option && !foodStage) return false;
    if (selection !== "added" && selection !== "removed") return false;

    clearIngredientPresentation();
    if (option) {
      option.dataset.motionSelection = selection;
      option.dataset.motionIngredientEngine = "gsap";
    }
    if (foodStage) {
      foodStage.dataset.motionIngredient = selection;
      foodStage.dataset.motionIngredientEngine = "gsap";
    }

    const optionScale = selection === "added" ? 1.018 : 0.985;
    const foodScale = selection === "added" ? 1.012 : 0.992;
    let timeline;
    const finish = () => {
      if (!ingredientTransition || ingredientTransition.timeline !== timeline) return;
      if (option) {
        gsap.set(option, { clearProps: "opacity,transform" });
        delete option.dataset.motionSelection;
        delete option.dataset.motionIngredientEngine;
      }
      if (foodStage) {
        gsap.set(foodStage, { clearProps: "opacity,transform" });
        delete foodStage.dataset.motionIngredient;
        delete foodStage.dataset.motionIngredientEngine;
      }
      activeTweens.delete(timeline);
      ingredientTransition = null;
    };

    timeline = gsap.timeline({
      defaults: { overwrite: "auto" },
      onComplete: finish,
    });
    ingredientTransition = { timeline, option, foodStage };
    track(timeline);

    if (option) {
      timeline
        .to(option, { scale: optionScale, duration: 0.16, ease: "power2.out" }, 0)
        .to(option, { scale: 1, duration: 0.16, ease: "power2.inOut" }, 0.16);
    }

    if (foodStage) {
      timeline
        .fromTo(
          foodStage,
          { opacity: 0.88, scale: 1 },
          { opacity: 1, scale: foodScale, duration: 0.16, ease: "power2.out" },
          0,
        )
        .to(foodStage, { opacity: 1, scale: 1, duration: 0.2, ease: "power2.inOut" }, 0.16);
    }
    return true;
  }

  function animateCartConfirmation(sticky) {
    if (!sticky) return false;
    clearCartPresentation();
    sticky.dataset.motionCart = "added";
    sticky.dataset.motionCartEngine = "gsap";

    let timeline;
    const finish = () => {
      if (!cartTransition || cartTransition.timeline !== timeline) return;
      gsap.set(sticky, { clearProps: "transform" });
      delete sticky.dataset.motionCart;
      delete sticky.dataset.motionCartEngine;
      activeTweens.delete(timeline);
      cartTransition = null;
    };

    timeline = gsap.timeline({
      defaults: { overwrite: "auto" },
      onComplete: finish,
    });
    cartTransition = { timeline, sticky };
    track(timeline);
    timeline
      .to(sticky, { scale: 1.025, duration: 0.16, ease: "power2.out" })
      .to(sticky, { scale: 1, duration: 0.2, ease: "power2.inOut" });
    return true;
  }

  /*
   * Guided step advance. The step navigation only moves presentation; this
   * explains that movement so the guest can tell forward from backward.
   */
  function animateBuilderStep({ step, direction }) {
    if (!step || (direction !== 1 && direction !== -1)) return false;

    clearStepPresentation();
    step.dataset.motionStepEngine = "gsap";
    step.dataset.motionStepDirection = direction === 1 ? "forward" : "back";

    let timeline;
    const finish = () => {
      if (!stepTransition || stepTransition.timeline !== timeline) return;
      gsap.set(step, { clearProps: "opacity,transform" });
      delete step.dataset.motionStepEngine;
      delete step.dataset.motionStepDirection;
      activeTweens.delete(timeline);
      stepTransition = null;
    };

    timeline = gsap.timeline({ defaults: { overwrite: "auto" }, onComplete: finish });
    stepTransition = { timeline, step };
    track(timeline);

    timeline.fromTo(
      step,
      { opacity: 0.4, x: direction * 22 },
      { opacity: 1, x: 0, duration: 0.3, ease: "power3.out" },
      0,
    );
    return true;
  }

  /*
   * The configured total is owned by the application; this only draws the eye to
   * the value it already rendered when that value changed. The euro amount is
   * read from the previous and next rendered label (never derived from any
   * catalog figure), tweened as a plain number, and the exact application
   * string is restored on completion so the final text stays byte-identical to
   * what app.js wrote.
   */
  function animateTotalChange({ node, from, to }) {
    if (!node) return false;
    const label = typeof to === "string" ? to : node.textContent;
    const previousAmount = readDisplayedAmount(from);
    const nextAmount = readDisplayedAmount(label);

    clearTotalPresentation();
    node.dataset.motionTotalEngine = "gsap";

    let timeline;
    const finish = () => {
      if (!totalTransition || totalTransition.timeline !== timeline) return;
      setTotalLabel(node, label);
      gsap.set(node, { clearProps: "opacity,transform" });
      delete node.dataset.motionTotalEngine;
      activeTweens.delete(timeline);
      totalTransition = null;
    };

    timeline = gsap.timeline({ defaults: { overwrite: "auto" }, onComplete: finish });
    totalTransition = { timeline, node, label };
    track(timeline);

    timeline
      .to(node, { scale: 1.024, duration: 0.13, ease: "power2.out" }, 0)
      .to(node, { scale: 1, duration: 0.19, ease: "power2.inOut" }, 0.13);

    if (previousAmount && nextAmount && previousAmount.amount !== nextAmount.amount) {
      const prefix = label.slice(0, nextAmount.index);
      const suffix = label.slice(nextAmount.index + nextAmount.raw.length);
      const counter = { value: previousAmount.amount };
      setTotalLabel(node, `${prefix}${displayedAmountFormatter.format(counter.value)}${suffix}`);
      timeline.to(counter, {
        value: nextAmount.amount,
        duration: 0.26,
        ease: "power1.out",
        onUpdate() {
          setTotalLabel(node, `${prefix}${displayedAmountFormatter.format(counter.value)}${suffix}`);
        },
      }, 0);
    } else {
      setTotalLabel(node, label);
    }
    return true;
  }

  /*
   * A ghost of the already-rendered product visual travels from where the guest
   * tapped toward the order indicator, then removes itself. The ghost node,
   * distances and target scale are all supplied by the caller from rendered
   * layout; this only owns the transform/opacity tween and lifecycle.
   */
  function animateHandoffFlight({ ghost, deltaX = 0, deltaY = 0, scale = 0.3 }) {
    if (!ghost) return false;

    clearHandoffPresentation();

    let timeline;
    const finish = () => {
      if (!handoffTransition || handoffTransition.timeline !== timeline) return;
      activeTweens.delete(timeline);
      ghost.remove();
      handoffTransition = null;
    };

    timeline = gsap.timeline({ defaults: { overwrite: "auto" }, onComplete: finish });
    handoffTransition = { timeline, ghost };
    track(timeline);

    timeline
      .set(ghost, { x: 0, y: 0, scale: 1, opacity: 1 })
      .to(ghost, { x: deltaX * 0.6, y: deltaY * 0.35, scale: (1 + scale) / 2, duration: 0.22, ease: "power1.out" }, 0)
      .to(ghost, { x: deltaX, y: deltaY, scale, opacity: 0.2, duration: 0.26, ease: "power2.in" }, 0.22);
    return true;
  }

  return {
    animateCategoryChange,
    animateProductOpen,
    animateIngredientChange,
    animateCartConfirmation,
    animateBuilderStep,
    animateTotalChange,
    animateHandoffFlight,
    cleanup() {
      clearHandoffPresentation();
      clearCartPresentation();
      clearTotalPresentation();
      clearStepPresentation();
      clearIngredientPresentation();
      clearProductPresentation();
      for (const tween of activeTweens) tween.kill();
      activeTweens.clear();
      scope.cleanup();
    },
  };
}