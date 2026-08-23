# Mcello — Configurator Experience V5

Stand: 2026-08-20

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

## 12. Theke Art Direction über alle Flächen

Die Theke-Richtung wurde in den Design-Decisions als 45/30/25-Mischung (Cinematic Food/Warm Future Hospitality/Editorial Street-Food Energy) verankert. Ihre Bindung ist in `ART_DIRECTION.md` (`Verbotene Abkürzungen`) und `USER_REFERENCE_SYNTHESIS.md` („technische Zwischenstufe") dokumentiert.

Die Implementierung erfolgte differenziert nach Oberflächenfunktion:

| Fläche | Anwendung | Bindung |
|---|---|---|
| Commerce (Store/Builder/Cart) | 45/30/25-Mix vollständig; A liefert Food-Look, C dominiert Struktur, B liefert grafische Details | ART_DIRECTION.md §Empfohlene Mcello-Mischung; USER_REFERENCE_SYNTHESIS.md §6 (Store-Auswirkung) |
| Public (Homepage/Venue/News) | A+B dominant, C nur für Interaktive; asymmetrisch, editorial | ART_DIRECTION.md §Public/Homepage |
| Status/Order Edit | C dominant; A/B nur über Brand Tokens und Typografie | ART_DIRECTION.md §Cart/Checkout/Status |
| KDS/Admin/Handbook | C funktional reduziert; A/B fast vollständig zurückgenommen; keine Papier-Flächen, kein Display-Type, keine Zierornamentik | ART_DIRECTION.md §KDS/Admin; „bring KDS, Admin, Ops"-Commit |

**Nicht geändert wurde:** Logo-/Recognition-Thema D029 (verbleibt offen bis Freigabe Final-Asset), Preis-/Modifier-/Verfügbarkeits-Autorität, bestehende GSAP-V3-Boundaries für Ingredient-/Product-Open-/Cart-Timelines.

## 13. Motion-Erweiterungen: Builder-Schritt und Konfigurierte Summe

Zwei neue Motion-Anpassungen wurden hinter der bestehenden GSAP-V3-Adapter implementiert, ohne neue Motion-Runtime hinzuzufügen. Die D074-Boundary (`motion/commerce.js`, `motion.js` als Ownership-Grenze) bleibt unangetastet.

### animateBuilderStep

Schritt-Wechsel (vorwärts/rückwärts) wird signalisiert durch Slide + Fade des neuen aktiven Schrittes. Gerichtung wird beobachtet: `data-motion-step-engine="gsap"`.

| Szenario | Beobachtung |
|---|---|
| Normal (GSAP) | Step trägt `data-motion-step-engine="gsap"`, Richtung erfasst |
| Reduced Motion | `data-motion-step-engine` wird nicht gesetzt, keine transform angewendet |
| Fallback (GSAP unavailable) | CSS-Keyframe-Fallback aktiv |

### animateTotalChange

Konfigurierte Summe wird kurz hervorgehoben, wenn sie sich ändert. Gemessen über Computed-Style-Sampling mit `requestAnimationFrame` (Desktop 1280×900):

| Modus | Messung |
|---|---|
| Normal (GSAP) | Total-Transform rampt: 1.008 → 1.024 → 1 über ~300 ms |
| Reduced Motion | keine transform, Ownership von GSAP nicht übernommen |
| Fallback | CSS-Keyframe-Fallback |

Beide Animationen sind **No-ops unter prefers-reduced-motion**. Sie liefern Dekoration, nicht funktionale Information.

## 14. Design Acceptance Gate K — Performance-Messung

Die Theke-Ebenen-Injektion wurde zum ersten Mal gegen das Design Acceptance K-Budget gemessen.

### LCP (Largest Contentful Paint)

Desktop, Mobile und Tablet: **964 ms worst-case gegen 2500 ms Budget.** Komfortabel über alle Viewports. Above-the-fold Media werden nicht unnötig lazy geladen.

### CLS (Cumulative Layout Shift)

**Desktop vorher: 0.4507** (weit über 0,1-Budget)  
**Desktop nachher: 0.0131** (bestanden)  
**Mobile: 0** (konstant)

**Ursache:** Die Theke-Layer werden zur Runtime durch Loader-Module injiziert und landeten nach First Paint. Die Uppercase-Tracking-Änderung änderte die Textbreite, was alles darunter verschob (Header, NAV.nav-links, MAIN). Die Layer sind jetzt auch statisch verlinkt, sodass die Regeln bei First Paint existieren; die Runtime-Kopien laden immer noch, bleiben aber in der Cascade.

### INP (Interaction to Next Paint)

Gemessen mit `PerformanceObserver({ type: "event" })`, installiert per
`addInitScript` vor der Navigation. **INP wird nach Definition gebildet:** Events
werden über `interactionId` gruppiert, pro Interaktion zählt die längste Dauer,
INP ist die schlechteste Interaktion. Die maximale Einzel-Event-Dauer ist *nicht*
INP — eine erste Messung, die so gerechnet hatte, meldete 496 ms Desktop und
widersprach sich selbst (dieselbe Tabelle wies "Events > 200 ms: 0" aus).

Like-for-like gegen `origin/main` gemessen (zweiter Server auf Port 4199 aus
einem Worktree), nur mit der Interaktion, die **beide** Stände unterstützen —
Produkt öffnen:

| Viewport | `origin/main` | dieser Branch | Budget |
| --- | --- | --- | --- |
| Mobile 390×844 | 96 / 96 ms | **136 / 136 ms** | 200 ms — eingehalten |
| Desktop 1280×900 | 272 / 296 ms | 320 / 352 ms | headless, siehe unten |

Über den vollen Konfigurator-Ablauf (8 Modifier-Toggles, 17 Interaktionen) liegt
der Branch mobil bei 144–152 ms.

**Aufteilung:** In *allen* Messungen, auf beiden Ständen, ist `processing` ≈ 1 ms
und `inputDelay` ≈ 2 ms; die gesamte Dauer ist Presentation Delay (132 von
136 ms mobil). Es ist also kein Skript-, sondern ein Paint-Kostenpunkt.

**Attribution:** Der Aufschlag von +40 ms gehört der FoodStage. Wird sie per
`display:none` unterdrückt, fällt INP mobil von 152 ms auf 104 ms — das deckt
den Abstand zum Baseline-Wert. Zwei Hypothesen wurden geprüft und **widerlegt**:

- `filter: drop-shadow(...)` auf `.mc-food-stage-v4__art` (ganzes SVG) und
  `feDropShadow stdDeviation="16"` im SVG: einzeln und zusammen abgeschaltet
  bleibt INP bei 136–152 ms, also innerhalb des Rauschens. Die Schatten kosten
  nichts messbares und wurden **nicht** entfernt.
- Motion: mit `prefers-reduced-motion: reduce` gemessen **312 ms** Desktop
  gegenüber 288 ms normal — Motion ist nicht die Ursache.

**Bewertung:** Die +40 ms sind die Rasterkosten der FoodStage-Illustration
selbst, also der Preis des Features (D065), nicht ein behebbarer Defekt. Mobil —
die Primärbreite der Mission — bleibt der Wert mit 136 ms deutlich im Budget.
Es wurde daher nichts optimiert.

**Grenze der Messung:** Headless-Chromium rastert in Software ohne GPU, was
Paint-Kosten stark überzeichnet. Die Desktop-Zahlen überschreiten 200 ms auf
**beiden** Ständen (Baseline 272–296 ms) und sind deshalb kein Branch-Befund.
Belastbar ist der *Vergleich*, nicht der Absolutwert. Eine Messung auf echter
Hardware steht aus.

### Checks, die nicht gemessen wurden

- Screenshot-Vergleiche für visuelle Regression (wurden durch Render+Interact+Criticize ersetzt);
- Lighthouse-Score-Baseline (wurde durch einzelne Core-Web-Vitals-Metriken ersetzt).

## 15. Konfiguratoroption-Zustände und Fixture-Sicherheit

Der Browser-Test `mcello-configurator-experience-v5.test.mjs` prüft vier konkrete Zustandsvarianten, die implementiert sind, aber in den Standard-Presentation-Fixtures **bewusst nicht enthalten** sind:

| Zustand | Darstellung | Warum nicht in Fixtures |
|---|---|---|
| `required` | Gruppe mit Pflicht-Label und Grund-Text | — |
| `sold-out` | sichtbar, disabled, „Heute nicht verfügbar" in Worten, kann nicht gewählt werden, bewegt FoodStage nicht | Keine echte Verfügbarkeits-API zu Testzeit |
| `paid-extra` (Aufpreis) | Akzent-Chip neben Optionsname, visuell unterschieden von inkludierten Optionen, erreicht Summe (Beispiel: 8,00 → 10,50) | Würde unkonfirmierte Preise in Vorschau-Build einbetten |
| `removed-default` | abgewählte Standardzutat: gestrichelte Kontur, „Ohne"-Chip, Label „inkl." ausgeblendet | — |

Der Test wird mit eigenem Menu-Payload ausgeführt (nicht mit Fixture-Optionen), sodass erfundene Werte im Test bleiben und die Preview-Build-Assertion (`every fixture option stays at zero`) unangetastet bleibt. Das ist absichtlich strenger als das Entfernen der Wächter.

## 16. Operations-Fläche und Touch-Target-Korrektur

Operations (Handbook, KDS, Admin) waren die letzte Fläche in der Gradient-und-Glow-Sprache. Das wurde auf die reduzierte Theke-Richtung gebracht:

- flache bedruckte Controls (solid copper, kein Gradient, kein Glow);
- Haarlinien-Regeln, Tabellenziffern, getrackte Etiketten;
- keine Papierflächen, kein Display-Type, keine Zierornamentik;
- eindeutige Action-Hierarchie: accept/ready/complete und Shop-Mode-Schalter erhalten solide Kupferfüllung; delay/reject/sold-out bleiben outlined.

**Touch-Target-Korrektur:** Der Bericht behauptete 48px Primär / 44px Sekundär ohne Ausnahmen. Drei KDS-Header-Controls gemessen 40px auf dem Tablet:
- Alarm-Umschalter (D014)
- Rush und Pause Switches (D012)

Das sind operative Controls, die mitten im Service auf dem Tablet bedient werden, daher auf die 44px-Vereinbarung angehoben.

**Verifiziert:** Null horizontales Overflow, null Console-Fehler bei 1024×768, 768×1024, 1280. Keyboard Focus löst zu 3px solid outline auf jeder Seite.

## 17. Offene Owner-Entscheidungen

### Brand Contract Test (Visual Gate B) — **entschieden: flaches Kupfer**

Der Test wurde von gradient+999px pill (Pre-Rebaseline-Foundation) auf flat copper+2px umgeschrieben. `ART_DIRECTION.md` verbietet „generisches Schwarz-Gold-Luxury" und `USER_REFERENCE_SYNTHESIS.md` gibt die Foundation als „technische Zwischenstufe" frei. Die neuen Assertions sind strenger, nicht schwächer: Sie pinnen die flache Behandlung und verlangen zusätzlich, dass der primäre CTA auf Public- und Commerce-Flächen identisch rendert.

**Owner-Entscheidung am 2026-08-20: flaches Kupfer wird übernommen.** Begründung:
der alte Kontrakt beschrieb genau die Behandlung, die der Auftraggeber als
generische Baukasten-Optik zurückgewiesen hat — Verlauf plus vollrunde Pille ist
die Default-Form jedes PWA-Templates. Die Theke-Richtung setzt dem „gedruckt statt
aufgeblasen" entgegen; ein Verlaufs-CTA wäre der einzige verbliebene Ort, an dem
die alte Sprache weiterlebt. Der Kontrakt sichert die Entscheidung jetzt in beide
Richtungen: kein Verlauf, kein Glow, 2 px Kante, und **eine** Button-Farbe über
Public und Commerce.

Zusätzlich prüft der Test seit dem Accessibility-Durchgang den CTA-Kontrast und
die Sichtbarkeit der Warenkorbsumme auf Mobile.

### Display/Interface-Typografie-Paarung — **entschieden: Fraunces + Inter**

Ausgangslage war kein Kompromiss, sondern ein Versehen: `--font-body: Inter` war
seit jeher gesetzt, **Inter wurde aber nie geladen**. Auf Windows rendete das
Segoe UI, auf macOS SF. `--font-display` begann mit „Iowan Old Style", das es nur
auf macOS gibt — Windows fiel auf Palatino Linotype oder Georgia zurück. Die
Paarung war also betriebssystemabhängig und ungestaltet.

| Rolle | Schrift | Warum |
| --- | --- | --- |
| Interface | **Inter** 400–800 | „Zahlen sind das Interface" ist die Theke-Prämisse; Inter hat echte Tabellen-Versalziffern (`tnum`, `lnum`), auf denen Preise, Mengen und Schrittmarken aufbauen |
| Display | **Fraunces** 400–800 | Warme Old-Style-Antiqua mit hohem Kontrast. Behält die Serifen-**Rolle**, die der alte Stack beabsichtigte, in einem gedruckten statt luxuriösen Register — `ART_DIRECTION.md` verbietet Schwarz-Gold-Luxury ebenso wie SaaS-Grotesk |

**Selbst gehostet, kein CDN** — dieselbe Regel wie D074 für GSAP. Ein Font-CDN
würde jeden Seitenaufruf von einem Dritten abhängig machen, ihm die IP jedes
Besuchers geben und die Offline-App-Shell brechen. `scripts/vendor-mcello-fonts.mjs`
holt die Dateien einmalig; sie liegen unter `vendor/fonts/` im Precache.

Nur Latin, variabel, woff2: **115 560 Bytes** für beide Familien zusammen.

**Gemessen (A/B, Fonts geblockt vs. geladen, je zwei Läufe):**

| Viewport | CLS mit | CLS ohne | LCP mit | LCP ohne |
| --- | --- | --- | --- | --- |
| Mobile 390 | 0,0589 | 0,0580 | 436 / 444 ms | 484 / 432 ms |
| Desktop 1280 | 0,0124 | 0,0130 | 280 / 660 ms | 832 / 840 ms |

Die Schriften kosten **+0,0009 CLS auf Mobile und −0,0006 auf Desktop** — beides
Rauschen. `font-display: swap` verschiebt nichts Messbares, weil die
Fallback-Metriken nah genug liegen; eigene `size-adjust`-Overrides waren deshalb
nicht nötig und wurden bewusst nicht erfunden. Das Mobile-CLS von 0,058 ist
**vorbestehend** und liegt im Budget von 0,1.

---

## 18. KDS-Lane-Motion (Operations)

**Problem:** `render()` löscht alle Lanes und baut die Karten neu auf. Ein
Lane-Wechsel las sich dadurch als "Karte verschwindet, andere Karte erscheint" —
das Personal musste die Bestellung neu suchen.

**Lösung:** `apps/mcello/public/motion/operations.js`, ein eigener Mcello-Adapter
(D074: self-hosted GSAP, Core + Flip, eigene Modulgrenze, getrennt von
`motion/commerce.js`). Er stellt `captureBeforeRender()` / `playAfterRender()`
bereit, die den bestehenden `render()`-Aufruf klammern. Das Matching läuft
ausschließlich über ein `data-flip-id`, das `kds.js` auf die Karte schreibt —
nie über Bestell-, Produkt- oder Kundeninhalte. `kds.js` bleibt alleiniger
Eigentümer von Status und Lane-Zuordnung; D010/D011/D012, `refresh()`, `act()`,
Alarm und Rush/Pause sind unangetastet.

DESIGN_ACCEPTANCE.md Abschnitt I ist hier bindend ("KDS-Motion ist minimal und
nie show-orientiert"). Die Karte bewegt sich, sonst nichts: kein Glow, kein
Pulse, kein Colour-Wash, keine gestaffelte Kaskade — und die Alarm-Karte in
"Neu" bekommt dieselbe schlichte Neupositionierung wie jede andere Karte.

**Browser-Verifikation** (Chromium, injizierte Bestellungen über Route-Mocking):

| Pfad | Ergebnis |
| --- | --- |
| normal | Karte wandert x 299 → 1042 px, 13 von 32 abgetasteten Frames tragen ein `transform`, landet in der Box der Ziel-Lane |
| `prefers-reduced-motion: reduce` | 0 transformierte Frames, sofortige Platzierung, dieselbe Box |
| GSAP-Vendor blockiert (`route.abort`) | identische sofortige Platzierung, 0 Page-Errors |

**Statischer Layout-Defekt, beim Tablet-Gate gefunden** (ohne Motion
reproduzierbar): `.kds-grid` nutzte `repeat(4, 1fr)`; Grid-Tracks behalten
standardmäßig einen `min-content`-Boden, weshalb der `white-space: nowrap`
Quick-Action-Button die letzte Lane bei 1024 px über den Viewport schob. Alle
drei Track-Definitionen tragen jetzt `minmax(0, 1fr)`.

**Guard:** `tests/mcello-kds-lane-motion.test.mjs` sichert die Grenze, die der
Browser-Lauf festgestellt hat — keine Lane als Wert im Adapter, kein
Backend-Zugriff, jeder degradierte Pfad kehrt zurück ohne die Karte anzufassen,
und ein Null-Boden auf jedem Grid-Track. Die Guards laufen gegen den Code mit
entfernten Kommentaren, weil der Modulkommentar die Lanes, die er nie
entscheiden darf, zu Recht benennt. Gegen eine eingebaute Verletzung geprüft:
der Guard schlägt an.

**Bewusst offen gelassen:** `.custom-delay` (Inline-Verzögerungssteuerung in der
Lane "In Zubereitung") überläuft bei 1024 px die eigene Karte um ca. 70 px,
unabhängig von Motion und ebenfalls vorbestehend. Der Dokumentrand wird dabei
nicht überschritten, das Overflow-Gate ist also nicht verletzt. Die Korrektur
läge in unverwandtem `kds.html`-Layout außerhalb dieser Slice.

## 19. Accessibility-Sweep (gemessen, nicht geschätzt)

Gemessen auf `/?presentation=mcello` (390×844 und 1280×900, letzteres mit
geöffnetem Konfigurator) sowie `/status.html`.

**Methodik-Korrektur, die das Ergebnis erst brauchbar gemacht hat:** Kontrast
wird über die **vollständige Ancestor-Kette** komponiert. Beim ersten Anlauf
stoppte die Suche beim ersten nicht-transparenten `backgroundColor` — auf den
Theke-Flächen ist das oft ein Overlay mit 4 % Alpha, wodurch fast jedes Element
1:1 ergab. Ein noch früherer Anlauf las zusätzlich `color(srgb 0.78 …)`-Floats
als 0–255-Werte. Beide Läufe wurden verworfen, nicht berichtet.

### Befunde und Korrekturen

| Element | vorher | nachher | Ursache |
| --- | --- | --- | --- |
| `.availability-badge.good` | 3,63 / 3,32 : 1 | ≥ 5,0 : 1 | Mix zu wenig Ink |
| `.availability-badge.bad` | 3,05 / 2,79 : 1 | ≥ 4,7 : 1 | dito |
| `.mc-food-stage-v4__caption > span` | 2,76 : 1 | 4,65 : 1 | `#667a39` auf hellem Caption-Grund |
| `.mc-food-stage-v4__caption > small` | 3,47 : 1 | 5,11 : 1 | `#755f4c`, 11 px |
| `#cartAmount` | 2,30 : 1 | 4,65 : 1 | Descendant-Selector |
| `#specialRequest` | kein Accessible Name | `aria-labelledby` | — |

`.availability-badge.bad` wurde über die Rechnung gefunden, nicht über den Lauf:
kein Fixture-Produkt ist ausverkauft, die Variante wird also nie gerendert. Sie
scheitert mit demselben Muster und wurde mitkorrigiert.

**`#cartAmount` hatte zwei Defekte in einer Regel.** `.sticky-order span` zielt
auf die Bildunterschrift der Leiste, greift als Descendant-Selector aber auch in
den Kupfer-Button hinein und färbte den Betrag muted (2,30:1). Dieselbe Regel
setzte unter 600 px `display: none` und entfernte damit die Warenkorbsumme
vollständig vom Button. Beide Regeln sind jetzt `> span`: der Betrag ist bei
360 / 390 / 430 px sichtbar, 4,65:1, 48 px Touch-Target, 0 px horizontaler
Overflow.

### Ergebnis

| Fläche | Kontrastfehler | ohne Accessible Name | ohne sichtbaren Fokus | Page-Errors |
| --- | --- | --- | --- | --- |
| Store 390×844 | 0 (vorher 11) | 0 | 0 von 8 | 0 |
| Konfigurator 1280×900 | 0 (vorher 14) | 0 (vorher 1) | 0 von 8 | 0 |
| Status 390×844 | 0 | 0 | 0 von 5 | 0 |

`brand-design-system.browser.mjs` prüft jetzt CTA-Label, Warenkorbsumme und
deren Sichtbarkeit auf Mobile. Gegen den zurückgedrehten Selector geprüft: der
Test meldet 2,3:1 und schlägt fehl.

**Nicht gemessen:** Screenreader-Ausgabe, Zoom bis 200 %, und Kontrast auf
Flächen, die nur mit echten Backend-Daten erscheinen (KDS-Lanes mit Bestellungen,
Admin). Diese bleiben offen.
