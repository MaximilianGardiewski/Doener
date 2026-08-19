# Mcello — Configurator Experience V5

Stand: 2026-08-19

Status: **implementierte Presentation-/Interaction-Änderung am bestehenden Konfigurator.** Dieses Dokument ergänzt `BUILDER_CORE_V2.md`, `BUILDER_RESPONSIVE_V3.md`, `DONER_YUFKA_BUILDER_V2.md`, `PIZZA_BUILDER_V2.md` und `GSAP_MOTION_V3.md`. Es hebt keine bindende Decision auf und markiert D065–D071 nicht als vollständig abgenommen.

## 1. Warum dieser Slice

Der Konfigurator war strukturell vorhanden, aber im gerenderten UI mit vier konkreten Defiziten:

1. **D066 war nicht implementiert.** Es gab keinen `Genau so`/`Anpassen`-Einstieg. Jede Bestellung startete in der vollständigen Modifier-Liste.
2. **Die FoodStage rendert ihre eigene Fläche nicht.** `doner-yufka-builder-v2.css` referenzierte `--mcello-ember`, ein Token, das nirgends definiert ist. Damit war die gesamte `background`-Deklaration computed-value-ungültig, und die warme editoriale Bühne wurde nie dargestellt — sichtbar war stattdessen die dunkle Modal-Fläche mit dekorativen Ringen.
3. **Im Touch-Querformat waren die Modifier-Optionen faktisch unsichtbar.** Bei 844×390 belegten Titel, Kontextzeile und geführte Navigation die gesamte Höhe; der aktuelle Schritt lag unterhalb des Sticky-Action-Bars.
4. **Die Presentation-Adapter waren an deutsche Klartextnamen gekoppelt.** Sowohl der Döner/Yufka- als auch der Pizza-Adapter aktivierten sich über exakte Gruppen-/Options-Namensmengen bzw. über den sichtbaren Label-Text der Kategorie-Rail.

## 2. Presentation-Adapter-Kontrakt

Die Anwendung veröffentlicht ihre **eigene** Struktur maschinenlesbar auf dem realen Modifier-Markup. Presentation-Adapter lesen ausschließlich diesen Kontrakt.

Auf `#productModal`:

- `data-product-id`
- `data-category-slug`
- `data-default-option-count`
- `data-configuration-valid`

Auf `.modifier-group`:

- `data-group-id`, `data-group-name`
- `data-required`, `data-min-selections`, `data-max-selections`

Auf `.modifier-option`:

- `data-option-id`, `data-option-name`
- `data-price-delta-cents`, `data-paid`
- `data-default-selected`, `data-sold-out`

Die Werte werden in `renderModifiers()`/`openProduct()` aus dem bereits autoritativen Produktmodell abgeleitet. Es entsteht kein zweiter Zustand.

```text
Produkt-/Modifier-Modell (autoritativ)
        │
        ▼
app.js  ──►  data-* Presentation-Kontrakt am realen DOM
        │
        ├──►  builder-core-v2.js      (Shell, Schritte, Rezepteinstieg, Textzusammenfassung)
        ├──►  doner-yufka-builder-v2.js (Assembly-Stage)
        └──►  pizza-builder-v2.js      (Top-down-Stage)
```

Bewusst **nicht** erlaubt und durch `tests/mcello-configurator-experience-v5.test.mjs` abgesichert:

- kein `product.name === "…"`-Branch in einem Adapter;
- kein `basePriceCents`/`priceDeltaCents`/`configuredPrice`/`configurationValid` in `builder-core-v2.js`;
- kein `fetch`/`localStorage`/`sessionStorage` in der visuellen Shell;
- kein Schreiben von `.checked`/`.value` durch die Presentation-Schicht.

### Stage-Metapher-Auflösung

