import test from "node:test";
import assert from "node:assert/strict";
import { placeholderSrc, placeholderSvg } from "../apps/mcello/public/placeholder-media.js";

function decodeDataUri(uri) {
  const [, encoded = ""] = uri.split(",", 2);
  return decodeURIComponent(encoded);
}

test("product placeholders are neutral gray with the concrete item name", () => {
  const svg = placeholderSvg("Döner Teller", "product");
  assert.match(svg, /viewBox="0 0 1200 900"/);
  assert.match(svg, /fill="#777777"/);
  assert.match(svg, /fill="#ffffff"/);
  assert.match(svg, />Döner Teller<\/text>/);
  assert.doesNotMatch(svg, /gradient|image href|data:image\/jpeg/i);
});

test("placeholder formats preserve the intended media aspect ratios", () => {
  assert.match(placeholderSvg("Hero", "hero"), /viewBox="0 0 1600 900"/);
  assert.match(placeholderSvg("Team", "portrait"), /viewBox="0 0 900 1200"/);
  assert.match(placeholderSvg("Galerie", "gallery"), /viewBox="0 0 1200 900"/);
  assert.match(placeholderSvg("Event", "event"), /viewBox="0 0 1600 900"/);
});

test("placeholder text is escaped and safe inside the generated SVG", () => {
  const svg = placeholderSvg('A&B <C> "D"', "square");
  assert.match(svg, /A&amp;B/);
  assert.match(svg, /&lt;C&gt;/);
  assert.match(svg, /&quot;D&quot;/);
  assert.doesNotMatch(svg, /<C>/);
});

test("placeholderSrc returns an encoded SVG image data URI", () => {
  const uri = placeholderSrc("Pizza Margherita", "product");
  assert.match(uri, /^data:image\/svg\+xml;charset=utf-8,/);
  const svg = decodeDataUri(uri);
  assert.match(svg, /Pizza Margherita/);
  assert.match(svg, /viewBox="0 0 1200 900"/);
});
