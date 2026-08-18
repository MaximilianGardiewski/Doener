# Mcello — GSAP Motion System V3

Stand: 2026-08-18

Status: **binding implementation contract** for the staged GSAP adoption approved by the owner on 2026-08-18. This document extends D058/D065-D073, preserves the existing `MOTION_SYSTEM_V2.md` truth boundaries and supersedes only the implementation-engine portion of the older motion layer where a V3 slice is explicitly migrated.

## 1. Goal

Mcello adopts GSAP as a **presentation runtime only** to raise the quality of cinematic homepage motion, scroll orchestration, layout transitions and the interactive `FoodStage` without moving any business, security or commerce authority into animation code.

Authoritative flow:

```text
application/domain state
  -> rendered UI/DOM state
  -> Mcello Motion Adapter
  -> GSAP
  -> transform / opacity / SVG presentation
```

Forbidden flow:

```text
GSAP
  -> price / modifier validity / sold-out / cart / checkout / role / RLS truth
```

GSAP must never own, infer or mutate:

- product price or configured price;
- modifier validity or selection policy;
- sold-out / availability truth;
- cart persistence or totals;
- checkout acceptance;
- KDS/order lifecycle truth;
- authentication, authorization, role or RLS state;
- catalog/CMS structural authority;
- location scope.

Those remain in the existing application/domain/server/database boundaries.

## 2. Verified upstream baseline

Research was re-verified against the official GreenSock GitHub repository on 2026-08-18.

Initial approved dependency baseline:

- package: `gsap`
- exact version: `3.15.0`
- package license field: `Standard 'no charge' license`
- package runtime dependencies: none declared by the GSAP package metadata
- browser distribution files exist for `gsap.min.js`, `ScrollTrigger.min.js` and `Flip.min.js`

Version upgrades are never implicit. A later GSAP upgrade requires its own dependency review, tests and PR.

## 3. Initial plugin whitelist

Phase 1 may vendor only:

1. GSAP Core (`gsap.min.js`)
2. ScrollTrigger (`ScrollTrigger.min.js`)
3. Flip (`Flip.min.js`)

Not admitted in the first runtime slice:

- ScrollSmoother
- SplitText
- MorphSVG
- DrawSVG
- MotionPath
- Draggable
- Observer
- Inertia
- GSDevTools
- any all-plugins bundle

The whitelist is a portability, payload and review boundary rather than a statement that other plugins are permanently forbidden.

## 4. Distribution and self-host boundary

Mcello must not fetch GSAP from a CDN or third-party runtime host.

Forbidden runtime sources include, without limitation:

- jsDelivr
- cdnjs
- unpkg
- gsap.com hosted runtime files
- Webflow-hosted runtime files

The exact npm package is an installation/build input. Mcello exposes only the explicitly whitelisted local browser files through its own origin and includes them in static/self-hosted preview output.

The PWA service worker may cache those same-origin vendor assets for offline use.

No Webflow account, CDN, Adobe service, Figma service, Lovable service or Vercel service becomes a GSAP runtime requirement.

## 5. Motion adapter boundary

GSAP calls belong behind Mcello-owned motion modules. Business/page controllers must not scatter direct GSAP calls through ordering, KDS, catalog or auth code.

Target shape:

```text
apps/mcello/public/
  motion.js                 # stable public facade / event bridge
  motion.css                # non-GSAP styling + fallback/reduced-motion rules
  motion/
    engine.js               # GSAP acquisition/registration/lifecycle
    homepage.js             # homepage choreography
    commerce.js             # store/product/layout feedback
    builder.js              # FoodStage presentation
    accessibility.js        # reduced-motion and cleanup policy
```

Migration is incremental. An unmigrated V2 motion contract remains valid until its V3 replacement passes its gate.

## 6. Progressive enhancement rule

Mcello must remain fully functional when:

