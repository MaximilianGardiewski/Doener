export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const NORMAL_MOTION_QUERY = "(prefers-reduced-motion: no-preference)";

export function prefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function createMotionPreferenceObserver(onChange) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  const notify = () => onChange?.({ reduced: query.matches });

  if (typeof query.addEventListener === "function") query.addEventListener("change", notify);
  else query.addListener?.(notify);

  return {
    get reduced() {
      return query.matches;
    },
    cleanup() {
      if (typeof query.removeEventListener === "function") query.removeEventListener("change", notify);
      else query.removeListener?.(notify);
    },
  };
}
