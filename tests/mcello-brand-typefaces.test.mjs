import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

/*
 * The brand typefaces are vendored rather than linked, for the same reason the
 * GSAP runtime is (D074): a font CDN would make every page load depend on a
 * third party, hand it every visitor's IP, and break the offline app shell.
 */

const root = new URL("../", import.meta.url);
const read = async (relative) => (await readFile(new URL(relative, root), "utf8")).replace(/\r\n/g, "\n");

const fontsCss = await read("apps/mcello/public/vendor/fonts/fonts.css");
const styles = await read("apps/mcello/public/styles.css");
const sw = await read("apps/mcello/public/sw.js");
const indexHtml = await read("apps/mcello/public/index.html");
const manifest = JSON.parse(await read("apps/mcello/public/vendor/fonts/MANIFEST.json"));

test("both families are served from our own origin", async () => {
  assert.doesNotMatch(fontsCss, /https?:\/\//, "no remote URL may appear in the font sheet");
  assert.match(fontsCss, /src: url\("\.\/inter-latin-variable\.woff2"\)/);
  assert.match(fontsCss, /src: url\("\.\/fraunces-latin-variable\.woff2"\)/);

  for (const font of manifest.fonts) {
    const file = await stat(new URL(`apps/mcello/public/vendor/fonts/${font.file}`, root));
    assert.ok(file.size > 0, `${font.file} is empty`);
    assert.equal(file.size, font.bytes, `${font.file} does not match its manifest size`);
  }
});

test("no surface reaches a font CDN", async () => {
  for (const page of ["index.html", "status.html", "edit-order.html", "kds.html", "admin.html", "ops.html"]) {
    const html = await read(`apps/mcello/public/${page}`);
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|fonts\.bunny/, `${page} links a font CDN`);
  }
  assert.doesNotMatch(styles, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test("the pairing is actually wired to the tokens", () => {
  // Inter was named here for a long time without ever being loaded, which is
  // exactly the failure this asserts against.
  assert.match(styles, /--font-body: Inter,/);
  assert.match(styles, /--font-display: Fraunces,/);
  assert.match(fontsCss, /font-family: "Inter"/);
  assert.match(fontsCss, /font-family: "Fraunces"/);
  // A named family that is never declared would silently fall back again.
  for (const family of ["Inter", "Fraunces"]) {
    assert.ok(fontsCss.includes(`font-family: "${family}"`), `${family} is used but never declared`);
  }
});

test("the fonts survive offline and do not block first paint", () => {
  assert.match(sw, /"\/vendor\/fonts\/fonts\.css"/);
  assert.match(sw, /"\/vendor\/fonts\/inter-latin-variable\.woff2"/);
  assert.match(sw, /"\/vendor\/fonts\/fraunces-latin-variable\.woff2"/);
  // swap, not block: a slow font must never hold the first paint hostage.
  const faces = fontsCss.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  assert.equal(faces.length, 2);
  for (const face of faces) assert.match(face, /font-display: swap/);
  // The interface face carries the most text, so it is the one worth preloading.
  assert.match(indexHtml, /rel="preload" href="\/vendor\/fonts\/inter-latin-variable\.woff2"[^>]*crossorigin/);
});

test("only latin variable woff2 is shipped", () => {
  assert.equal(manifest.fonts.length, 2);
  for (const font of manifest.fonts) {
    assert.match(font.file, /-latin-variable\.woff2$/, "ship the latin subset as one variable file");
    assert.ok(font.bytes < 120_000, `${font.file} is ${font.bytes} bytes; keep the subset tight`);
  }
  const total = manifest.fonts.reduce((sum, font) => sum + font.bytes, 0);
  assert.ok(total < 200_000, `brand type budget exceeded: ${total} bytes`);
});
