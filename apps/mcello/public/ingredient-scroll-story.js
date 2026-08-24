import { loadMcelloMotionEngine } from "./motion/engine.js";

const STORY_FRAME_COUNT = 144;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/ingredient-scroll-story.css";
stylesheet.dataset.mcelloIngredientStoryStyles = "true";
if (!document.querySelector('link[data-mcello-ingredient-story-styles="true"]')) document.head.appendChild(stylesheet);

const layerSpecs = [
  { name: "base", start: 0, end: .14, fromX: 0, fromY: 110, rotate: 0, scale: .9 },
  { name: "protein", start: .08, end: .31, fromX: -28, fromY: -210, rotate: -7, scale: .82 },
  { name: "lettuce", start: .20, end: .43, fromX: 34, fromY: -245, rotate: 6, scale: .84 },
  { name: "tomato", start: .33, end: .56, fromX: -52, fromY: -280, rotate: -8, scale: .82 },
  { name: "cucumber", start: .43, end: .66, fromX: 56, fromY: -315, rotate: 8, scale: .82 },
  { name: "onion", start: .53, end: .75, fromX: -42, fromY: -350, rotate: -9, scale: .84 },
  { name: "sauce", start: .63, end: .86, fromX: 34, fromY: -385, rotate: 5, scale: .86 },
  { name: "top", start: .75, end: 1, fromX: 0, fromY: -435, rotate: -4, scale: .9 },
];

