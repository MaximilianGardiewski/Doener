import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const release = JSON.parse(await readFile(new URL("docs/projects/mcello/PRESENTATION_RELEASE_V1.json", root), "utf8"));
const releaseDocs = await readFile(new URL("docs/projects/mcello/PRESENTATION_RELEASE_V1.md", root), "utf8");
const presentationData = JSON.parse(await readFile(new URL("data/mcello/builder-presentation.v1.json", root), "utf8"));
const responsiveDocs = await readFile(new URL("docs/projects/mcello/BUILDER_RESPONSIVE_V3.md", root), "utf8");
const presentationMode = await readFile(new URL("apps/mcello/public/presentation-mode.js", root), "utf8");
const lifecycle = await readFile(new URL("tests/mcello-presentation-builder-lifecycle.browser.mjs", root), "utf8");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

const donerGroups = new Map(presentationData.donerYufka.groups.map((group) => [group.name, group]));

test("presentation release pins the merged functional runtime and remains non-production", () => {
  assert.equal(release.status, "presentation-release-candidate");
  assert.equal(release.runtimeBaseCommit, "6bd33c504b09c5fd3ae43c6e02f8a9136d6d05d5");
  assert.equal(release.deployment, "not-deployed-to-production");
  assert.equal(release.scope, "local-private-lan-demo");
  assert.match(releaseDocs, /No production deployment is part of this release/);
});

test("release Pizza contract matches the localhost presentation data exactly", () => {
  assert.equal(release.pizza.sourceId, "pizza-076");
  assert.equal(release.pizza.sourceId, presentationData.pizza.productSourceId);
  assert.deepEqual(release.pizza.presentationIngredients, ["Kebap Fleisch", "Tomaten", "Broccoli", "Käse", "Zwiebeln"]);
  assert.deepEqual(release.pizza.presentationIngredients, presentationData.pizza.groups[0].options.map((option) => option.name));
  assert.ok(presentationData.pizza.groups[0].options.every((option) => option.priceDeltaCents === 0));
});

test("historical release Döner/Yufka contract remains sauce-only while V4 adds separately labeled local assumptions", () => {
  const sauceGroup = donerGroups.get("Soße");
  const basisGroup = donerGroups.get("Basis");
  const freshGroup = donerGroups.get("Gemüse");
  assert.ok(sauceGroup && basisGroup && freshGroup);
  assert.deepEqual(release.donerYufka.confirmedSauces, ["Curry", "Knoblauch", "Scharf"]);
  assert.deepEqual(release.donerYufka.confirmedSauces, sauceGroup.options.map((option) => option.name));
  assert.deepEqual(basisGroup.options.map((option) => option.name), ["Fleisch", "Falafel"]);
  assert.deepEqual(freshGroup.options.map((option) => option.name), ["Salat", "Tomate", "Gurke", "Zwiebel"]);
  assert.equal(release.donerYufka.productionSelectionPolicy, "unconfirmed");
  assert.ok(sauceGroup.options.every((option) => option.priceDeltaCents === 0));
  assert.ok(basisGroup.options.every((option) => option.priceDeltaCents === 0));
  assert.ok(freshGroup.options.every((option) => option.priceDeltaCents === 0));
  assert.match(presentationData.notes.join("\n"), /presentation assumptions/i);
  assert.match(releaseDocs, /single-vs-multiple sauce selection is \*\*still unconfirmed\*\*/);
});

test("release device matrix keeps touch Builder landscape-only while desktop stays unrestricted", () => {
  assert.equal(release.deviceMatrix.desktop, "full-builder");
  assert.equal(release.deviceMatrix.tablet, "landscape-only-with-portrait-gate");
  assert.equal(release.deviceMatrix.smartphone, "landscape-only-with-portrait-gate");
  assert.match(responsiveDocs, /Smartphone and Tablet.*Querformat/s);
  assert.match(responsiveDocs, /kein Reload und kein Verlust/s);
  assert.match(releaseDocs, /Builder itself is landscape-only/i);
});

test("release keeps the explicit presentation mode and both one-command launchers", () => {
  assert.equal(release.presentationMode, "?presentation=mcello&reset=1");
  assert.match(presentationMode, /PRESENTATION_VALUE = "mcello"/);
  assert.match(presentationMode, /RESET_PARAM = "reset"/);
  assert.match(packageJson.scripts["demo:mcello:win"], /demo-mcello\.ps1/);
  assert.match(packageJson.scripts["demo:mcello:lan"], /demo-mcello-presentation-lan\.ps1/);
});

test("release presentation story is backed by the real Builder checkout KDS lifecycle test", () => {
  for (const term of ["Pizza Mcello", "Drehspieß im Yufka", "Zwiebeln", "Knoblauch", "Scharf", "Eingegangen", "In Zubereitung", "Abholbereit", "Abgeholt"]) {
    assert.match(lifecycle, new RegExp(term));
  }
  assert.match(lifecycle, /submitOrder/);
  assert.match(lifecycle, /data-action="accept"/);
  assert.match(lifecycle, /data-action="ready"/);
  assert.match(lifecycle, /data-action="complete"/);
});

test("release explicitly keeps schematic media separate from documentary Mcello reality", () => {
  assert.equal(release.mediaTruth, "schematic-browser-generated-presentation-visuals-not-documentary-mcello-photography");
  assert.match(releaseDocs, /not documentary Mcello product photography/i);
  assert.match(releaseDocs, /no Adobe\/Firefly concept URL is shipped as real runtime product media/i);
});
