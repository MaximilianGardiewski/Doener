function pendingRevealNodes(controller) {
  return (controller?.nodes || []).filter((node) => !node.classList.contains("is-revealed"));
}

function restoreV2Reveal(controller, nodes) {
  document.documentElement.dataset.mcelloRevealEngine = "v2";
  for (const node of nodes) {
    delete node.dataset.motionRevealEngine;
    controller?.observer?.observe(node);
  }
}

export function upgradePendingRevealsToGsap(engine, controller) {
  if (!engine?.available || !controller?.observer || controller.reduced) {
    return { active: false, cleanup() {} };
  }

  const initialPending = pendingRevealNodes(controller);
  if (!initialPending.length) return { active: false, cleanup() {} };

  const scope = engine.createScope(document);
  controller.observer.disconnect();

  try {
    scope.matchMedia(engine.media.normal, ({ gsap, ScrollTrigger }) => {
      const candidates = initialPending.filter((node) => !node.classList.contains("is-revealed"));
      for (const [index, node] of candidates.entries()) {
        const heroMedia = node.dataset.reveal === "hero-media";
        node.dataset.motionRevealEngine = "gsap";
        gsap.set(node, {
          opacity: 0,
          y: heroMedia ? 12 : 18,
          ...(heroMedia ? { scale: 0.985 } : {}),
        });

        ScrollTrigger.create({
          trigger: node,
          start: "top 88%",
          once: true,
          onEnter() {
            gsap.to(node, {
              opacity: 1,
              y: 0,
              ...(heroMedia ? { scale: 1 } : {}),
              duration: 0.62,
              delay: Math.min(index % 3, 2) * 0.07,
              ease: "power3.out",
              overwrite: true,
              onComplete() {
                node.classList.add("is-revealed");
                gsap.set(node, { clearProps: "opacity,transform" });
              },
            });
          },
        });
      }
      ScrollTrigger.refresh();
    });

    document.documentElement.dataset.mcelloRevealEngine = "gsap";
    return {
      active: true,
      cleanup() {
        scope.cleanup();
      },
    };
  } catch {
    scope.cleanup();
    restoreV2Reveal(controller, initialPending);
    return { active: false, cleanup() {} };
  }
}