- GSAP is available and normal motion is allowed;
- `prefers-reduced-motion: reduce` is active;
- GSAP fails to load or is intentionally disabled for a fallback test.

No primary content, CTA, product option, cart action, checkout action or KDS action may depend on an animation completing.

Animation may communicate feedback, continuity and brand character, but never required information by itself.

## 7. Reduced motion

`prefers-reduced-motion` remains a hard gate.

V3 must preserve the existing V2 guarantees:

- no reveal-hidden content remains hidden;
- no scroll-depth transform is required for content visibility;
- interaction animation is disabled or reduced to an effectively immediate final state;
- controls remain usable;
- application state is unchanged;
- final visual state is deterministic.

`gsap.matchMedia()`/GSAP cleanup may be used, but CSS/browser fallbacks remain authoritative safety nets.

## 8. Performance rules

Default animation properties:

- `transform`
- `opacity`
- explicitly reviewed SVG presentation properties later

Avoid continuous layout animation of:

- width/height
- top/left
- margin/padding
- layout-affecting properties in scroll loops

No decorative infinite animation may run continuously in normal Mcello commerce/KDS use.

Existing design acceptance remains binding:

- LCP <= 2.5 s target at p75
- INP <= 200 ms target at p75
- CLS <= 0.1 target at p75

GSAP is removed or simplified where it measurably harms these targets or operational usability.

## 9. Public vs Operations motion

### Public / Homepage

May use the strongest GSAP expression:

- cinematic but bounded reveal sequences;
- subtle scroll-linked food depth;
- section choreography;
- later accepted SVG/food animation.

### Store / Builder

Motion prioritizes continuity and response:

- category transitions;
- product card -> product/builder continuity;
- modifier/FoodStage feedback;
- cart confirmation;
- later optional drag as progressive enhancement only.

### KDS / Admin / Ops

Motion stays minimal and operational:

- drawer/status transitions;
- short state feedback;
- no cinematic scroll storytelling;
- no required delayed transitions;
- no animation that obscures alarm, accept/reject, ETA, ready/completed or sold-out controls.

## 10. Plugin admission policy

### ScrollTrigger — approved for staged adoption

Primary use:

- homepage scroll orchestration;
- replacement for the bespoke hero scroll-depth listener after parity tests;
- responsive trigger management.

Native browser scrolling remains the default.

### Flip — approved for staged adoption

Primary use:

- product-card/layout continuity after the application has already changed the real DOM state;
- store and product transitions.

Flip never decides which product opens or which state is valid.

### ScrollSmoother — not approved initially

Reason:

- Mcello has sticky commerce UI, sheets/modals, orientation changes, PWA behavior and operational views;
- replacing/transforming the scroll presentation adds complexity with little initial value.

Any future admission requires a separate mobile/sticky/accessibility gate.

### MorphSVG / DrawSVG / MotionPath — later gated option

Only after accepted portable SVG assets exist and performance/content-integrity gates are satisfied.

### SplitText — separate accessibility gate

Do not adopt by default. Before any production-facing use, re-check current upstream accessibility behavior/issues and prove the exact implementation in keyboard/screenreader tests. If semantic exposure is not robust, do not use it.

### Draggable / Observer — later optional enhancement

Tap/keyboard remains sufficient. Drag may never become a functional requirement of the V1 builder.

## 11. Phase plan

### Phase 0 — Architecture Decision

- create this binding V3 contract;
- add D074 to the decision ledger;
- document dependency/license/version/plugin boundaries;
- preserve V2 business/security contracts.

Gate: documentation/static invariants only; no visible UI change.

### Phase 1 — Local GSAP Runtime Foundation

- pin `gsap` exactly;
- expose/copy only Core + ScrollTrigger + Flip from the installed package;
- no CDN or external runtime request;
- include static-build/self-host output;
- include PWA offline cache paths;
- add static tests for version, whitelist and portability.

Gate: application visuals and behavior stay identical to V2.

