# Mcello — Store V2

Stand: 2026-08-18

Status: **governed visual/interaction slice over the existing ordering flow**.

## 1. Goal

Store V2 makes the ordering surface denser and more app-like than the public homepage while keeping a small number of products visually memorable.

The implementation does not create a new catalog, sort products by invented popularity, or move pricing/availability/cart authority into presentation code.

## 2. Adobe concept pass

Adobe Firefly was used as a creative workshop for the product-stage direction. The useful principles were:

- food as a large tactile object rather than a generic card thumbnail;
- warm cream food-stage against anthracite commerce chrome;
- copper as heat/material cue;
- selective olive as freshness cue;
- strong top-down/editorial product framing;
- enough quiet space for price and controls.

The generated concept is **CONCEPT ART ONLY**. It is not a real Mcello product, is not stored in the runtime media path and must not be presented as documentary Mcello reality. Public product media continues to use the governed placeholder/CMS pipeline until rights-confirmed Mcello media exists.

## 3. Product roles

Store V2 adds presentation roles to the already-rendered category products:

### Signature

The first existing deterministic category highlight becomes the visual `signature` slot. This does **not** mean bestseller, popularity or owner endorsement. The current truthful `Kategorie-Highlight` label remains the semantic source.

Signature treatment:

- larger food stage;
- larger product typography;
- price and configure action remain immediately visible;
- existing availability badge remains visible.

### Support

The remaining featured products become `support` products:

- compact split image/content layout;
- shorter description treatment;
- existing availability and price remain visible;
- same existing configure action.

### Compact

Products already rendered in the list become `compact` rows:

- minimal surface chrome;
- clear name, availability, price and action;
- mobile action remains full-width where useful.

## 4. Navigation and cart clarity

The existing category rail remains sticky and receives the semantic Store V2 navigation role. Touch targets stay at least 44 px.

The existing sticky cart remains the single public cart affordance. Store V2 only strengthens its visual hierarchy; totals, quantity and persistence still come from the existing application state.

## 5. Domain boundary

`store-v2.js` is presentation-only. It may decorate DOM that the existing ordering UI has already rendered, but it must not own or calculate:

- prices or price deltas;
- product or modifier availability;
- category state;
- cart contents or persistence;
- checkout state;
- analytics business rules;
- server/database truth.

The existing `app.js`, domain packages and server/database remain authoritative.

## 6. Builder handoff

Store V2 establishes the visual hierarchy that Builder Core can enter from:

- Signature product → prominent builder entry;
- support/compact products → same existing configurator path;
- `surface-food-stage` becomes the shared visual stage token;
- Motion System V2 remains the only interaction-feedback layer.

No second configurator or state model is introduced in this phase.
