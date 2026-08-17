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
  const lines = splitLabel(normalizeLabel(label));
  const fontSize = fontSizeFor(lines, width);
  const lineHeight = Math.round(fontSize * 1.15);
  const startY = Math.round(height / 2 - ((lines.length - 1) * lineHeight) / 2);
  const text = lines.map((line, index) => (
    `<text x="50%" y="${startY + index * lineHeight}" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700">${escapeXml(line)}</text>`
  )).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Platzhalter: ${escapeXml(normalizeLabel(label))}"><rect width="100%" height="100%" fill="#777777"/>${text}</svg>`;
}

export function placeholderSrc(label, format = "product") {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(placeholderSvg(label, format))}`;
}

export function hydratePlaceholders(root = document) {
  root.querySelectorAll?.("img[data-placeholder-label]").forEach((image) => {
    image.src = placeholderSrc(
      image.dataset.placeholderLabel || "Bild",
      image.dataset.placeholderFormat || "product",
    );
    image.dataset.placeholderHydrated = "true";
  });
}