Der Pizza-Adapter deklariert die Kategorien, die er top-down darstellt, und liest den Slug aus `data-category-slug` statt aus dem sichtbaren Rail-Label. Der Assembly-Adapter löst Modifier-Gruppen über normalisierte Namen in Build-Rollen (`basis`, `fresh`, `sauce`) und Optionen über normalisierte Zutaten-Tokens in Layer auf; Kategorien mit fremder Metapher werden übersprungen. Ein Produkt ohne auflösbare Assembly-Struktur erhält keine Assembly-Stage.

## 3. D066 — Mcello Original

Öffnet ein Produkt mit einer realen Standardauswahl, zeigt der Builder oberhalb der Schritte:

- den tatsächlich vorbelegten Rezepttext, aus `data-default-selected` gelesen;
- `Genau so · <Preis>`, wobei der Preis aus dem Label der autoritativen Add-Aktion übernommen wird;
- `Anpassen`, das ausschließlich in den ersten Schritt scrollt und fokussiert.

`Genau so` löst `#addToCart.click()` aus, also exakt den bestehenden autoritativen Pfad inklusive Validierung, Preis und Cart-Persistenz. Die Presentation-Schicht berechnet nichts nach.

Sobald die Konfiguration abweicht (`data-builder-entry="custom"`), verschwindet die Rezept-Aktionszeile vollständig. Damit kann eine mit `Genau so` beschriftete Aktion nie eine bereits angepasste Konfiguration hinzufügen. Ist die Konfiguration ungültig, ist die Aktion deaktiviert und beschriftet sich als `Pflichtauswahl fehlt`.

Produkte ohne Standardauswahl erhalten `data-builder-recipe="none"` und keine Rezept-Aktion.

## 4. Zustandsdarstellung

- Schritt-Kopf: ein Chip `Schritt n`, der Gruppenname und ein Anforderungslabel (`Pflicht · mind. n` bzw. `Optional · max. n`). Die frühere dekorative Ziffer entfällt.
- `inkl.` ist typografisch zurückgenommen; ein echter Aufpreis erscheint als Akzent-Chip.
- Eine abgewählte Standardzutat bleibt sichtbar, erhält gestrichelte Kontur und ein `Ohne`-Chip; die Preisnotiz wird ausgeblendet, damit `inkl.` und `Ohne` nicht gleichzeitig behauptet werden.
- Ausverkaufte Optionen bleiben sichtbar und deaktiviert und tragen zusätzlich den Klartext `Heute nicht verfügbar` — Zustand also nie nur über Farbe oder Deckkraft.
- `Dein Mcello` fasst die Konfiguration live als `Mit` / `Ohne` / `Extras` zusammen (`aria-live="polite"`). Das ist zugleich die Textalternative zur FoodStage.

## 5. Warenkorb

`selectionLabels()` erzeugt eine Zeile je Modifier-Gruppe in Katalog-Optionsreihenfolge plus eine `Ohne:`-Zeile für abgewählte Standardzutaten. Die Cart-Revalidierung verwendet dieselbe Funktion, sodass es keine zweite Formatwahrheit gibt.

Real beobachtet:

```text
1× Drehspieß im Fladenbrot
Basis: Falafel
Gemüse: Salat, Gurke, Zwiebel
Soße: Knoblauch, Scharf
Ohne: Fleisch, Tomate
8,50 €
```

## 6. FoodStage

- Die ungültige Hintergrund-Deklaration ist behoben; die warme editoriale Fläche rendert.
- Die konzentrischen Ringe sind durch einen weichen Tellerschein ersetzt.
- Die Fladenbrot-Illustration ist neu gezeichnet: Rückwand, geclipptes Füllvolumen und vorderes Halbmond-Fladenbrot. Die Silhouette las zuvor als Tropfenform, die Zutaten waren am unteren Rand zusammengedrängt.
- Der Marker `data-builder-food-stage` wandert auf die tatsächlich sichtbare Bühne, wenn der Assembly-Adapter übernimmt. Vorher trug ein ausgeblendetes `<img>` den Marker.
- Layer bleiben eine Ableitung tatsächlich angehakter Inputs; `data-assembly-visual-layers` bzw. `data-pizza-visual-layers` bleiben unverändert als Kontrakt.

