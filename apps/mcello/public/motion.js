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

installRevealMotion();
