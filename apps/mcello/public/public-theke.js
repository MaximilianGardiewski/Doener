import "./ingredient-scroll-story.js";
import "./builder-visual-state.js";

/*
 * Loads the Mcello public/homepage "Theke" art direction after homepage-v2.css,
 * mirroring how commerce-theke.js is wired in for the commerce surfaces.
 * Presentation only — no authoritative commerce state, data or business logic.
 */
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/public-theke.css";
stylesheet.dataset.mcelloPublicTheke = "true";
document.head.appendChild(stylesheet);

document.documentElement.dataset.mcelloPublicArtDirection = "theke";
