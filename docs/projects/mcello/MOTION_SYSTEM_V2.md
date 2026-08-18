# Mcello — Motion System V2

Stand: 2026-08-18

Status: **governed implementation note for Homepage/Commerce motion**. This document extends D058 and the D065–D070 design rebaseline; it does not create new domain authority.

GSAP migration note: `GSAP_MOTION_V3.md` + D074 are now binding for the staged motion-engine migration. The five contracts and truth/accessibility boundaries below remain authoritative until each individual V2 contract is explicitly migrated and passes its V3 gate. V3 may replace the rendering engine; it may not weaken these boundaries.

## 1. Purpose

Motion makes the Mcello experience feel food-first, tactile and app-fast without turning interaction into decoration. It is progressive enhancement over the existing first-party ordering flow.

The runtime motion layer may react to already-existing UI state, but it must not own or infer:

- product price;
- modifier validity;
- sold-out state;
- shop/order availability;
- cart persistence;
- checkout acceptance;
- server or database truth.

Those remain in the existing application/domain/server boundaries.

## 2. Adobe concept pass

An Adobe Firefly concept pass was run on 2026-08-18 as a **creative workshop only**. The useful direction was:

- tactile close-up food surfaces rather than generic restaurant decoration;
- warm oven/heat light against anthracite;
- copper/olive accents as material/food cues, not luxury ornament;
- asymmetrical editorial framing;
- generous cream negative space for large typography and UI;
- no logo, text, people or documentary Mcello claims.

The generated concept is **not a real Mcello dish or production asset** and is not published into the customer-facing media path. Runtime media remains governed by placeholders/CMS until real, rights-confirmed Mcello media exists.

## 3. Five motion contracts

### A — Food / Hero Motion

The hero food/media layer receives a bounded scroll-depth offset. Only `transform` changes. The effect is subtle and disappears entirely under `prefers-reduced-motion`.

### B — Product Interaction

Product cards/list rows provide short tactile activation feedback and the existing product modal receives a brief transform/opacity entrance. Product opening still belongs to the existing ordering UI.

### C — Category Transition

A category selection animates the already re-rendered menu surfaces and the newly active category chip. Category state itself remains owned by the existing menu controller.

### D — Ingredient Add / Remove

Existing modifier inputs expose a builder-ready visual contract:

- checked → `added`;
- unchecked → `removed`;
- the option and current food-stage image receive short visual feedback.

This is deliberately generic today. Pizza Builder will later map real ingredient layers onto the same interaction semantics without moving modifier validation out of the domain layer.

### E — Cart Add / Sticky Bar

A valid existing `#addToCart` action triggers a short confirmation pulse on the sticky cart bar. Quantity, total, persistence and checkout remain untouched by motion code.

## 4. Performance boundary

Motion is limited to compositor-friendly visual properties: primarily `transform` and `opacity`. No continuous infinite animation is allowed. No width/height/top/left/margin/padding animation is introduced.

## 5. Accessibility boundary

`prefers-reduced-motion: reduce` is a hard contract:

- reveal-hidden states are not activated;
- scroll-depth offsets are not injected;
- interaction animations are disabled;
- content and controls remain fully visible and usable;
- application state and interaction behavior do not change.

## 6. Future Builder compatibility

D065/D066 remain authoritative:

- Tap-first, drag optional;
- real standard recipe is the initial Mcello Original state;
- visual ingredient layers mirror structured modifier state;
- price, validity and availability are always authoritative outside the visual layer.

Store V2 and Builder Core may reuse these motion roles, but should not fork a second interaction-state model.
