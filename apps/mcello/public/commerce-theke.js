/*
 * Loads the Mcello commerce "Theke" art direction after the store and builder
 * shells, so it can correct their component language without either file
 * having to know about it. Presentation only — no state, no data, no logic.
 */
const stylesheet = document.createElement("link");
stylesheet.rel = "stylesheet";
stylesheet.href = "/commerce-theke.css";
stylesheet.dataset.mcelloCommerceTheke = "true";
document.head.appendChild(stylesheet);

document.querySelector(".sticky-order")?.setAttribute("data-theke-counter", "true");
document.documentElement.dataset.mcelloCommerceArtDirection = "theke";
