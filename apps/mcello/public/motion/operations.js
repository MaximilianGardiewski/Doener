/*
 * Mcello KDS lane motion — a Mcello-owned adapter, separate from
 * motion/commerce.js (D074: GSAP Core + ScrollTrigger + Flip only, one
 * adapter boundary per surface).
 *
 * DESIGN_ACCEPTANCE.md section I is binding here: "KDS-Motion ist minimal
 * und nie show-orientiert. Alarm, Accept/Reject, ETA, Delay, Ready und
 * Completed bleiben operativ dominant." The only thing this module explains
 * is where an order card went when its lane changed — nothing decorative,
 * no colour wash, no glow, no pulse, no staggered cascade, and never on the
 * incoming alarm card itself beyond the same plain repositioning every card
 * gets.
 *
 * kds.js remains the sole owner of order state/lane assignment. It renders
 * each lane exactly as it already does (D010/D011/D012 are untouched); this
 * module is only ever told "capture what's on screen now" before a
 * re-render and "here is what's on screen now" after one, and it matches
 * cards across that re-render purely through a `data-flip-id` kds.js
 * already stamps on the rendered card — never through order/product/
 * customer content.
 */
import { loadMcelloMotionEngine } from "./engine.js";
import { prefersReducedMotion } from "./accessibility.js";

// Inside the 150-300ms budget the task sets for this slice; matches the
// existing --motion-ui token used for comparable UI-weight transitions
// elsewhere in the Mcello motion system (see motion.css).
const LANE_TRANSITION_SECONDS = 0.22;
const CARD_SELECTOR = ".order[data-flip-id]";

let enginePromise = null;

function engine() {
  enginePromise ??= loadMcelloMotionEngine();
  return enginePromise;
}

/*
 * Returns a small controller with two hooks meant to bracket kds.js's own
 * render() call. Every path below — reduced motion, GSAP still loading,
 * GSAP unavailable, first render with nothing to compare against — resolves
 * to doing nothing, which is already correct: kds.js has already placed the
 * card in the right lane by the time either hook runs.
 */
export function installKdsLaneMotion({ root } = {}) {
  const scopeRoot = root || document;
  let flip = null;
  let pendingState = null;

  void engine().then((readyEngine) => {
    if (!readyEngine.available) return;
    const scope = readyEngine.createScope(scopeRoot);
    scope.context(({ Flip }) => {
      flip = Flip;
    });
  });

  function captureBeforeRender() {
    pendingState = null;
    if (!flip || prefersReducedMotion()) return;
    const cards = scopeRoot.querySelectorAll(CARD_SELECTOR);
    if (!cards.length) return;
    pendingState = flip.getState(cards);
  }

  function playAfterRender() {
    const fromState = pendingState;
    pendingState = null;
    if (!fromState || !flip || prefersReducedMotion()) return;
    const cards = scopeRoot.querySelectorAll(CARD_SELECTOR);
    if (!cards.length) return;
    flip.from(fromState, {
      targets: cards,
      duration: LANE_TRANSITION_SECONDS,
      ease: "power2.out",
      absolute: true,
    });
  }

  return { captureBeforeRender, playAfterRender };
}