### Phase 2 — Mcello Motion Adapter V3

- introduce Mcello-owned GSAP engine/lifecycle modules;
- load/register approved plugins behind one adapter;
- implement normal/reduced/fallback lifecycle and cleanup;
- do not migrate visible contracts yet until adapter tests pass.

Gate: GSAP on/off/reduced paths are functionally identical.

### Phase 3 — Incremental V2 contract migration

Migrate individually in this order:

1. reveal
2. hero depth
3. category change
4. product open
5. ingredient feedback
6. cart confirmation

CSS hover/focus microinteractions stay CSS where GSAP adds no value.

Gate after every slice: existing motion/browser tests plus new GSAP-specific tests.

### Phase 4 — Homepage cinematic choreography

- ScrollTrigger-based section choreography;
- no custom smooth-scroll replacement;
- ordering CTA never waits for animation;
- desktop/mobile/reduced-motion tuned separately.

Gate: screenshot/interaction/performance acceptance.

### Phase 5 — Store + Flip

- capture pre-change visual state;
- allow the application to open/render the real product state;
- animate visual continuity with Flip afterward;
- fallback remains the normal immediate modal/builder opening.

Gate: product/cart/checkout behavior identical with GSAP disabled.

### Phase 6 — FoodStage Motion Engine

- selected structured modifier state remains authoritative;
- GSAP animates the already-derived FoodStage representation;
- add/remove feedback is deterministic;
- price/validation/availability never move into motion code.

Gate: tap/keyboard/reduced-motion plus builder lifecycle tests.

### Phase 7 — Accepted vector assets + Morph evaluation

- Firefly/Adobe/Illustrator may create/refine visual assets under `DESIGN_PIPELINE_V5.md`;
- accepted assets return to Git/Media pipeline;
- evaluate MorphSVG only for appropriate portable SVG paths;
- no generated visual is treated as documentary Mcello food truth.

Gate: asset provenance + payload + browser evidence.

### Phase 8 — SplitText evaluation

- fresh upstream accessibility review;
- limited headline-only prototype if justified;
- explicit semantic/screenreader evidence;
- reject if semantic behavior is not robust.

Gate: accessibility acceptance, not visual appeal alone.

### Phase 9 — Gesture evaluation

- optionally test Draggable/Observer;
- tap and keyboard remain complete;
- drag is additive only.

Gate: touch/rotation/keyboard parity.

### Phase 10 — Performance/PWA/device gate

Validate normal motion, reduced motion and GSAP-unavailable paths across relevant phone/tablet/desktop sizes, including portrait/landscape rotation where applicable.

Required checks include:

- no external GSAP network request;
- offline cached vendor availability;
- no horizontal overflow;
- no sticky/modal/orientation regression;
- no console/page errors;
- performance within Mcello budgets.

### Phase 11 — Operations/KDS restraint pass

Only minimal, short operational transitions are considered. No show-oriented choreography.

Gate: operational speed/readability remains dominant.

### Phase 12 — Final GSAP acceptance

GSAP becomes a stable Mcello runtime component only when:

- self-host/offline path is reproducible;
- no CDN/runtime vendor lock-in exists;
- normal/reduced/fallback paths pass;
- domain/security boundaries pass;
- ordering/builder/KDS regressions pass;
- applicable visual/performance gates pass;
- required GitHub Actions/reviews are green.

No production deployment follows automatically.

## 12. Rollback rule

Every GSAP migration must remain independently reversible.

If a GSAP slice fails accessibility, performance, browser or operational acceptance, revert that slice to the last green Mcello motion implementation without reverting unrelated ordering/domain/security work.

## 13. Production boundary

This approval authorizes repository implementation and non-production validation of the staged GSAP plan.

It does **not** authorize:

- production deployment;
- Vercel deployment;
- enabling a new paid runtime/SaaS dependency;
- changing production catalog/business truth;
- changing Supabase/RLS/auth/domain policy.
