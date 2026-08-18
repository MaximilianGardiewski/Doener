import { installPlaceholderMedia, placeholderSrc } from "./placeholder-media.js";
import "./public-copy.js";
import "./motion.js";
import "./homepage-composition.js";

const knownSections = new Map([
  ["hero", "start"],
  ["quick_order", "bestellen"],
  ["story_team", "ueber"],
  ["news_events", "aktuelles"],
  ["gallery", "galerie"],
  ["contact", "kontakt"],
]);

let productMedia = new Map();
let productMediaObserver = null;

installPlaceholderMedia();

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function kindLabel(kind) {
  return ({ news: "News", event: "Event", special: "Special", press: "Presse" })[kind] || kind;
}

function dateLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function applyHomepage(snapshot) {
  if (!snapshot?.homepageConfigured) return;
  const main = document.querySelector("main");
  if (!main) return;

  for (const [, id] of knownSections) {
    const section = document.getElementById(id);
    if (section) section.hidden = true;
  }

  for (const config of snapshot.homepageSections || []) {
    const id = knownSections.get(config.sectionKey);
    const section = id ? document.getElementById(id) : null;
    if (!section) continue;
    section.hidden = false;
    main.appendChild(section);
  }
}

function renderEditorial(posts = []) {
  const target = document.querySelector("#newsStack");
  if (!target) return;
  if (!posts.length) {
    target.innerHTML = '<div class="notice">Gerade nichts Neues veröffentlicht — sobald bei Mcello etwas ansteht, findest du es hier.</div>';
    return;
  }

  target.innerHTML = posts.map((post) => {
    const eventTime = post.kind === "event" && post.eventStartsAt
      ? esc(dateLabel(post.eventStartsAt))
      : "";
    const type = kindLabel(post.kind);
    return `<article class="news-card">
      <img src="${placeholderSrc(post.title || type, "event")}" alt="" loading="lazy" decoding="async" data-placeholder-generated="true" />
      <div>
        <div class="tag">${esc(type)}${post.pinned ? " · Highlight" : ""}</div>
        <small>${eventTime || (post.pinned ? "Highlight" : "Neu bei Mcello")}</small>
        <h3>${esc(post.title)}</h3>
        <p>${esc(post.teaser || post.content || "")}</p>
      </div>
    </article>`;
  }).join("");
}

function renderGallery(items = []) {
  const target = document.querySelector("#galleryGrid");
  if (!target) return;
  if (!items.length) {
    const placeholders = ["Food", "Lokal", "Team", "Events"];
    target.innerHTML = placeholders.map((label, index) => `
      <figure class="gallery-item ${index === 0 ? "featured" : ""}" data-placeholder-gallery>
        <img src="${placeholderSrc(label, "gallery")}" alt="" loading="lazy" decoding="async" data-placeholder-generated="true" />
        <figcaption>${esc(label)} · Platzhalter</figcaption>
      </figure>`).join("");
    return;
  }

  target.innerHTML = items.map((item) => {
    const caption = item.caption || item.title || "";
    return `<figure class="gallery-item ${item.featured ? "featured" : ""}">
      <img src="/api/media/${encodeURIComponent(item.mediaId)}" alt="${esc(item.altText)}" loading="lazy" decoding="async" />
      ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}
    </figure>`;
  }).join("");
}

function indexProductMedia(categories = []) {
  productMedia = new Map();
  for (const category of categories) {
    for (const product of category.products || []) {
      if (!product.imageMediaId) continue;
      productMedia.set(product.id, {
        src: `/api/media/${encodeURIComponent(product.imageMediaId)}`,
        alt: product.imageAltText || product.name || "Produktbild",
      });
    }
  }
}

function applyProductMedia() {
  const featured = document.querySelector("#featuredGrid");
  if (!featured) return;
  for (const card of featured.querySelectorAll(".food-card")) {
    const productButton = card.querySelector("[data-product]");
    const image = card.querySelector("img");
    const media = productButton ? productMedia.get(productButton.dataset.product) : null;
    if (!image || !media) continue;
    if (image.dataset.productMediaId === productButton.dataset.product) continue;
    image.src = media.src;
    image.alt = media.alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.dataset.productMediaId = productButton.dataset.product;
  }
}

function bindProductMedia(categories = []) {
  indexProductMedia(categories);
  applyProductMedia();

  const featured = document.querySelector("#featuredGrid");
  if (featured && !productMediaObserver) {
    productMediaObserver = new MutationObserver(() => applyProductMedia());
    productMediaObserver.observe(featured, { childList: true, subtree: true });
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-product],[data-recommended-product]");
    const productId = button?.dataset.product || button?.dataset.recommendedProduct;
    const media = productId ? productMedia.get(productId) : null;
    if (!media) return;
    setTimeout(() => {
      const modalImage = document.querySelector("#modalImage");
      if (!modalImage) return;
      modalImage.src = media.src;
      modalImage.alt = media.alt;
    }, 0);
  });
}

async function loadPublicContent() {
  try {
    const response = await fetch("/api/menu", { cache: "no-store" });
    if (!response.ok) throw new Error("content backend unavailable");
    const menuSnapshot = await response.json();
    const snapshot = menuSnapshot.content;
    if (!snapshot) throw new Error("content snapshot unavailable");
    applyHomepage(snapshot);
    renderEditorial(snapshot.editorialPosts || []);
    renderGallery(snapshot.galleryItems || []);
    bindProductMedia(menuSnapshot.categories || []);
  } catch {
    // Static preview stays truthful: only labeled placeholders are shown, never invented documentary media.
    renderGallery([]);
  }
}

loadPublicContent();
