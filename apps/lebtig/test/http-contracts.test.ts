import assert from "node:assert/strict";
import test from "node:test";

import {
  LEBTIG_LEGACY_RECIPE_SLUGS,
  buildLebtigSitemap,
  resolveLebtigLegacyRedirect,
} from "../src/http-contracts.ts";

test("legacy page redirects canonicalize case and trailing slash while preserving query", () => {
  assert.equal(resolveLebtigLegacyRedirect("/Startseite"), "/");
  assert.equal(resolveLebtigLegacyRedirect("/Mittagstisch/", "?utm_source=flyer"), "/mittagstisch?utm_source=flyer");
  assert.equal(resolveLebtigLegacyRedirect("/Kontakt/Oeffnungszeiten"), "/kontakt");
  assert.equal(resolveLebtigLegacyRedirect("/impressum"), null);
});

test("verified legacy recipe slugs fall back to the portable recipe index", () => {
  for (const slug of LEBTIG_LEGACY_RECIPE_SLUGS) {
    assert.equal(resolveLebtigLegacyRedirect(`/Rezepte/${slug}/`), "/rezepte");
  }
});

test("unknown paths are not silently redirected", () => {
  assert.equal(resolveLebtigLegacyRedirect("/gibt-es-nicht-xyz"), null);
  assert.equal(resolveLebtigLegacyRedirect("/rezepte/neuer-cms-slug"), null);
});

test("sitemap is generated from app-owned indexable static route contracts", () => {
  const xml = buildLebtigSitemap("https://example.test/");
  assert.match(xml, /^<\?xml version="1\.0"/);
  for (const pathname of [
    "/mittagstisch",
    "/wochenangebote",
    "/partyservice",
    "/kontakt",
    "/sortiment",
    "/ueber-uns",
    "/aktuelles",
    "/rezepte",
    "/datenschutz",
    "/impressum",
  ]) {
    assert.match(xml, new RegExp(`https://example\\.test${pathname.replace("/", "\\/")}`));
  }
  assert.doesNotMatch(xml, /\/auth<\/loc>/);
  assert.doesNotMatch(xml, /:slug/);
  assert.doesNotMatch(xml, /\/media\//);
});
