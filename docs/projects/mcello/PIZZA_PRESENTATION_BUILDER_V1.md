# Mcello Pizza Presentation Builder V1

Status: **PRESENTATION-READY ON LOCAL DEMO DATA**

## Target

The first presentation-ready Pizza experience uses the provisional first-party `Pizza Mcello` (`pizza-076`) plus the localhost-only presentation modifier fixture.

## Interaction

The Builder reads the normal Mcello modifier inputs rendered by `app.js`. The five presentation ingredients are:

- Kebab Fleisch
- Tomaten
- Broccoli
- Käse
- Zwiebeln

All five reflect the existing provisional Pizza Mcello menu-card transcription and start as the standard presentation recipe. Tapping a normal checkbox updates the existing Mcello selection/domain path first; the Pizza adapter merely rereads checked inputs and redraws the FoodStage.

The visual layer count therefore comes from real rendered selections and is not a second selection store.

## FoodStage

The presentation FoodStage is a deliberately **schematic**, generated-in-browser top-down illustration. It is not a photograph and does not claim to be documentary Mcello food media. No Adobe/Firefly short URL or remote concept asset is shipped at runtime.

Each checked ingredient controls one deterministic SVG layer. Remove an ingredient and its layer disappears; add it again and the layer returns. Reduced-motion users receive the state change without the short pulse animation.

## Pricing and validity

The adapter never calculates price or validity. Presentation ingredient price deltas are zero and the existing `configuredPrice`, `configurationValid`, cart payload and backend/database validation remain authoritative.

## Responsive inheritance

Desktop uses the full two-column Builder. Tablet and smartphone inherit Builder Responsive V3: portrait is gated; landscape becomes the touch-first guided Food-Workbench with the FoodStage continuously visible.