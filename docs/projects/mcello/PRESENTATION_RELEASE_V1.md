# Mcello Presentation Release V1

Status: **PRESENTATION RELEASE CANDIDATE — LOCAL / PRIVATE LAN ONLY**

Runtime checkpoint: `6bd33c504b09c5fd3ae43c6e02f8a9136d6d05d5` (merged PR #65, Presentation Mode V1).

This release candidate freezes the presentation story that follows Homepage V2, Store V2, Builder Responsive V3, the local presentation data contract, Pizza Presentation Builder V1, Döner/Yufka Presentation Builder V1, the Builder commerce lifecycle proof and Presentation Mode V1.

## What the presentation demonstrates

1. Open the Mcello customer surface.
2. Enter the Store and open **Pizza Mcello** (`pizza-076`).
3. The Pizza Builder starts from the five presentation recipe ingredients supported by the provisional menu-card transcription: `Kebap Fleisch`, `Tomaten`, `Broccoli`, `Käse`, `Zwiebeln`.
4. Remove and optionally re-add a topping, preferably `Zwiebeln`; the schematic top-down FoodStage updates from the real checked modifier state.
5. Add the configured Pizza through the normal Mcello cart path.
6. Open a supported Drehspieß/Döner/Yufka product (`warm-013` through `warm-018`).
7. Demonstrate the owner-confirmed sauces `Curry`, `Knoblauch`, `Scharf`; the schematic 3/4 FoodStage responds to the normal modifier inputs.
8. Add the configured product through the same cart path.
9. Complete the localhost WhatsApp DEV verification and submit the normal local Mcello order.
10. Show the order in KDS and move it through `Eingegangen -> In Zubereitung -> Abholbereit -> Abgeholt`.
11. Show that the customer status surface follows those server-authoritative transitions.

The automated lifecycle gate additionally proves that a removed Pizza topping is absent from the submitted/KDS modifier snapshot and that selected Döner/Yufka sauces survive the real cart/order path.

## Device matrix

### Desktop

The Builder is a full two-pane FoodStage/control experience without an orientation restriction.

### Tablet

The shop remains responsive in both orientations. The **Builder itself is landscape-only**. Portrait shows the deliberate rotate experience while the mounted modifier/domain state is preserved. Landscape uses the touch-first two-pane Food Workbench and guided modifier navigation.

### Smartphone

The shop remains responsive in portrait and landscape. The **Builder itself is landscape-only**. Portrait shows the rotate experience. After rotation the same selection remains active without reload or duplicated business state. Compact landscape keeps FoodStage, authoritative action bar and touch-safe controls reachable.

## Start the presentation

Desktop/local Windows presentation:

```powershell
npm run demo:mcello:win
```

Private-LAN presentation for desktop/tablet/smartphone:

```powershell
npm run demo:mcello:lan
```

The LAN presentation wrapper starts the proven private LAN runtime and then installs the localhost-only Pizza and Döner/Yufka presentation fixtures. On the customer device use the printed customer URL with:

```text
?presentation=mcello&reset=1
```

The presentation page consumes `reset=1`, clears only browser-local cart/session state, reloads once into the clean presentation URL and visibly labels the page as a local Mcello presentation.

After the presentation, stop the disposable local Supabase stack with:

```powershell
npx --yes supabase@latest stop
```

## Truth boundaries

- **No production deployment is part of this release.**
- Builder presentation fixtures are restricted to the disposable localhost Supabase stack and are not a production catalog.
- Presentation price deltas are zero. Existing Mcello domain/server price and validity logic remains authoritative; no surcharge is invented for the demo.
- Pizza presentation ingredients are limited to the five names already present in the provisional `Pizza Mcello` transcription.
- Döner/Yufka presentation sauces are limited to the three names confirmed by the owner: `Curry`, `Knoblauch`, `Scharf`.
- The production rule for single-vs-multiple sauce selection is **still unconfirmed**. The demo's 0..3 interaction policy must not be promoted silently into production.
- Pizza and Döner/Yufka FoodStages are deliberately schematic browser-generated presentation visuals. They are **not documentary Mcello product photography** and no Adobe/Firefly concept URL is shipped as real runtime product media.
- Actual owner-confirmed full recipes, real product photography and final production modifier policies remain follow-up content/data work, not blockers for this presentation candidate.

## Release gate

The presentation candidate is acceptable only while the following remain green on its functional runtime base and release PR:

- CI
- Self-host Release
- Supabase Integration
- Mcello Demo Diagnostics

The Demo Diagnostics path proves presentation mode, Pizza/Döner-Yufka Builder interactions, mobile rotation/state preservation, real cart submission, KDS modifier snapshots and the customer/KDS order lifecycle.
