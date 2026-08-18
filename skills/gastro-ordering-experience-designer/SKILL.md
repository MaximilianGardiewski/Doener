---
name: gastro-ordering-experience-designer
description: Design and implement restaurant ordering experiences where structured menu configuration becomes a visual, enjoyable, mobile-first product builder without duplicating server-authoritative pricing, availability, modifier, allergen, capacity or checkout logic.
---

# Gastro Ordering Experience Designer

Use this skill when a restaurant/food-service consumer already has or is building a structured menu/configurator and the next goal is to make browsing, customization and ordering feel like a coherent branded consumer product rather than a form or card grid.

## Core principle

**The food is the interaction; the visual builder is never the business authority.**

Keep existing domain/server/database logic authoritative for:

- product identity and variants;
- prices and paid extras;
- required/min/max modifier rules;
- availability, sold-out and timed availability;
- allergens/dietary metadata;
- fulfillment, capacity, slots and cutoff;
- checkout validation and order persistence.

The visual layer may interpret those facts into a `FoodStage`, ingredient layers, progress steps, animation and branded micro-interactions, but must not independently decide what can be ordered or what it costs.

## Workflow

### 0. Read truth first

Before designing:

1. read the canonical decision ledger, acceptance/evidence and current user journeys;
2. inspect the menu/product/modifier contracts and checkout path;
3. identify which data is owner-confirmed and which is provisional;
4. identify real-media/rights constraints;
5. preserve all verified technical slices unless a regression is proven.

### 1. Split Experience Mode from Commerce Mode

Public/brand pages may prioritize atmosphere, photography, storytelling and editorial composition.

Ordering pages should progressively become:

- denser;
- faster;
- more scan-friendly;
- more app-like;
- more explicit about price, availability and next action.

Share brand tokens, not necessarily the same layout primitives.

### 2. Design product entry states

Prefer trusted starting recipes over mandatory empty canvases.

For signature/default dishes provide a pattern equivalent to:

- `Exactly as designed` / `Genau so`
- `Customize` / `Anpassen`

The customization path starts from the actual standard recipe encoded by the product model.

### 3. Build the visual adapter

Create a presentation adapter from existing menu/modifier data to visual metadata.

Typical concepts:

- `FoodStage`
- `BuilderStepRail`
- `ConfiguratorOption`
- `VisualLayerDescriptor`
- `StickyOrderBar`

Do not move pricing or eligibility logic into these components.

### 4. Use product-specific mental models

Examples:

**Pizza**
- top view;
- base/sauce/cheese/toppings/extras;
- deterministic topping placement when screenshots/tests need stability.

**Döner/Yufka/Bowl**
- assembly/theke mental model;
- basis/form → protein/heart → fresh → sauce → extras;
- layered or staged visual composition.

Do not force all food types through one visual metaphor if the real preparation/order model differs.

### 5. Tap first, drag optional

Every complete order must be possible through ordinary taps/clicks and keyboard controls.

Drag-and-drop may be progressive enhancement only. It must never be required for:

- adding/removing an ingredient;
- choosing a required modifier;
- learning the current state;
- completing checkout.

### 6. Keep price and action persistent

On mobile, during configuration keep the current total and primary add/update action continuously reachable where practical.

Never make the user scroll back through the full builder just to confirm the current price or add the product.

### 7. Make sold-out and constraints visible

Do not silently remove known products/options merely because they are unavailable. Prefer visible disabled states where the product decision requires that behavior.

Explain required selections and invalid states in text, not only color/animation.

### 8. Motion is feedback, not gameplay

Good motion:

- ingredient enters/leaves;
- sauce/heat/freshness cue;
- subtle completion state;
- cart transition;
- view transition that preserves spatial orientation.

Avoid unnecessary points, coins, levels, confetti, blocking intro animations or interaction that slows ordering.

Always implement a full `prefers-reduced-motion` path.

### 9. Visual content integrity

Generated/stylized food can be used for clearly marked concepts/placeholders.

Do not present generated imagery as documentary photography of a real restaurant's dishes, staff or venue.

For final real assets require provenance/rights according to the consumer's media policy.

### 10. Performance budget

Prefer lightweight deterministic layers such as SVG, WebP/AVIF or carefully bounded Canvas depending on the chosen art direction.

Avoid loading every possible ingredient at full resolution up front.

Protect the broader product performance targets, especially LCP, INP and CLS.

### 11. Accessibility

The builder must remain understandable without seeing the food visualization.

Require:

- semantic controls;
- keyboard support;
- meaningful accessible names;
- visible focus;
- comfortable touch targets;
- text representation of selected/removed options;
- no state conveyed only by color or animation.

### 12. Visual gates and evidence

For design-heavy ordering slices require both technical evidence and real rendered screenshots.

Recommended gates:

1. Art Direction
2. Brand/Type/Photography
3. Public Homepage
4. Store
5. Builder
6. Cart/Checkout/Status
7. KDS/Admin where applicable
8. Final real-asset pass

A green unit/integration suite does not prove visual acceptance. A beautiful mockup does not prove domain/security correctness.

## Definition of done

A slice is complete only when:

- it uses real structured product state rather than a disconnected mock model;
- server/domain authority remains intact;
- tap/keyboard can complete the full flow;
- visual state mirrors configuration state;
- price/action remain clear;
- unavailable states remain honest;
- reduced-motion and accessibility paths are verified;
- visual screenshots are reviewed;
- no new mandatory vendor/runtime cost is introduced;
- reusable logic is generalized only when a second consumer or clear shared contract justifies it.
