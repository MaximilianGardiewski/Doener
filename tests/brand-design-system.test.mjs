import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("apps/mcello/public/styles.css", root), "utf8");
const manifest = JSON.parse(await readFile(new URL("apps/mcello/public/manifest.webmanifest", root), "utf8"));

function token(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, "i"));
  assert.ok(match, `missing hex token --${name}`);
  return match[1].toLowerCase();
}

function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

test("D001 exposes semantic anthracite warm-premium tokens", () => {
  for (const name of [
    "ink-1000", "ink-950", "ink-900", "ink-850", "ink-800",
    "cream-50", "cream-100", "cream-300",
    "amber-300", "amber-400", "amber-500", "amber-650",
    "heritage-green",
  ]) token(name);

  assert.match(css, /--bg:\s*var\(--ink-950\)/);
  assert.match(css, /--text:\s*var\(--cream-50\)/);
  assert.match(css, /--gold:\s*var\(--amber-500\)/);
  assert.match(css, /--gold-2:\s*var\(--amber-300\)/);
  assert.match(css, /--green:\s*var\(--heritage-green\)/);
  assert.match(css, /--radius-sm:/);
  assert.match(css, /--radius-xl:/);
  assert.match(css, /--shadow-sm:/);
  assert.match(css, /--shadow-lg:/);
  assert.match(css, /--space-16:/);
  assert.match(css, /--font-display:/);
});

test("primary text muted text amber and heritage green remain readable on the base", () => {
  const background = token("ink-950");
  assert.ok(contrast(token("cream-50"), background) >= 7, "primary text should exceed AAA-like contrast on base");
  assert.ok(contrast(token("cream-300"), background) >= 4.5, "muted text should remain WCAG AA-readable");
  assert.ok(contrast(token("amber-300"), background) >= 4.5, "warm accent should remain readable");
  assert.ok(contrast(token("heritage-green"), background) >= 4.5, "selective green label should remain readable");
});

test("heritage green stays selective while amber is the primary accent", () => {
  const greenUses = css.match(/var\(--green\)/g) || [];
  const goldUses = css.match(/var\(--gold(?:-2)?\)/g) || [];
  assert.ok(greenUses.length >= 1 && greenUses.length <= 3, `green should stay selective, got ${greenUses.length} uses`);
  assert.ok(goldUses.length >= 8, `amber/gold should be the dominant accent, got ${goldUses.length} uses`);
});

test("design system remains self-host friendly and PWA chrome matches the base", () => {
  assert.doesNotMatch(css, /@import|https?:\/\//i, "brand CSS must not require third-party font/style hosting");
  assert.equal(manifest.background_color.toLowerCase(), token("ink-950"));
  assert.equal(manifest.theme_color.toLowerCase(), token("ink-950"));
});

test("D001 does not pretend to complete D029 logo recognition", () => {
  assert.match(css, /D029 logo\/recognition is intentionally separate/);
});
