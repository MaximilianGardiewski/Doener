const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const deviceSizes = {
  desktop: { width: "1440px", height: "900px" },
  tablet: { width: "1180px", height: "760px" },
  phone: { width: "844px", height: "430px" },
};

const frame = document.querySelector("#mcelloPreview");
const deviceFrame = document.querySelector("#deviceFrame");
const productSelect = document.querySelector("#productSelect");
const openConfigurator = document.querySelector("#openConfigurator");
const previewStatus = document.querySelector("#previewStatus");
const previewStage = document.querySelector("#previewStage");
const blockedMessage = document.querySelector("#blockedMessage");

function isPrivateIpv4(hostname) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

function isPrivateSslipHost(hostname) {
  return /(?:^|\.)(10-\d{1,3}-\d{1,3}-\d{1,3}|192-168-\d{1,3}-\d{1,3}|172-(?:1[6-9]|2\d|3[01])-\d{1,3}-\d{1,3})\.sslip\.io$/i.test(hostname);
}

function isPreviewOrigin() {
  const { hostname, protocol } = window.location;
  return protocol === "http:" && (loopbackHosts.has(hostname) || isPrivateIpv4(hostname) || isPrivateSslipHost(hostname));
}

function setStatus(state, copy) {
  previewStatus.dataset.state = state;
  previewStatus.querySelector(".status-copy").textContent = copy;
}

function productLabel(button) {
  const card = button.closest(".food-card,.list-row,.recommendation-card") || button.parentElement;
  return card?.querySelector("h3,strong")?.textContent?.trim() || "Produkt";
}

function scanProducts() {
  const doc = frame.contentDocument;
  if (!doc) return [];
  const unique = new Map();
  for (const button of doc.querySelectorAll("[data-product]")) {
    if (button.disabled || !button.dataset.product || unique.has(button.dataset.product)) continue;
    unique.set(button.dataset.product, { id: button.dataset.product, label: productLabel(button) });
  }
  return [...unique.values()];
}

function refreshProductSelect() {
  const products = scanProducts();
  productSelect.replaceChildren();
  for (const product of products) {
    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = product.label;
    productSelect.appendChild(option);
  }
  const ready = products.length > 0;
  productSelect.disabled = !ready;
  openConfigurator.disabled = !ready;
  return ready;
}

function previewModeCopy() {
  const doc = frame.contentDocument;
  const banner = doc?.querySelector("#prototypeBanner")?.textContent?.trim() || "";
  if (/E2E-Modus|lokale DB/i.test(banner)) return "Lokale DB + Presentation Fixtures aktiv";
  if (/statische|keine echte Bestellung/i.test(banner)) return "Statische Read-only Preview aktiv";
  return "Mcello Preview bereit";
}

function openSelectedProduct() {
  const doc = frame.contentDocument;
  const id = productSelect.value;
  if (!doc || !id) return;
  const target = [...doc.querySelectorAll("[data-product]")].find((button) => button.dataset.product === id && !button.disabled);
  if (!target) {
    setStatus("blocked", "Produkt ist in diesem Snapshot nicht verfügbar");
    refreshProductSelect();
    return;
  }
  target.click();
  const modal = doc.querySelector("#productModal");
  if (modal?.classList.contains("open")) {
    setStatus("ready", `${productLabel(target)} · echter Konfigurator geöffnet`);
  } else {
    setStatus("blocked", "App hat den Konfigurator nicht geöffnet");
  }
}

function reloadFrame({ reset = false } = {}) {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("presentation", "mcello");
  if (reset) url.searchParams.set("reset", "1");
  url.hash = "bestellen";
  productSelect.disabled = true;
  openConfigurator.disabled = true;
  productSelect.innerHTML = "<option>Produkte werden geladen …</option>";
  setStatus("loading", reset ? "Demo wird zurückgesetzt …" : "Preview lädt neu …");
  frame.src = url.toString();
}

function applyDevice(name) {
  const size = deviceSizes[name];
  if (!size) return;
  document.documentElement.style.setProperty("--device-w", size.width);
  document.documentElement.style.setProperty("--device-h", size.height);
  deviceFrame.dataset.device = name;
  document.querySelectorAll("[data-device]").forEach((button) => {
    button.classList.toggle("active", button.dataset.device === name);
  });
}

function blockNonLocalPreview() {
  previewStage.classList.add("hidden");
  blockedMessage.classList.remove("hidden");
  frame.removeAttribute("src");
  setStatus("blocked", "Nur lokale/private-LAN Vorschau erlaubt");
}

if (!isPreviewOrigin()) {
  blockNonLocalPreview();
} else {
  frame.addEventListener("load", () => {
    let attempts = 0;
    const settle = window.setInterval(() => {
      attempts += 1;
      if (refreshProductSelect()) {
        window.clearInterval(settle);
        setStatus("ready", previewModeCopy());
      } else if (attempts >= 40) {
        window.clearInterval(settle);
        setStatus("blocked", "Keine konfigurierbaren Produkte im aktuellen Snapshot gefunden");
      }
    }, 125);
  });

  document.querySelectorAll("[data-device]").forEach((button) => {
    button.addEventListener("click", () => applyDevice(button.dataset.device));
  });
  openConfigurator.addEventListener("click", openSelectedProduct);
  productSelect.addEventListener("change", openSelectedProduct);
  document.querySelector("#reloadPreview").addEventListener("click", () => reloadFrame());
  document.querySelector("#resetDemo").addEventListener("click", () => reloadFrame({ reset: true }));
  applyDevice("tablet");
}
