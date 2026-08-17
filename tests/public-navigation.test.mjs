import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../apps/mcello/public/index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../apps/mcello/public/styles.css", import.meta.url), "utf8");

const destinations = [
  ["#start", "Start"],
  ["#bestellen", "Speisekarte & Bestellen"],
  ["#ueber", "Über Mcello"],
  ["#aktuelles", "Aktuelles & Events"],
  ["#galerie", "Galerie"],
  ["#kontakt", "Kontakt & Anfahrt"],
];

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end + endMarker.length);
}

function assertNavigation(block, label) {
  for (const [href, text] of destinations) {
    assert.equal(block.includes(`href="${href}"`), true, `${label} missing ${href}`);
    assert.equal(block.includes(`>${text}</a>`), true, `${label} missing ${text}`);
  }
}

test("D030 desktop and mobile navigation expose the same six public destinations", () => {
  const desktop = between(html, '<nav class="nav-links"', "</nav>");
  const mobile = between(html, '<nav class="mobile-nav-panel"', "</nav>");
  assertNavigation(desktop, "desktop nav");
  assertNavigation(mobile, "mobile nav");
  assert.match(desktop, /aria-label="Hauptnavigation"/);
  assert.match(mobile, /aria-label="Mobile Hauptnavigation"/);
});

test("D030 keeps an emphasized order path available across desktop mobile and keyboard navigation", () => {
  assert.match(html, /class="primary header-order-cta" href="#bestellen" data-order-cta>Jetzt bestellen<\/a>/);
  assert.match(html, /class="primary mobile-order-cta" href="#bestellen" data-order-cta>Jetzt bestellen<\/a>/);
  assert.match(html, /class="skip-link" href="#bestellen">Direkt zur Speisekarte & Bestellung<\/a>/);
  assert.match(html, /class="primary" href="#bestellen" data-order-cta>Speisekarte entdecken<\/a>/);
  assert.match(html, /class="sticky-order"/);
});

test("mobile access replaces the hidden desktop nav below the public breakpoint", () => {
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.nav-links\s*\{\s*display:\s*none;\s*\}/);
  assert.match(html, /\.mobile-nav\{display:none;position:relative\}/);
  assert.match(html, /@media\(max-width:900px\)\{\.mobile-nav\{display:block\}/);
  assert.match(html, /width:min\(340px,calc\(100vw - 22px\)\)/);
  assert.match(html, /max-height:calc\(100vh - 120px\);overflow:auto/);
});

test("native mobile menu remains usable with keyboard and closes predictably", () => {
  assert.match(html, /<details class="mobile-nav" id="mobileNav">/);
  assert.match(html, /<summary class="pill" aria-label="Navigation öffnen">Menü<\/summary>/);
  assert.match(html, /mobileNav\?\.querySelectorAll\("a"\)/);
  assert.match(html, /mobileNav\.removeAttribute\("open"\)/);
  assert.match(html, /event\.key !== "Escape"/);
  assert.match(html, /mobileNav\.querySelector\("summary"\)\?\.focus\(\)/);
  assert.match(html, /:focus-visible\{outline:3px solid var\(--gold-2\)/);
});