## 7. Motion

Es wurde **keine** zweite Motion-Runtime eingeführt. Die GSAP-V3-Adapter-Ownership (`motion/commerce.js`, `motion.js`) bleibt unangetastet.

Geändert wurde ausschließlich die CSS-Transition der FoodStage-Layer, die dieser Slice besitzt: Eintritt behält das setzende Overshoot-Easing (340 ms), Austritt ist kurz und entschieden (200 ms, `cubic-bezier(.4,0,1,1)`). Ein entfernter Belag soll verschwinden, nicht herausfedern.

Gemessen (Computed-Style-Sampling über `requestAnimationFrame`, Desktop 1280×900, Zutat entfernt):

| Modus | Beobachtung |
|---|---|
| Normal | GSAP übernimmt bei ~79 ms (`data-motion-ingredient-engine="gsap"`), Layer-Deckkraft 1 → 0 bis ~290 ms, Ownership sauber freigegeben bis ~529 ms, danach `transform: none` auf der Bühne |
| Reduced Motion | Deckkraft 1 → 0 innerhalb eines Frames (~63 ms), GSAP übernimmt zu keinem Zeitpunkt, Bühnentransform bleibt `none` |

Reduced Motion ist damit kein verlangsamtes Normalverhalten, sondern entfernte Dekoration bei erhaltenem Zustandsfeedback.

## 8. Responsive

Das bindende Querformat-Gate aus `BUILDER_RESPONSIVE_V3.md` bleibt unverändert bestehen. Geändert wurde nur die Platzverteilung **innerhalb** des Querformat-Workbench: Produktbeschreibung, Kicker, Rezeptzeile, Verfügbarkeitsbadge, Empfehlungen und Freitextfeld treten zurück, die Rezept-Aktion wird zur einzeiligen Zeile, die geführte Navigation bleibt sichtbar und bedienbar. Primäre Touch-Ziele bleiben bei 48 px; Platz wird über Typografie und Padding gewonnen, nie über kleinere Touch-Ziele.

Zusätzlich behoben, außerhalb des Builders, aber im selben Bestellfluss:

- `body` reserviert Platz für den fixierten Order-Bar inklusive `safe-area-inset-bottom`. Zuvor überdeckte der Bar die letzten Produktzeilen und fing deren Taps ab.
- `.recommendation-card` und `.price-row` liefen bei 360 px über ihren Container hinaus, weil eine `1fr`-Spalte nicht unter ihre Min-Content-Breite schrumpfte.

## 9. Verifikation

### Technische Gates

| Kommando | Ergebnis |
|---|---|
| `npm run typecheck` | grün |
| `npm run test:domain` | 71 Tests, 0 Fehler |
| `npm run test:lebtig` | 45 Tests, 0 Fehler |
| `npm run test:schema` | 339 Tests, 0 Fehler (inkl. `tests/mcello-configurator-experience-v5.test.mjs`, 9 neu) |
| `npm run audit:db` | grün |
| `npm run check:static` | grün |
| `npm run check` | grün |
| `npm run build:preview` | grün |
| `npm run build:preview:cloudflare` | grün |

### Chromium-Gates

Gegen die reale Anwendung mit den Presentation-Fixtures aus `data/mcello/builder-presentation.v1.json` ausgeführt:

`mcello-builder-core-v2`, `mcello-presentation-builders`, `mcello-gsap-ingredient`, `mcello-gsap-product-open`, `mcello-gsap-reveal`, `mcello-gsap-category`, `mcello-gsap-hero-depth`, `mcello-gsap-adapter`, `showcase-motion`, `homepage-composition`, `public-navigation`, `public-copy-tone`, `brand-design-system` — alle grün.

