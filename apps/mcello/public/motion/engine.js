import {
  NORMAL_MOTION_QUERY,
  REDUCED_MOTION_QUERY,
  prefersReducedMotion,
} from "./accessibility.js";

const EXPECTED_GSAP_VERSION = "3.15.0";
const VENDOR = Object.freeze([
  { key: "core", path: "/vendor/gsap/gsap.min.js", resolve: () => window.gsap },
  { key: "scroll-trigger", path: "/vendor/gsap/ScrollTrigger.min.js", resolve: () => window.ScrollTrigger },
  { key: "flip", path: "/vendor/gsap/Flip.min.js", resolve: () => window.Flip },
]);

let readyEngine = null;
let loadingEngine = null;

function unavailableEngine(mode, reason) {
  return Object.freeze({
    available: false,
    mode,
    reason,
    version: null,
    plugins: Object.freeze([]),
    createScope() {
      return Object.freeze({
        available: false,
        context() { return null; },
        matchMedia() { return null; },
        cleanup() {},
      });
    },
  });
}

function sameOriginUrl(pathname) {
  const url = new URL(pathname, window.location.origin);
  if (url.origin !== window.location.origin) throw new Error("Mcello motion vendor must stay same-origin");
  return url.href;
}

function loadVendorScript(vendor) {
  if (vendor.resolve()) return Promise.resolve();

  const existing = document.querySelector(`script[data-mcello-gsap-vendor="${vendor.key}"]`);
  if (existing) {
    if (vendor.resolve()) return Promise.resolve();
    if (existing.dataset.mcelloGsapState === "failed") {
      return Promise.reject(new Error(`Mcello motion vendor failed previously: ${vendor.key}`));
    }
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => vendor.resolve()
        ? resolve()
        : reject(new Error(`Mcello motion vendor global missing: ${vendor.key}`)), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Mcello motion vendor failed: ${vendor.key}`)), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = sameOriginUrl(vendor.path);
    script.async = false;
    script.dataset.mcelloGsapVendor = vendor.key;
    script.dataset.mcelloGsapState = "loading";
    script.addEventListener("load", () => {
      if (!vendor.resolve()) {
        script.dataset.mcelloGsapState = "failed";
        reject(new Error(`Mcello motion vendor global missing: ${vendor.key}`));
        return;
      }
      script.dataset.mcelloGsapState = "ready";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => {
      script.dataset.mcelloGsapState = "failed";
      reject(new Error(`Mcello motion vendor failed: ${vendor.key}`));
    }, { once: true });
    document.head.appendChild(script);
  });
}

function makeReadyEngine(gsap, ScrollTrigger, Flip) {
  function createScope(root = document) {
    const contexts = new Set();
    const mediaContexts = new Set();
    let closed = false;

    return {
      available: true,
      context(callback) {
        if (closed) return null;
        const context = gsap.context(() => callback?.({ gsap, ScrollTrigger, Flip }), root);
        contexts.add(context);
        return context;
      },
      matchMedia(conditions, callback) {
        if (closed) return null;
        const media = gsap.matchMedia();
        media.add(conditions, (context) => callback?.({
          gsap,
          ScrollTrigger,
          Flip,
          context,
        }));
        mediaContexts.add(media);
        return media;
      },
      cleanup() {
        if (closed) return;
        closed = true;
        for (const media of mediaContexts) media.revert();
        for (const context of contexts) context.revert();
        mediaContexts.clear();
        contexts.clear();
      },
    };
  }

  return Object.freeze({
    available: true,
    mode: "ready",
    reason: null,
    version: gsap.version,
    plugins: Object.freeze(["ScrollTrigger", "Flip"]),
    media: Object.freeze({
      normal: NORMAL_MOTION_QUERY,
      reduced: REDUCED_MOTION_QUERY,
    }),
    createScope,
  });
}

async function buildReadyEngine() {
  for (const vendor of VENDOR) await loadVendorScript(vendor);

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const Flip = window.Flip;
  if (!gsap || !ScrollTrigger || !Flip) throw new Error("Mcello motion vendor globals incomplete");
  if (gsap.version !== EXPECTED_GSAP_VERSION) {
    throw new Error(`Mcello GSAP version mismatch: expected ${EXPECTED_GSAP_VERSION}, got ${gsap.version || "unknown"}`);
  }

  gsap.registerPlugin(ScrollTrigger, Flip);
  return makeReadyEngine(gsap, ScrollTrigger, Flip);
}

export async function loadMcelloMotionEngine({ disabled = false } = {}) {
  if (disabled) return unavailableEngine("disabled", "explicitly-disabled");
  if (prefersReducedMotion()) return unavailableEngine("reduced", "prefers-reduced-motion");
  if (readyEngine) return readyEngine;

  if (!loadingEngine) {
    loadingEngine = buildReadyEngine()
      .then((engine) => {
        readyEngine = engine;
        return engine;
      })
      .catch(() => unavailableEngine("fallback", "vendor-unavailable"));
  }
  return loadingEngine;
}

export const MCELLO_MOTION_ENGINE_VERSION = EXPECTED_GSAP_VERSION;
export const MCELLO_MOTION_VENDOR_PATHS = Object.freeze(VENDOR.map(({ path }) => path));
