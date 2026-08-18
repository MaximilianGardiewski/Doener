# Mcello — Brand System V2

Stand: 2026-08-18

Status: **Foundation contract for Gate B.** Exact final logo assets, final typeface files and real photography remain owner-/rights-dependent. This document intentionally separates semantic design roles from raw color values so the website can evolve without rewriting every component.

## 1. Design DNA

Mcello combines:

- **Cinematic warmth** — food, fire, venue, craft;
- **consumer-product precision** — store, builder, checkout, status;
- **editorial individuality** — selective asymmetry, crops, rules, labels;
- **local hospitality** — warm, personal, never sterile or corporate.

Working art-direction blend: **58 % Cinematic Urban Bistro / 28 % Warm Future Hospitality / 14 % Editorial Street Luxury**. See `ART_DIRECTION.md`.

## 2. Compatibility strategy

The existing D001 palette is already contrast-tested and used by the live preview. V2 therefore does **not** delete or rename the current raw tokens in one large change.

Instead:

1. preserve current raw tokens (`ink-*`, `cream-*`, `amber-*`, `heritage-green`);
2. introduce semantic Mcello V2 aliases;
3. migrate components slice by slice;
4. adjust final raw values only after visual Gate B;
5. keep compatibility aliases until Homepage/Store/Builder/KDS/Admin have migrated.

This avoids visual churn and prevents a brand refactor from breaking KDS/checkout/runtime behavior.

## 3. Semantic color roles

### Brand foundation

| Semantic token | Provisional source | Role |
|---|---|---|
| `--mcello-ink` | `--ink-1000` | deepest background, cinematic black |
| `--mcello-charcoal` | `--ink-950` | primary app/page background |
| `--mcello-coal` | `--ink-800` | elevated dark surfaces |
| `--mcello-copper` | `--amber-650` | craft, linework, metal, restrained emphasis |
| `--mcello-gold` | `--amber-300` | warm highlight, selected premium signal |
| `--mcello-olive` | `--heritage-green` | recognition, fresh/status accent |
| `--mcello-cream` | `--cream-50` | primary warm light/text |
| `--mcello-bread` | `--cream-100` | warm secondary light surface/text |
| `--mcello-stone` | `--cream-300` | muted text/quiet neutral |

### Surface roles

| Token | Meaning |
|---|---|
| `--surface-cinematic` | deepest immersive public/hero stage |
| `--surface-base` | default application background |
| `--surface-raised` | cards/sheets/panels when a raised surface is actually needed |
| `--surface-warm` | light cream/bread editorial section |
| `--surface-food-stage` | neutral stage behind product/ingredient visualization |
| `--surface-operational` | KDS/Admin pragmatic dark surface |

### Content roles

- `--content-primary`
- `--content-secondary`
- `--content-inverse`
- `--content-accent`
- `--content-fresh`
- `--content-danger`

### Border / rule roles

- `--rule-subtle`
- `--rule-warm`
- `--rule-strong`
- `--focus-ring`

## 4. Accent discipline

### Gold/Copper

Use for:

- fine editorial rules;
- signature/selected states;
- price emphasis when context needs it;
- craft/heat cues;
- limited primary CTAs.

Do **not** make every button gold.

### Olive

Use for:

- freshness;
- positive operational state;
- selected brand recognition details;
- ingredient/freshness cues.

It must remain selective, consistent with the existing D001 guard.

### Ember / red

Use only for:

- heat/spicy micro-signals;
- kitchen/oven atmosphere;
- error/danger only when semantically appropriate.

Do not introduce a permanent bright-red secondary brand.

## 5. Light/dark rhythm

Mcello V2 is not a permanently black page.

Public pages should deliberately alternate:

1. cinematic dark hero;
2. warm/light editorial breathing room;
3. dark signature food;
4. warm venue/story surface;
5. controlled dark footer/location transition.

The Store remains predominantly dark/warm-neutral but uses warm light `FoodStage`/ingredient surfaces where they improve product readability.

## 6. Typography contract

### Display role

Needs:

- recognizable personality;
- strong food/editorial presence;
- German/Latin coverage;
- good large-size rendering;
- no overly formal fashion-luxury feeling.

Used for:

- Hero;
- section headlines;
- signature dish names;
- occasional large status/number moments.

### Interface role

Needs:

- excellent readability at 12–18 px;
- clear numeric forms for price/time/order numbers;
- German/Latin coverage;
- strong mobile UI behavior;
- self-hostable/licensed web path.

