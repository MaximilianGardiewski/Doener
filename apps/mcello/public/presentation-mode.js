const PRESENTATION_PARAM = "presentation";
const PRESENTATION_VALUE = "mcello";
const RESET_PARAM = "reset";
const CART_KEY = "mcello-preview-cart-v2";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function presentationUrl({ reset = false } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set(PRESENTATION_PARAM, PRESENTATION_VALUE);
  if (reset) url.searchParams.set(RESET_PARAM, "1");
  else url.searchParams.delete(RESET_PARAM);
  return url;
}

function isLocalPresentation() {
  const params = new URLSearchParams(window.location.search);
  return loopbackHosts.has(window.location.hostname)
    && params.get(PRESENTATION_PARAM) === PRESENTATION_VALUE;
}

function resetLocalPresentationBrowserState() {
  if (!isLocalPresentation()) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get(RESET_PARAM) !== "1") return false;

  localStorage.removeItem(CART_KEY);
  sessionStorage.clear();
  history.replaceState(null, "", presentationUrl({ reset: false }));
  window.location.reload();
  return true;
}

function decorateLocalPresentation() {
  if (!isLocalPresentation()) return;
  document.body.dataset.presentationMode = PRESENTATION_VALUE;
  document.documentElement.dataset.presentationMode = PRESENTATION_VALUE;

  const banner = document.querySelector("#prototypeBanner");
  if (!banner) return;
  banner.dataset.presentationBanner = "true";
  banner.replaceChildren();

  const label = document.createElement("span");
  label.textContent = "MCELLO PRESENTATION · lokale Demo · Produktdaten teilweise vorläufig";

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "presentation-reset";
  reset.dataset.presentationReset = "true";
  reset.textContent = "Demo neu starten";
  reset.addEventListener("click", () => window.location.assign(presentationUrl({ reset: true })));

  banner.append(label, reset);
}

if (!resetLocalPresentationBrowserState()) decorateLocalPresentation();