function storyMarkup() {
  return `
    <div class="mc-ingredient-story__sticky">
      <div class="mc-ingredient-story__copy">
        <div class="mc-ingredient-story__eyebrow">FoodStage · Konzeptsequenz</div>
        <h2>Schicht für Schicht statt Formularwand.</h2>
        <p class="mc-ingredient-story__lead">Der Konfigurator soll Zutaten als sichtbaren Aufbau erklären: vom Brot über Protein und Frische bis zur Soße. Die Animation bleibt reine Präsentation — Preis, Verfügbarkeit und gültige Auswahl kommen weiterhin aus der echten Bestelllogik.</p>
        <div class="mc-ingredient-story__truth">
          <strong>Illustration · keine Produktfotografie</strong>
          <span>Die Bildsprache ist bewusst stilisiert. Echte Mcello-Food- und Lokalmedien ersetzen Konzeptmaterial erst nach bestätigter Provenienz und Freigabe.</span>
        </div>
        <div class="mc-ingredient-story__meter">
          <div class="mc-ingredient-story__meter-meta">
            <span data-story-frame>Frame 001 / ${STORY_FRAME_COUNT}</span>
            <span class="mc-ingredient-story__phase" data-story-phase>Bühne</span>
          </div>
          <div class="mc-ingredient-story__track" data-story-progress role="progressbar" aria-label="Fortschritt der illustrativen Döner-Aufbauanimation" aria-valuemin="1" aria-valuemax="${STORY_FRAME_COUNT}" aria-valuenow="1"></div>
        </div>
      </div>

      <div class="mc-ingredient-story__stage-wrap">
        <div class="mc-ingredient-story__stage" data-story-stage>
          <svg class="mc-scroll-art" data-story-art viewBox="0 0 800 600" aria-hidden="true" focusable="false">
            <ellipse class="mc-scroll-art__shadow" cx="400" cy="520" rx="240" ry="25" />

            <g data-story-layer="base">
              <path class="mc-scroll-art__bread" d="M164 446C196 414 264 402 400 402s204 12 236 44c13 13 6 37-12 47-44 24-120 36-224 36s-180-12-224-36c-18-10-25-34-12-47Z" />
              <path class="mc-scroll-art__toast" d="M232 455c63-22 139-25 214-17m-181 48c83 18 181 17 267-4m-78-28c34 2 67 8 98 18" />
            </g>

            <g data-story-layer="protein">
              <path class="mc-scroll-art__protein" d="M218 414c31-39 70-48 108-22l-15 48-83 6Z" />
              <path class="mc-scroll-art__protein" d="M300 394c31-35 73-39 108-10l-22 47-87 5Z" />
              <path class="mc-scroll-art__protein" d="M390 391c34-28 73-27 105 4l-25 44-83-7Z" />
              <path class="mc-scroll-art__protein" d="M479 402c31-26 66-22 96 10l-25 39-79-9Z" />
              <path class="mc-scroll-art__protein-mark" d="M241 418l48-10m39 8 47-12m44 12 46-8m39 18 43-5" />
            </g>

            <g data-story-layer="lettuce">
              <path class="mc-scroll-art__lettuce" d="M190 390c25-42 57-47 89-14 20-46 56-52 88-16 24-43 58-44 90-6 27-38 58-35 84 5 30-26 54-14 70 25l-16 34H204Z" />
            </g>

            <g data-story-layer="tomato">
              <ellipse class="mc-scroll-art__tomato" cx="248" cy="383" rx="57" ry="24" transform="rotate(-8 248 383)" />
              <ellipse class="mc-scroll-art__tomato" cx="402" cy="374" rx="60" ry="25" transform="rotate(6 402 374)" />
              <ellipse class="mc-scroll-art__tomato" cx="548" cy="387" rx="55" ry="23" transform="rotate(-7 548 387)" />
            </g>

            <g data-story-layer="cucumber">
              <g transform="rotate(9 275 370)"><ellipse class="mc-scroll-art__cucumber" cx="275" cy="370" rx="42" ry="21" /><ellipse class="mc-scroll-art__cucumber-core" cx="275" cy="370" rx="24" ry="9" /></g>
              <g transform="rotate(-6 385 362)"><ellipse class="mc-scroll-art__cucumber" cx="385" cy="362" rx="44" ry="21" /><ellipse class="mc-scroll-art__cucumber-core" cx="385" cy="362" rx="25" ry="9" /></g>
              <g transform="rotate(8 500 369)"><ellipse class="mc-scroll-art__cucumber" cx="500" cy="369" rx="42" ry="21" /><ellipse class="mc-scroll-art__cucumber-core" cx="500" cy="369" rx="24" ry="9" /></g>
            </g>

            <g data-story-layer="onion">
              <path class="mc-scroll-art__onion" d="M246 354c19-25 50-29 70-9 18 19 8 44-17 49-23 5-43-10-39-29 3-14 15-23 31-24" />
              <path class="mc-scroll-art__onion" d="M374 341c21-23 52-23 69-1 15 20 3 42-22 45-24 3-42-13-36-31 4-13 16-20 31-19" />
              <path class="mc-scroll-art__onion" d="M502 350c19-21 47-21 63-1 14 18 4 38-19 42-22 4-39-10-35-27 3-12 14-20 28-19" />
            </g>

            <g data-story-layer="sauce">
              <path class="mc-scroll-art__sauce" d="M201 356c69-34 132-32 189 5 55 35 119 34 190-4" />
              <path class="mc-scroll-art__sauce-accent" d="M230 381c54-25 106-22 155 8 45 28 95 27 151-4" />
            </g>

            <g data-story-layer="top">
              <path class="mc-scroll-art__bread" d="M178 325c29-75 107-116 222-116s193 41 222 116c7 19-8 39-29 38-72-4-136-10-193-10s-121 6-193 10c-21 1-36-19-29-38Z" />
              <path class="mc-scroll-art__toast" d="M246 303c42-37 99-53 171-50m32 8c40 8 73 24 99 48M286 326c80-22 162-22 245-1" />
            </g>
          </svg>
          <div class="mc-ingredient-story__concept-label">Concept Art · lokal gerendert</div>
        </div>
      </div>
    </div>`;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

function phaseForFrame(frame) {
  if (frame >= STORY_FRAME_COUNT) return "Fertig";
  if (frame >= 118) return "Schließen";
  if (frame >= 91) return "Soße";
  if (frame >= 51) return "Frische";
  if (frame >= 21) return "Protein";
  return "Bühne";
}

function updateProgress(root, progress) {
  const safeProgress = clamp(progress);
  const frame = Math.min(STORY_FRAME_COUNT, Math.max(1, Math.round(safeProgress * (STORY_FRAME_COUNT - 1)) + 1));
  root.style.setProperty("--story-progress", safeProgress.toFixed(4));
  root.dataset.storyFrame = String(frame);
  root.querySelector("[data-story-frame]").textContent = `Frame ${String(frame).padStart(3, "0")} / ${STORY_FRAME_COUNT}`;
  root.querySelector("[data-story-phase]").textContent = phaseForFrame(frame);
  root.querySelector("[data-story-progress]")?.setAttribute("aria-valuenow", String(frame));
}

function resolvedLayerSpecs(root) {
  return layerSpecs.map((spec) => ({
    ...spec,
    node: root.querySelector(`[data-story-layer="${spec.name}"]`),
  })).filter(({ node }) => node);
}

function applyFallbackProgress(root, specs, progress) {
  const safeProgress = clamp(progress);
  for (const spec of specs) {
    const local = easeOutCubic(clamp((safeProgress - spec.start) / Math.max(spec.end - spec.start, .001)));
    const x = spec.fromX * (1 - local);
    const y = spec.fromY * (1 - local);
    const rotation = spec.rotate * (1 - local);
    const scale = spec.scale + ((1 - spec.scale) * local);
    spec.node.style.opacity = String(.08 + (.92 * local));
    spec.node.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rotation.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
  }
  updateProgress(root, safeProgress);
}

function installFallbackScroll(root, specs) {
  root.dataset.storyEngine = "fallback";
  let animationFrame = 0;
  let active = true;

  const render = () => {
    animationFrame = 0;
    if (!active) return;
    const rect = root.getBoundingClientRect();
    const scrollable = Math.max(root.offsetHeight - window.innerHeight, 1);
    applyFallbackProgress(root, specs, clamp((-rect.top) / scrollable));
  };

  const schedule = () => {
    if (!active || animationFrame) return;
    animationFrame = requestAnimationFrame(render);
  };

  render();
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });

  return () => {
    active = false;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
  };
}

