import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("apps/mcello/public/brand-system.css", root), "utf8");
const artDirection = await readFile(new URL("docs/projects/mcello/ART_DIRECTION.md", root), "utf8");
const brandSystem = await readFile(new URL("docs/projects/mcello/BRAND_SYSTEM.md", root), "utf8");
const userReferences = await readFile(new URL("docs/projects/mcello/USER_REFERENCE_SYNTHESIS.md", root), "utf8");

function expectToken(name, source) {
  assert.match(css, new RegExp(`--${name}:\\s*var\\(--${source}\\)\\s*;`), `missing ${name} -> ${source} alias`);
}

test("V2 keeps the contrast-tested D001 raw palette as its provisional source", () => {
  for (const [name, source] of [
    ["mcello-ink", "ink-1000"],
    ["mcello-charcoal", "ink-950"],
    ["mcello-coal", "ink-800"],
    ["mcello-copper", "amber-650"],
    ["mcello-gold", "amber-300"],
    ["mcello-olive", "heritage-green"],
    ["mcello-cream", "cream-50"],
    ["mcello-bread", "cream-100"],
    ["mcello-stone", "cream-300"],
  ]) expectToken(name, source);

  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, "V2 semantic layer must not invent a second raw hex palette before Gate B");
});

test("V2 exposes distinct surface contracts for public commerce and operations", () => {
  for (const token of [
    "surface-cinematic",
    "surface-base",
    "surface-raised",
    "surface-warm",
    "surface-food-stage",
    "surface-operational",
  ]) assert.match(css, new RegExp(`--${token}:`));

  assert.match(css, /\[data-experience-mode="public"\]/);
  assert.match(css, /\[data-experience-mode="commerce"\]/);
  assert.match(css, /\[data-experience-mode="operations"\]/);
});

test("V2 pins Builder-ready image ratios touch targets and motion roles", () => {
  for (const token of [
    "ratio-hero",
    "ratio-signature",
    "ratio-product",
    "ratio-ingredient",
    "motion-fast",
    "motion-ui",
    "motion-food",
    "motion-cinematic",
    "touch-target-primary",
    "touch-target-compact",
  ]) assert.match(css, new RegExp(`--${token}:`));

  assert.match(css, /--touch-target-primary:\s*48px/);
  assert.match(css, /--touch-target-compact:\s*44px/);
});

test("reduced motion collapses all semantic motion durations without changing state contracts", () => {
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (const token of ["motion-fast", "motion-ui", "motion-food", "motion-cinematic"]) {
    assert.match(reduced, new RegExp(`--${token}:\\s*0ms`));
  }
});

test("owner references keep cinematic food dominant while materially increasing editorial energy", () => {
  assert.match(artDirection, /45 % Cinematic Food \/ Urban Bistro/);
  assert.match(artDirection, /30 % Warm Future Hospitality \/ Commerce Precision/);
  assert.match(artDirection, /25 % Editorial Street-Food Energy/);
  assert.match(artDirection, /A bestimmt Food-Wärme, Atmosphäre und Fotografie/);
  assert.match(artDirection, /C bestimmt Ordering-Struktur, Builder und Mobile Commerce/);
  assert.match(artDirection, /B liefert deutlich mehr Eigenständigkeit, Typografie, Farbe und grafische Spannung/);
  assert.match(userReferences, /weniger ruhiges "Dark Luxury"/);
  assert.match(userReferences, /Food ist Hero, nicht Dekoration/);
});

test("art direction and brand system keep concept imagery separate from real Mcello media", () => {
  assert.match(artDirection, /CONCEPT ART ONLY/);
  assert.match(artDirection, /keine Fotos realer Mcello-Gerichte/);
  assert.match(brandSystem, /never be public documentary Mcello reality/);
});

test("final palette type and logo remain visual or owner gates rather than agent-completed facts", () => {
  assert.match(brandSystem, /\[ \] final raw color calibration visually accepted/);
  assert.match(brandSystem, /\[ \] final display\/interface typeface pairing accepted/);
  assert.match(brandSystem, /\[ \] final Mcello logo\/original variants provided and accepted/);
  assert.match(brandSystem, /\[ \] Owner Visual Gate B accepted/);
});
