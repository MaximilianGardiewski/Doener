import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const copy = await readFile(new URL("apps/mcello/public/public-copy.js", root), "utf8");
const composition = await readFile(new URL("apps/mcello/public/homepage-composition.js", root), "utf8");
const publicContent = await readFile(new URL("apps/mcello/public/public-content.js", root), "utf8");
const index = await readFile(new URL("apps/mcello/public/index.html", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");

test("D059 public copy mixes quiet premium warmth with a restrained street-food moment", () => {
  for (const marker of [
    "Ein Ort zum Ankommen, Essen und Zusammensein",
    "Was bei Mcello ansteht",
    "Momente aus Mcello.",
    "Komm vorbei.",
    "Hier zeigen wir nur Fotos und Geschichten, die Mcello selbst freigegeben hat.",
    "Schnell ausgesucht",
    "erfinden wir lieber nichts dazu",
  ]) {
    assert.equal(`${copy}\n${composition}`.includes(marker), true, `missing D059 marker: ${marker}`);
  }
  assert.match(index, /App-schnell\. Bistro-echt\./, "one relaxed fast-casual line should remain");
});

test("customer-facing tone module avoids internal implementation vocabulary and fake superlatives", () => {
  const customerCopy = `${copy}\n${composition}`;
  for (const forbidden of [
    /\bKDS\b/i,
    /Media Layer/i,
    /CMS\/Storage/i,
    /First-Party-Inhalten/i,
    /technisch stark/i,
    /Showcase/i,
    /weltbeste|beste[rns]?\s+Kebap|Nummer\s*1|Originalrezept|seit\s+\d{4}/i,
  ]) {
    assert.doesNotMatch(customerCopy, forbidden);
  }
});

test("D059 does not hide development truth from the actual prototype surface", () => {
  assert.match(index, /Entwicklungsprototyp/);
  assert.match(index, /Preise vorläufig/);
  assert.match(index, /Lokaler Test-Checkout/);
  assert.match(index, /Originalmedien noch nicht im öffentlichen Repo/);
});

test("tone layer is part of the public module graph and offline shell", () => {
  assert.match(publicContent, /import "\.\/public-copy\.js";/);
  assert.match(sw, /"\/public-copy\.js"/);
});
