export function createCommerceMotion(engine) {
  if (!engine?.available) return null;

  const scope = engine.createScope(document);
  let gsap = null;
  const activeTweens = new Set();
  let productTransition = null;
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

  return {
    animateCategoryChange,
    animateProductOpen,
    cleanup() {
      clearProductPresentation();
      for (const tween of activeTweens) tween.kill();
      activeTweens.clear();
      scope.cleanup();
    },
  };
}