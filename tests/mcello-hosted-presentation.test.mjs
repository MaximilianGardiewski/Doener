import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  showcase,
  showcaseDataRaw,
  localPresentationDataRaw,
  presentationMode,
  indexHtml,
  serviceWorker,
  vercelRaw,
  buildPreview,
] = await Promise.all([
  read("apps/mcello/public/presentation-showcase.js"),
  read("apps/mcello/public/presentation-builder-showcase.v1.json"),
  read("data/mcello/builder-presentation.v1.json"),
  read("apps/mcello/public/presentation-mode.js"),
  read("apps/mcello/public/index.html"),
  read("apps/mcello/public/sw.js"),
  read("vercel.json"),
  read("scripts/build-preview.mjs"),
]);

const showcaseData = JSON.parse(showcaseDataRaw);
const localPresentationData = JSON.parse(localPresentationDataRaw);
const vercel = JSON.parse(vercelRaw);

test("hosted showcase is explicitly presentation-only and does not become production data", () => {
  assert.equal(showcaseData.status, "presentation-only-browser-showcase");
  assert.equal(showcaseData.scope, "hosted-or-local-presentation-fallback-only");
  assert.match(showcaseData.notes.join("\n"), /not a production catalog/i);
  assert.match(showcaseData.notes.join("\n"), /never be imported into production/i);
});

test("hosted presentation Builder data stays aligned with governed presentation data", () => {
  assert.equal(showcaseData.pizza.productSourceId, localPresentationData.pizza.productSourceId);
  assert.deepEqual(
    showcaseData.pizza.groups[0].options.map((option) => option.name),
    localPresentationData.pizza.groups[0].options.map((option) => option.name),
  );
  assert.deepEqual(showcaseData.donerYufka.productSourceIds, localPresentationData.donerYufka.productSourceIds);
  assert.deepEqual(
    showcaseData.donerYufka.groups[0].options.map((option) => option.name),
    ["Curry", "Knoblauch", "Scharf"],
  );
  assert.ok(showcaseData.pizza.groups[0].options.every((option) => option.priceDeltaCents === 0));
  assert.ok(showcaseData.donerYufka.groups[0].options.every((option) => option.priceDeltaCents === 0));
});

test("hosted fallback only substitutes the menu read and never fakes checkout or backend health", () => {
  assert.match(showcase, /requestUrl\.pathname !== "\/api\/menu"/);
  assert.match(showcase, /const response = await nativeFetch\(input, init\);[\s\S]*if \(response\.ok\) return response;/);
  assert.doesNotMatch(showcase, /\/api\/health/);
  assert.doesNotMatch(showcase, /\/api\/checkout/);
  assert.doesNotMatch(showcase, /\/api\/dev\/otp/);
});

test("hosted presentation requires the explicit presentation query and a Vercel HTTPS host", () => {
  assert.match(showcase, /params\.get\("presentation"\) === "mcello"/);
  assert.match(showcase, /window\.location\.protocol === "https:" && hostname\.endsWith\("\.vercel\.app"\)/);
  assert.match(presentationMode, /window\.location\.protocol === "https:" && hostname\.endsWith\("\.vercel\.app"\)/);
  assert.match(presentationMode, /params\.get\(PRESENTATION_PARAM\) === PRESENTATION_VALUE/);
  assert.match(presentationMode, /Hosted Showcase/);
});

test("showcase bootstrap runs before the Mcello application and remains cached in the PWA shell", () => {
  const bootstrapIndex = indexHtml.indexOf('<script src="/presentation-showcase.js"></script>');
  const appIndex = indexHtml.indexOf('<script type="module" src="/app.js"></script>');
  assert.ok(bootstrapIndex >= 0, "presentation bootstrap missing");
  assert.ok(appIndex > bootstrapIndex, "presentation bootstrap must execute before app.js");
  assert.match(serviceWorker, /mcello-public-shell-v19/);
  assert.match(serviceWorker, /\/presentation-showcase\.js/);
  assert.match(serviceWorker, /\/presentation-builder-showcase\.v1\.json/);
  assert.match(serviceWorker, /\/menu-seed\.provisional\.json/);
});

test("Vercel target is a noindex static presentation build", () => {
  assert.equal(vercel.buildCommand, "npm run build:preview");
  assert.equal(vercel.outputDirectory, "dist");
  assert.equal(vercel.framework, null);
  const robotHeader = vercel.headers
    ?.flatMap((entry) => entry.headers || [])
    .find((header) => header.key === "X-Robots-Tag");
  assert.equal(robotHeader?.value, "noindex, nofollow, noarchive");
  assert.match(buildPreview, /apps", "mcello", "public/);
  assert.match(buildPreview, /const out = path\.join\(root, "dist"\)/);
});