async function installStoryMotion(root) {
  const specs = resolvedLayerSpecs(root);
  if (reducedMotion.matches) {
    root.dataset.storyEngine = "reduced";
    applyFallbackProgress(root, specs, 1);
    return () => {};
  }

  const engine = await loadMcelloMotionEngine();
  if (!engine.available) return installFallbackScroll(root, specs);

  root.dataset.storyEngine = "gsap";
  for (const spec of specs) {
    spec.node.style.removeProperty("opacity");
    spec.node.style.removeProperty("transform");
  }

  const scope = engine.createScope(root);
  scope.context(({ gsap, ScrollTrigger }) => {
    const art = root.querySelector("[data-story-art]");
    const timeline = gsap.timeline({
      defaults: { ease: "power2.out" },
      onUpdate() {
        updateProgress(root, this.progress());
      },
      scrollTrigger: {
        trigger: root,
        start: "top top",
        end: "bottom bottom",
        scrub: .55,
        invalidateOnRefresh: true,
      },
    });

    for (const spec of specs) {
      timeline.fromTo(spec.node, {
        x: spec.fromX,
        y: spec.fromY,
        rotation: spec.rotate,
        scale: spec.scale,
        opacity: .08,
      }, {
        x: 0,
        y: 0,
        rotation: 0,
        scale: 1,
        opacity: 1,
        duration: Math.max(spec.end - spec.start, .04),
      }, spec.start);
    }

    timeline.to(art, { scale: 1.018, duration: .06, ease: "power1.out" }, .92);
    timeline.to(art, { scale: 1, duration: .02, ease: "power1.inOut" }, .98);
    updateProgress(root, 0);
    ScrollTrigger.refresh();
  });

  return () => scope.cleanup();
}

function installPlacementGuard(root, store, main) {
  const ensurePlacement = () => {
    if (!root.isConnected || store.parentElement !== main) return;
    if (root.nextElementSibling !== store) main.insertBefore(root, store);
  };
  const observer = new MutationObserver(ensurePlacement);
  observer.observe(main, { childList: true });
  ensurePlacement();
  return () => observer.disconnect();
}

function installStory() {
  if (document.querySelector('section[data-mcello-ingredient-story="true"]')) return true;

  const main = document.querySelector("main");
  const store = document.querySelector("#bestellen");
  if (!main || !store) return false;

  const root = document.createElement("section");
  root.className = "mc-ingredient-story";
  root.dataset.mcelloIngredientStory = "true";
  root.dataset.experienceMode = "public";
  root.setAttribute("aria-label", "Illustrative Zutaten-Aufbauanimation");
  root.innerHTML = storyMarkup();
  main.insertBefore(root, store);

  const cleanupPlacement = installPlacementGuard(root, store, main);
  let cleanupMotion = () => {};
  void installStoryMotion(root).then((cleanup) => { cleanupMotion = cleanup; });

  window.addEventListener("pagehide", () => {
    cleanupMotion();
    cleanupPlacement();
  }, { once: true });

  return true;
}

function bootStory() {
  if (installStory()) return;

  const observer = new MutationObserver(() => {
    if (installStory()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootStory, { once: true });
} else {
  bootStory();
}
