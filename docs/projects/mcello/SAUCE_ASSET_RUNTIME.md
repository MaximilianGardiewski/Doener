# Mcello SauceDeck runtime assets

Status: presentation-runtime approved on `feat/mcello-notebook-design-slice-v1`.

## Governed local assets

The first three Adobe-authored SauceDeck masters are now stored with the Mcello application and no longer depend on Adobe/Firefly URLs at runtime:

- Curry: `apps/mcello/public/assets/ingredients/sauces/sauce-curry-master.png`
- Knoblauch: `apps/mcello/public/assets/ingredients/sauces/sauce-garlic-master.png`
- Scharf: `apps/mcello/public/assets/ingredients/sauces/sauce-spicy-master.png`

All three are transparent PNG cutouts, generated and edited through Adobe, visually QA'd, and recorded with generation/background-removal/crop provenance in `data/mcello/asset-manifest.json`.

## Renderer contract

The assets share the existing `sauce.primary` slot through compositor `sauce-deck-v1`. The renderer keeps the established deterministic 1/2/3-sauce placement behavior: one sauce occupies the deck, two sauces redistribute into two lightly overlapping regions, and three sauces redistribute into three compact regions. Removing a sauce deterministically reflows the remaining layers.

The local PNG files are embedded into the existing SVG FoodStage using SVG `<image>` elements. Adobe URLs remain provenance only and are never fetched by the browser. The service-worker shell caches all three local assets for the presentation experience.

## Authority boundary

This promotion is deliberately scoped to the presentation-only local Mcello runtime. It does **not** establish production commerce truth. The real production modifier-option IDs for Curry, Knoblauch and Scharf still require owner-confirmed catalog mapping before the generated assets can be described as production-domain mappings.

The presentation renderer mirrors selected modifier state. Pricing, availability, validation, cart and checkout remain authoritative in the menu/domain path.

## Adobe provenance

The masters were generated individually rather than as a combined three-sauce image and were added to Firefly Board `urn:aaid:sc:EU:bea31d70-9090-4de1-9b2e-e4feeeec4ef7`.

- Curry: generation `9915e5b1-0aa9-4847-b75c-b48108aee2df`, background removal `46a0f444-490e-4d21-92ae-cbfdc0fbe3c7`, crop `988266c1-905a-4553-b55a-0f149ce9d976`
- Knoblauch: generation `1407536f-3a01-4c8e-bac3-5dc99d57dfe1`, background removal `d9f9f47d-f4bb-4e18-affb-051c4307d411`, crop `829aee14-a758-41b2-b03b-add03c188506`
- Scharf: generation `1ae0caff-34e3-4c92-8cf1-f818c84881db`, background removal `1597c1bb-edc5-45a9-a416-5e87d6b4ee8a`, crop `b41c6915-48bc-46f5-bf69-2ec45582ee98`

## Validation gates

Static contract coverage verifies that each SauceDeck asset is a real local file, is present in the runtime manifest, is cached by the service worker, and that the runtime renderer contains no Adobe/Photoshop short URL dependency. Browser coverage additionally verifies the three local raster references while retaining deterministic SauceDeck state mirroring and reduced-motion behavior.