Used for:

- navigation;
- category rail;
- buttons;
- modifier options;
- cart/checkout;
- KDS/Admin.

### Current implementation boundary

The current system fallbacks remain active until a final web-license/self-host path is approved. No remote `@import`/Google Fonts dependency is introduced during Gate B.

Adobe Fonts exploration is useful for selection, but the application must keep a deployment path that does not silently depend on a new monthly runtime/service requirement (`D063`, `D070`).

## 7. Type hierarchy

Recommended semantic scale roles:

- `--type-display-hero`
- `--type-display-section`
- `--type-display-product`
- `--type-title`
- `--type-body-lg`
- `--type-body`
- `--type-label`
- `--type-meta`
- `--type-price`
- `--type-order-number`

Exact `clamp()` values belong to the implementation slice; the hierarchy role is stable now.

## 8. Shape language

Mcello should move away from universal rounded cards.

### Editorial / public

- larger image crops with 24–40 px radii only where useful;
- sharp/straight editorial rules can cut through rounded media;
- asymmetrical crop edges and offset frames are allowed;
- light sections may use flatter/no-card composition.

### Commerce

- 12–20 px practical radii;
- pill shape reserved for category/status chips and compact controls;
- bottom sheets/configurator bars use clear structural geometry;
- ingredient chips/options must prioritize touch/readability over ornament.

### KDS/Admin

- tighter radii;
- higher information density;
- minimal decorative framing.

## 9. Image ratios

Semantic media ratios:

- `--ratio-hero`: `16 / 10` working target;
- `--ratio-signature`: `4 / 5` or `1 / 1` depending route;
- `--ratio-product`: `4 / 3`;
- `--ratio-ingredient`: `1 / 1`;
- `--ratio-gallery-wide`: `16 / 9`;
- `--ratio-gallery-portrait`: `4 / 5`.

Real photo assets should be authored/cropped to these families, not arbitrarily per component.

## 10. Motion language

Semantic motion roles:

- `--motion-fast`: direct feedback;
- `--motion-ui`: sheet/button/category transitions;
- `--motion-food`: ingredient add/remove;
- `--motion-cinematic`: public reveal/crop transition;
- `--ease-standard`;
- `--ease-emphasized`.

Rules:

- motion explains state or adds food/brand tactility;
- no blocking intro animations;
- no necessary information hidden behind animation;
- full `prefers-reduced-motion` equivalence.

## 11. FoodStage visual contract

`FoodStage` is a brand surface, not merely a technical canvas.

It should use:

- C-direction modular clarity;
- A-direction food warmth;
- controlled cream/charcoal contrast;
- ingredient layers with predictable spatial hierarchy;
- subtle copper structure/rules only where they aid assembly.

It must never independently decide product validity or price (`D065`).

## 12. Photography treatment

### Hero / signature

- warm directional light;
- texture and steam/heat where real;
- close crops;
- dark or warm neutral environments;
- natural appetite cues, not plastic hyper-saturation.

### Product / builder

- repeatable camera angle;
- repeatable light;
- neutral enough to combine visually;
- ingredient cutouts/layers prepared consistently.

### Venue

- real Mcello location only;
- preserve atmosphere rather than making it look like a generic luxury restaurant.

### AI/concept

Must remain labeled concept/placeholder and never be public documentary Mcello reality (`D068`).

## 13. Accessibility constraints

- primary and secondary text roles must continue to meet appropriate contrast on their surfaces;
- focus ring must be visually unmistakable in both dark and warm-light sections;
- selected state may not rely only on copper/olive color;
- content hierarchy must remain meaningful without display font loading;
- touch targets remain typically 44–48 px or larger for primary mobile controls.

## 14. Gate B checklist

- [x] semantic color roles defined;
- [x] compatibility migration strategy defined;
- [x] light/dark rhythm defined;
- [x] typography roles and licensing boundary defined;
- [x] shape language defined;
- [x] image-ratio families defined;
- [x] motion roles defined;
- [x] FoodStage brand contract defined;
- [x] photography treatment defined;
- [ ] final raw color calibration visually accepted;
- [ ] final display/interface typeface pairing accepted;
- [ ] final Mcello logo/original variants provided and accepted;
- [ ] Owner Visual Gate B accepted.

The unchecked items intentionally remain owner/input dependent and must not be marked complete by a coding agent alone.
