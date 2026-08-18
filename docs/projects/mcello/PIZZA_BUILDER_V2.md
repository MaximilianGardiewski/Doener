# Mcello — Pizza Builder V2

Stand: 2026-08-18

Status: **truth-gated product specialization over Builder Core V2**.

Pizza uses a top-down FoodStage because D065/D066 and the food references define Pizza as a flat, deterministic layer model. Adobe Firefly was used only as **CONCEPT ART ONLY** for that stage direction; no generated image is a real Mcello pizza or runtime asset.

The current first-party provisional menu contains the real `pizza` category, but its Pizza products currently have **no structured ingredient modifier groups**. Therefore this slice deliberately renders **zero ingredient visual layers**. It does not invent cheese, sauce, toppings, recipes, defaults or prices.

Activation is presentation-only: a product opened while the existing category rail has `data-category="pizza"` receives `data-product-builder="pizza"`. Builder Core, `app.js`, domain/server/database remain authoritative for selection, price, availability, cart and checkout.

When governed Pizza ingredient semantics are later added to first-party product data, a follow-up may mirror those structured modifiers into deterministic visual layers. Until then `data-pizza-visual-layers="0"` is the correct production truth.