`mcello-presentation-builder-lifecycle` benötigt den vollständigen lokalen Supabase-Stack (`.env.local`) und war in dieser Arbeitsumgebung nicht ausführbar.

### Angepasste Assertions

Zwei bestehende Assertions wurden angepasst, ohne ihre Garantie zu schwächen:

- `mcello-presentation-builders.browser.mjs` prüfte die alte Warenkorb-Zeilenform `Soße: Knoblauch` je Option. Neu geprüft wird `Soße: Curry, Knoblauch, Scharf` **plus** zusätzlich `Ohne: Fleisch` — also strikt mehr als vorher.
- `mcello-builder-core-v2.browser.mjs` wählte Modifier-Inputs und Touch-Ziele global. Im Touch-Querformat ist laut V3-Kontrakt genau ein Schritt sichtbar, sodass die Auswahl auf den sichtbaren Schritt eingegrenzt wurde, ergänzt um eine neue Assertion, dass ein erreichbarer Schritt überhaupt Optionen zeigt. Vor der Änderung schlug dieser Test in derselben Umgebung bereits auf unverändertem Code fehl; das wurde per `git stash` gegengeprüft.

### Visuelle Gates

Gemessen an der laufenden Anwendung über 360×800, 390×844, 430×932, 844×390, 768×1024, 1024×768, 1280×900, 1440×1000 und 1920×1080:

- kein horizontaler Dokument-Overflow und kein einzelnes Element über der Viewport-Kante;
- primäre Add-Aktion an jedem Viewport sichtbar, ≥ 48 px;
- Modifier-Ziele ≥ 45 px;
- FoodStage-Layer an jedem Viewport = 5 bei Standardrezept;
- 0 Page-/Console-Errors.

Durchgespielter Flow: Produkt öffnen → Standardrezept → Zutat entfernen (Layer verschwindet, `Ohne` erscheint in Chip und Zusammenfassung) → zwei Soßen hinzufügen → Basis auf Falafel wechseln (Protein-Layer tauscht) → in den Warenkorb → Warenkorb-Zusammenfassung gelesen; separat `Genau so` in einem Tap; separat Pizza mit Belag-Entfernung und anschließendem Metapher-Wechsel zurück auf Assembly; jeweils zusätzlich unter Reduced Motion und mit blockierten GSAP-Vendor-Dateien.

## 10. Bewusst nicht geändert

- Das Querformat-Gate für Touch-Geräte (bindend über `BUILDER_RESPONSIVE_V3.md`) bleibt bestehen, obwohl es dem Hochformat-Bestellfluss widerspricht. Eine Aufhebung wäre eine Produktentscheidung, keine Designentscheidung.
- Preis-, Modifier-, Verfügbarkeits-, Cart-, Slot-, Checkout- und Payment-Autorität.
- Die GSAP-V3-Ingredient-/Product-Open-/Cart-Timelines.
- Der Pizza-Belag-Fixture-Abgleich bleibt an den bestätigten Fixture-Optionsnamen; nur die Kategorieauflösung wurde entkoppelt.

## 11. Offene Owner-Inputs

Unverändert gegenüber `V1_EVIDENCE.md`. Für diesen Slice zusätzlich relevant:

- Die Döner/Yufka-Basis- und Gemüseoptionen bleiben Presentation-Annahmen aus `data/mcello/builder-presentation.v1.json` und sind keine bestätigte Produktionswahrheit.
- Es existiert in den Fixtures keine ausverkaufte Option und kein Aufpreis-Extra. Der `Heute nicht verfügbar`-Zustand und die Aufpreis-Darstellung sind implementiert und statisch abgesichert, aber noch nicht an echten Daten im Browser vorgeführt.
- Reale Mcello-Medien ersetzen die stilisierte Illustration erst nach Freigabe und geklärten Bildrechten (D068).
