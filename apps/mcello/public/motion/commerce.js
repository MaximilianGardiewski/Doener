export function createCommerceMotion(engine) {
  if (!engine?.available) return null;

  const scope = engine.createScope(document);
  let gsap = null;
  const activeTweens = new Set();
  let productTransition = null;
  let ingredientTransition = null;
  let cartTransition = null;
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

  return {
    animateCategoryChange,
    animateProductOpen,
    animateIngredientChange,
    animateCartConfirmation,
    cleanup() {
      clearCartPresentation();
      clearIngredientPresentation();
      clearProductPresentation();
      for (const tween of activeTweens) tween.kill();
      activeTweens.clear();
      scope.cleanup();
    },
  };
}