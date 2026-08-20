import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

/*
 * The KDS lane adapter is allowed to explain where a card went. It is not
 * allowed to decide that. These guards keep the boundary where the browser
 * verification found it: kds.js owns state, the adapter owns travel.
 */

const root = new URL("../", import.meta.url);
const operationsSource = await readFile(new URL("apps/mcello/public/motion/operations.js", root), "utf8");
// Guards belong on the code, not on the prose explaining it: the module comment
// legitimately names the lanes it must never decide.
const operations = operationsSource
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
const kds = await readFile(new URL("apps/mcello/public/kds.js", root), "utf8");
const kdsHtml = await readFile(new URL("apps/mcello/public/kds.html", root), "utf8");

test("KDS lane motion holds no order or lane authority", () => {
  // No lane decision, no order lifecycle, no backend reach.
  assert.doesNotMatch(operations, /stateToLane|isUrgent|normalize\(/);
  // No lane may be named as a value here -- naming one is deciding one.
  for (const lane of ["incoming", "planned", "preparing", "ready", "waiting_for_acceptance", "scheduled"]) {
    assert.doesNotMatch(operations, new RegExp(`["'\`]${lane}["'\`]`), `lane "${lane}" must not appear as a value`);
  }
  assert.doesNotMatch(operations, /fetch\(|localStorage|sessionStorage|\/api\//);
  assert.doesNotMatch(operations, /totalCents|total_cents|price|accept|reject|alarm/i);
  assert.doesNotMatch(operationsSource, /\bfetch\(|\/api\//, "not even in a comment: this module never reaches a backend");
  // Matching happens through the published identity attribute, never content.
  assert.match(operationsSource, /data-flip-id/);
  assert.doesNotMatch(operations, /customer|product_name|order_number/);
});

test("KDS lane motion degrades to instant placement", () => {
  // Every path that cannot animate must return without touching the card:
  // kds.js has already put it in the right lane by then.
  assert.match(operations, /prefersReducedMotion\(\)/);
  assert.match(operations, /if \(!flip \|\| prefersReducedMotion\(\)\) return;/);
  assert.match(operations, /if \(!fromState \|\| !flip \|\| prefersReducedMotion\(\)\) return;/);
  assert.match(operations, /if \(!readyEngine\.available\) return;/);
  // D074: Flip only, from the shared self-hosted engine. No second runtime.
  assert.match(operations, /from "\.\/engine\.js"/);
  assert.doesNotMatch(operations, /\bgsap\s*=|window\.gsap/, "the engine owns the runtime, not this adapter");
  assert.doesNotMatch(operations, /cdn|unpkg|jsdelivr|import\(\s*["']https?:/i);
});

test("KDS renders the lane itself and only brackets it with motion", () => {
  // The hooks must sit around the existing render, not inside its decisions.
  assert.match(kds, /laneMotion\.captureBeforeRender\(\);/);
  assert.match(kds, /laneMotion\.playAfterRender\(\);/);
  assert.match(kds, /el\.dataset\.flipId = `order-\$\{order\.id\}`;/);
  // Capture happens before the lanes are wiped, play after they are rebuilt.
  const capture = kds.indexOf("laneMotion.captureBeforeRender()");
  const wipe = kds.indexOf('target[lane].innerHTML = ""');
  const play = kds.indexOf("laneMotion.playAfterRender()");
  assert.ok(capture > -1 && wipe > capture, "capture must run before the lanes are wiped");
  assert.ok(play > wipe, "play must run after the lanes are rebuilt");
});

test("KDS lanes cannot be pushed past the viewport by their own content", () => {
  // A grid track's default min-content floor let a nowrap control widen the
  // last lane off-screen on a 1024px tablet. Every track keeps a zero floor.
  const tracks = kdsHtml.match(/grid-template-columns:[^;}]+/g) ?? [];
  assert.ok(tracks.length >= 3, "expected the base grid plus its two breakpoints");
  for (const track of tracks) {
    assert.match(track, /minmax\(0/, `grid track needs a zero min floor: ${track}`);
  }
});
