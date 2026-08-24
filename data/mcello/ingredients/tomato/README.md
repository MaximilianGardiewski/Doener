# `ingredient.tomato.slice`

Dieses Verzeichnis enthält Mcellos erste atomare Konfigurator-Zutat: exakt eine Tomatenscheibe. Der transparente Master wird im Frontend für jede sichtbare Scheibe erneut instanziiert. Eine Extra-Auswahl erhöht ausschließlich die Instanzzahl; ein separates Extra-Tomate-Bild ist nicht zulässig.

## Dateien

- `source/ingredient.tomato.slice.firefly-seed-48271.png` — ausgewählte, unbearbeitete Adobe-Firefly-Generation (2048 × 2048, RGB PNG).
- `master/ingredient.tomato.slice.png` — einziger kanonischer Laufzeit-Master (1024 × 1024, RGBA PNG, transparenter quadratischer Canvas).
- `tomato.asset.json` — maschinenlesbare visuelle Metadaten, Dateiintegrität, Adobe-Provenienz und Delivery-Vertrag.
- `web/README.md` — dokumentierter WebP-Blocker; kein erfundenes Derivat.

Commerce-Wahrheit wie Preis, Verfügbarkeit und Modifier-Regeln gehört weiterhin ausschließlich in `@business-web/menu-engine`. Dieses Asset-Verzeichnis enthält keine Commerce-Daten.

## Adobe-Provenienz

- Board: [Mcello V1 — Ingredient — Tomato](https://firefly.adobe.com/boards/id/urn:aaid:sc:EU:a8c9ddc5-99ca-4ef4-87d3-2d1c52d43c91)
- Board-ID: `urn:aaid:sc:EU:a8c9ddc5-99ca-4ef4-87d3-2d1c52d43c91`
- Gewählte Generation: Seed `48271`, Request `d63a48be-8507-449e-bcde-ec19069eac8d`, Asset `urn:aaid:ps:US:bbef7197-fe28-425d-88bb-6e25e694e6bc`
- Finaler Master: Request `62dcde6f-f755-4c1c-b711-201329ebcc93`, Asset `urn:aaid:ps:US:a353e176-4211-4f07-bbbf-520cf7e21fdf`
- Lokale oder in Adobe auffindbare Mcello-Tomatenreferenz: keine gefunden; die Generation nutzte daher keine Referenz.

Gewählter Prompt:

> Exactly one fresh red tomato slice, isolated single round cross-section, photorealistic premium Mcello food photography style, isometric top-three-quarter camera angle, visible natural slice thickness and cut edge, juicy seed chambers, delicate tomato flesh texture and subtle moisture highlights, warm appetizing restaurant studio lighting, centered, entire slice in frame, plain neutral seamless studio background, no other objects.

Negative Prompt:

> multiple slices, two slices, stack, pile, whole tomato, tomato wedge, half tomato, cherry tomato, plate, bowl, bread, kebab, lettuce, onion, cucumber, cheese, garnish, leaves, stem, utensils, hands, packaging, text, logo, watermark, foreign objects, flat top-down view, illustration, cartoon, 3D render, CGI

Bearbeitung: Hintergrund entfernt, Motiv eng mit kleiner Margin extrahiert, auf einen transparenten quadratischen 1024er-Master normalisiert und nach erneuter Vorschau gezielt mit Highlights `-18`, Kontrast `+6` und Sättigung `-12` korrigiert.

## Integritäts- und Delivery-Regeln

Der Master bleibt eine generierte, vorläufige Visualisierung nach `D068`. Seine warme fotorealistische atomare Bildsprache folgt der eng begrenzten Entscheidung `D075`; er ist trotzdem keine dokumentarische Aufnahme eines realen Mcello-Produkts. Owner-Bestätigung und Rechtefreigabe für finale reale Medien stehen aus.

Der Dev-Server liefert den kanonischen Master direkt unter `/media/ingredients/ingredient.tomato.slice.png`. `scripts/build-preview.mjs` liest dasselbe Manifest und kopiert denselben Master beim Build nach `dist`; im getrackten `apps/mcello/public` liegt bewusst keine PNG-Dublette. Adobe-Endpunkte werden nie aus dem Browser aufgerufen.

Neue atomare Zutaten folgen demselben Verzeichnis-/Manifestvertrag. Ein neues Rendering-System ist dafür nicht erforderlich.
