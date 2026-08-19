import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const build = await readFile(new URL("../scripts/build-cloudflare-preview.mjs", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/mcello-cloudflare-preview.yml", import.meta.url), "utf8");
const remoteBrowser = await readFile(new URL("./mcello-cloudflare-preview.browser.mjs", import.meta.url), "utf8");

test("Cloudflare mirror is manual preview-only infrastructure", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\npush:|\npull_request:/);
  assert.match(workflow, /CLOUDFLARE_PREVIEW_BRANCH: preview/);
  assert.match(workflow, /production_branch[\\\"]+:?[\\\"]+production-disabled/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(workflow, /cfat_[A-Za-z0-9_-]+/i, "Cloudflare API tokens must never be committed");
  assert.doesNotMatch(workflow, /--branch[= ]+(main|production)\b/i);
});

test("Cloudflare mirror fakes menu read only, never backend health or checkout", () => {
  assert.match(build, /\/api\/menu \/preview\/menu\.json 200/);
  assert.doesNotMatch(build, /\/api\/health[^\n]*200|\/api\/checkout[^\n]*200|\/api\/dev\/otp[^\n]*200/i);
  assert.match(build, /cloudflare-preview-read-only/);
  assert.match(build, /never production catalog truth/i);
  assert.match(build, /priceDeltaCents, 0/);
});

test("Cloudflare remote acceptance proves configurator and real GSAP takeovers", () => {
  assert.match(remoteBrowser, /globalThis\.gsap\?\.version/);
  assert.match(remoteBrowser, /ScrollTrigger/);
  assert.match(remoteBrowser, /globalThis\.Flip/);
  assert.match(remoteBrowser, /data-product=\\?"warm-013/);
  assert.match(remoteBrowser, /Basis/);
  assert.match(remoteBrowser, /Gemüse/);
  assert.match(remoteBrowser, /Soße/);
  assert.match(remoteBrowser, /data-food-stage-v4/);
  assert.match(remoteBrowser, /data-motion-product-engine='gsap'/);
  assert.match(remoteBrowser, /data-motion-ingredient-engine='gsap'/);
});
