import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../apps/mcello/public/motion.css", import.meta.url), "utf8");
const js = await readFile(new URL("../apps/mcello/public/motion.js", import.meta.url), "utf8");
const publicContent = await readFile(new URL("../apps/mcello/public/public-content.js", import.meta.url), "utf8");
const sw = await readFile(new URL("../apps/mcello/public/sw.js", import.meta.url), "utf8");

test("D058 motion layer stays restricted to composited visual properties", () => {
  assert.match(css, /opacity var\(--motion-reveal\)/);
  assert.match(css, /transform var\(--motion-reveal\)/);
  assert.match(css, /translate3d\(0,18px,0\)/);
  assert.match(css, /translateY\(-4px\)/);
  assert.doesNotMatch(css, /transition:[^;]*(width|height|top|left|margin|padding)/i);
  assert.doesNotMatch(css, /animation-iteration-count\s*:\s*infinite/i);
});

test("D058 obeys the user's reduced-motion preference", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition: none !important/);
  assert.match(css, /animation: none !important/);
  assert.match(css, /transform: none !important/);
  assert.match(js, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(js, /if \(reducedMotion\.matches \|\| !\("IntersectionObserver" in window\)\)/);
});

test("public motion is progressive enhancement and part of the offline shell", () => {
  assert.match(publicContent, /^import "\.\/motion\.js";/);
  assert.match(js, /IntersectionObserver/);
  assert.match(js, /classList\.add\("is-revealed"\)/);
  assert.match(sw, /"\/motion\.js"/);
  assert.match(sw, /"\/motion\.css"/);
  assert.match(sw, /mcello-public-shell-v6/);
});
