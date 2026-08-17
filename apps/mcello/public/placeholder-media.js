const FORMATS = Object.freeze({
  hero: [1600, 900],
  event: [1600, 900],
  product: [1200, 900],
  story: [1200, 900],
  gallery: [1200, 900],
  square: [1000, 1000],
  portrait: [900, 1200],
});

function escapeXml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]);
}

function normalizeLabel(value) {
  const label = String(value || "Bild").trim().replace(/\s+/g, " ");
  return label || "Bild";
}

function splitLabel(label) {
  if (label.length <= 24) return [label];
  const words = label.split(" ");
  if (words.length === 1) return [label];

  const midpoint = label.length / 2;
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let consumed = 0;

  for (let index = 1; index < words.length; index += 1) {
    consumed += words[index - 1].length + (index > 1 ? 1 : 0);
    const distance = Math.abs(consumed - midpoint);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return [words.slice(0, bestIndex).join(" "), words.slice(bestIndex).join(" ")];
}

function fontSizeFor(lines, width) {
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const estimated = Math.floor(width / Math.max(longest * 0.72, 9));
  return Math.max(34, Math.min(112, estimated));
}

export function placeholderSvg(label, format = "product") {
  const [width, height] = FORMATS[format] || FORMATS.product;
  const normalized = normalizeLabel(label);
  const lines = splitLabel(normalized);
  const fontSize = fontSizeFor(lines, width);
  const lineHeight = Math.round(fontSize * 1.15);
  const startY = Math.round(height / 2 - ((lines.length - 1) * lineHeight) / 2);
  const text = lines.map((line, index) => (
    `<text x="50%" y="${startY + index * lineHeight}" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700">${escapeXml(line)}</text>`
  )).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Platzhalter: ${escapeXml(normalized)}"><rect width="100%" height="100%" fill="#777777"/>${text}</svg>`;
}

export function placeholderSrc(label, format = "product") {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(placeholderSvg(label, format))}`;
}

function currentSource(image) {
  return image.getAttribute("src") || "";
}

function isPlaceholderSource(image) {
  const source = currentSource(image);
  return source.endsWith("/media/placeholder.svg")
    || (image.dataset.placeholderGenerated === "true" && source.startsWith("data:image/svg+xml"));
}

function inferPlaceholder(image) {
  if (image.matches(".hero-photo")) return { label: "Hero", format: "hero" };
  if (image.matches("#homepageTeamStory img")) return { label: "Team", format: "portrait" };
  if (image.matches("#modalImage")) {
    return {
      label: document.querySelector("#modalTitle")?.textContent || "Gericht",
      format: "product",
    };
  }
  const foodCard = image.closest(".food-card");
  if (foodCard) {
    return { label: foodCard.querySelector("h3")?.textContent || "Gericht", format: "product" };
  }
  const storyCard = image.closest(".story-card");
  if (storyCard) {
    return { label: storyCard.querySelector("h3")?.textContent || "Story", format: "story" };
  }
  return null;
}

function applyPlaceholder(image, label, format) {
  if (!image || !isPlaceholderSource(image)) return;
  const normalizedLabel = normalizeLabel(label);
  const normalizedFormat = FORMATS[format] ? format : "product";
  const key = `${normalizedFormat}:${normalizedLabel}`;
  if (image.dataset.placeholderKey === key && image.dataset.placeholderGenerated === "true") return;

  image.src = placeholderSrc(normalizedLabel, normalizedFormat);
  image.alt = "";
  image.dataset.placeholderGenerated = "true";
  image.dataset.placeholderKey = key;
}

function hydrateInferredPlaceholders(root) {
  const images = [];
  if (root?.matches?.("img")) images.push(root);
  root?.querySelectorAll?.("img").forEach((image) => images.push(image));

  for (const image of images) {
    if (!isPlaceholderSource(image)) continue;
    const explicitLabel = image.dataset.placeholderLabel;
    const explicitFormat = image.dataset.placeholderFormat;
    const inferred = inferPlaceholder(image);
    if (explicitLabel || inferred) {
      applyPlaceholder(
        image,
        explicitLabel || inferred.label,
        explicitFormat || inferred.format,
      );
    }
  }
}

export function hydratePlaceholders(root = document) {
  hydrateInferredPlaceholders(root);
}

export function installPlaceholderMedia(root = document) {
  hydrateInferredPlaceholders(root);
  if (!root?.documentElement || typeof MutationObserver === "undefined") return null;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        hydrateInferredPlaceholders(mutation.target);
        continue;
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) hydrateInferredPlaceholders(node);
      });
    }
  });

  observer.observe(root.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  return observer;
}
