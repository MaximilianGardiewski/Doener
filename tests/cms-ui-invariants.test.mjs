import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const index = await readFile(new URL("../apps/mcello/public/index.html", import.meta.url), "utf8");
const admin = await readFile(new URL("../apps/mcello/public/content.js", import.meta.url), "utf8");
const publicContent = await readFile(new URL("../apps/mcello/public/public-content.js", import.meta.url), "utf8");

test("public homepage no longer ships fabricated demo news", () => {
  assert.match(index, /id="newsStack"/);
  assert.match(index, /public-content\.js/);
  assert.doesNotMatch(index, /Community-Abend/);
  assert.doesNotMatch(index, /Lunch Special/);
  assert.doesNotMatch(index, /Frisch gepresst/);
});

test("editorial admin keeps publication and event occurrence as separate controls", () => {
  assert.match(admin, /visibleFrom/);
  assert.match(admin, /visibleUntil/);
  assert.match(admin, /eventStartsAt/);
  assert.match(admin, /eventEndsAt/);
  assert.match(admin, /admin_save_editorial_post/);
  assert.match(admin, /admin_replace_homepage_sections/);
});

test("public CMS renderer consumes only the server-approved bootstrap snapshot", () => {
  assert.match(publicContent, /fetch\("\/api\/menu"/);
  assert.match(publicContent, /menuSnapshot\.content/);
  assert.match(publicContent, /homepageConfigured/);
  assert.match(publicContent, /editorialPosts/);
});
