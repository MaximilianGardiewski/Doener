# Mcello — Food Reference Synthesis

Stand: 2026-08-18

Quelle: vom Owner im Projektchat bereitgestellte Food-Referenzbilder am 2026-08-18.

Status: **kanonische visuelle Referenz für Food-Fotografie, Produktdarstellung und Builder-Assets.** Die Bilder werden als Gestaltungsreferenzen interpretiert; Zutaten, Preise, Produktnamen und reale Mcello-Rezepte dürfen daraus nicht als Business-Fakten abgeleitet werden.

## 1. Kernaussage

Die neuen Food-Referenzen bestätigen sehr deutlich:

- Essen muss visuell **größer, näher und körperlicher** werden;
- Textur, Saftigkeit, Röstaromen, Käse, Brot, Sauce und frische Komponenten sollen sichtbar sein;
- Food darf teilweise wie ein freigestelltes Objekt funktionieren;
- Pizza und Döner/Yufka brauchen unterschiedliche Bildlogik;
- das Produktbild soll nicht nur eine kleine Card füllen, sondern Komposition und Interaktion mitbestimmen.

## 2. Wiederkehrende Food-Photography-Muster

### A — Close und textural

Mehrere Referenzen arbeiten mit sehr nahen Ausschnitten. Sichtbar wichtig sind:

- Fleisch-/Rösttextur;
- Brotoberfläche;
- geschmolzener Käse;
- Sauce;
- frische Zutaten;
- knusprige Kanten;
- Dampf/Wärme, sofern echt fotografiert.

Übersetzung:

- Hero-/Signature-Food darf deutlich näher gecroppt werden als typische Lieferdienstfotos;
- Store-Bilder bleiben klarer und reproduzierbarer;
- Builder-Assets benötigen separate, kontrollierte Aufnahmen.

### B — Warmes Licht, dunkler oder neutraler Hintergrund

Die Referenzen nutzen überwiegend warme Lichtwirkung und dunkle/neutrale Hintergründe bzw. starke Kontraste.

Übersetzung:

- Hero/Signature: dunkler Charcoal-/Ink-Kontext mit warmer Lichtkante;
- Store: neutraler, weniger dramatischer Hintergrund für bessere Scanbarkeit;
- Builder: möglichst reproduzierbare neutrale Stage, damit Zutaten-Layer kombinierbar bleiben.

### C — Food füllt den Frame

Die Produkte stehen groß im Bild und werden nicht von viel dekorativem Umfeld verdrängt.

Übersetzung:

- SignatureDish-Bilder dürfen bewusst 70–90 % der visuellen Fläche dominieren;
- Hero-Food darf über Containergrenzen hinausragen;
- kleine Thumbnail-Ästhetik wird vermieden.

### D — Pizza: Top-down / leicht schräg von oben

Die Pizza-Referenzen bestätigen eine sehr klare Builder-Richtung:

- kreisförmiges Produkt eignet sich für Top-down;
- Belag ist sofort räumlich lesbar;
- Zutaten können als deterministische Layer ergänzt/entfernt werden;
- Rand, Käse, Sauce und einzelne Toppings können visuell getrennt werden.

Builder-Regel:

`Pizza FoodStage = Top-down bevorzugt.`

Für reale Builder-Assets später möglichst:

1. gleiche Kamerahöhe;
2. gleiche Brennweite;
3. gleiche Pizza-Position;
4. gleiche Beleuchtung;
5. kontrollierte Grundpizza;
6. einzelne Topping-Layer separat bzw. reproduzierbar fotografiert.

### E — Döner/Yufka/Sandwich: 3/4-Ansicht / seitlicher Aufbau

Die nicht-runden Referenzen funktionieren stärker über sichtbare Schichtung:

- Brot/Form;
- Füllung;
- Fleisch/Herzstück;
- frische Zutaten;
- Sauce;
- Extras.

Builder-Regel:

`Döner/Yufka FoodStage = 3/4- bzw. Layer-/Assembly-Ansicht bevorzugt.`

Eine reine Top-down-Darstellung würde den Aufbau zu flach machen.

### F — Box/Teller/Beilage: klare Komponenteninseln

Wo mehrere Bestandteile nebeneinander vorkommen, funktioniert die visuelle Trennung einzelner Komponenten besser als eine komplett vermischte Darstellung.

Übersetzung:

- Bowl/Box/Teller später als eigene Visual-Metapher behandeln;
- keine erzwungene Pizza- oder Döner-Layerlogik für jedes Gericht;
- einzelne Component Zones können im `FoodStage` getrennt reagieren.

## 3. Drei verbindliche Food-Asset-Klassen

### Klasse 1 — Hero / Signature

Zweck:
- Homepage;
- Signature Sections;
- Kampagne/Event/Special.

Eigenschaften:
- sehr appetitlich;
- starkes Close-up oder dramatische 3/4-Perspektive;
- warmer Kontrast;
- darf Cropping und Tiefenschärfe stärker nutzen;
- nicht zwingend builder-kompatibel.

### Klasse 2 — Store Product

Zweck:
- Speisekarte;
- Produktliste;
- Such-/Kategorieansicht.

Eigenschaften:
- reproduzierbarer Winkel;
- klare Form;
- ruhiger Hintergrund;
- gleichmäßige Crops;
- weniger dramatische Tiefenschärfe;
- Produkt muss auch in kleineren Karten sofort erkennbar bleiben.

### Klasse 3 — Builder / Ingredient

Zweck:
- `FoodStage`;
- Modifier-/Ingredient-Visualisierung;
- Originals/Customize.

Eigenschaften:
- technisch kontrolliert;
- reproduzierbares Licht/Kamera;
- standardisierte Position;
- einzelne Zutaten/Layer sauber isolierbar;
- möglichst wenige harte Schattenänderungen zwischen Layern;
- hohe visuelle Konsistenz ist wichtiger als maximale Cinematic-Drama-Wirkung.

## 4. Capture Direction für echte Mcello-Fotos

### Hero/Signature Shooting

Empfohlen:
- 50–85-mm-äquivalente Perspektive für Close/3/4;
- warme Seiten-/Gegenlichtkante;
- dunkle oder warme neutrale Untergründe;
- verschiedene Crops pro Signature-Gericht;
- echte Textur bewahren, nicht überretuschieren.

### Store Shooting

Empfohlen:
- feste Kameraposition;
- feste Hintergrundfläche;
- wiederholbare Lichtposition;
- pro Produkt identische Grundparameter;
- horizontale und vertikale Crop-Reserve.

### Pizza Builder Shooting

Empfohlen:
- Kamera exakt über dem Produkt;
- definierte Center-Position;
- definierter Durchmesser/Skalierungsstandard;
- Basis-/Käse-/Topping-Zustände in identischer Position;
- einzelne Toppings bei Bedarf zusätzlich als isolierte Asset-Aufnahmen.

### Döner/Yufka Builder Shooting

Empfohlen:
- fest definierte 3/4-Kamera;
- Form/Brot als stabile Basis;
- Füllungsschichten reproduzierbar sichtbar;
- Zutaten nicht so tief verstecken, dass ihr Hinzufügen/Entfernen visuell wirkungslos bleibt.

## 5. Retusche / Adobe Pipeline

Für reale Mcello-Aufnahmen:

`RAW/Original → Lightroom Grundlook → Photoshop Cleanup/Masking → Web Crop/Export → rights-aware Media/CMS`

Erlaubte Bearbeitung:
- Belichtung/Farbe;
- Weißabgleich;
- störende kleine Artefakte;
- Crop;
- Maskierung für Builder-Assets;
- leichte Konsistenzkorrektur zwischen Serien.

Nicht erwünscht:
- Produktbestandteile erfinden;
- Gerichte künstlich so verändern, dass sie nicht mehr real servierbar aussehen;
- AI-generierte Zutaten als angeblich reale Mcello-Zutaten verkaufen.

## 6. Builder Visual Rules aus den Referenzen

### Pizza

- Top-down;
- große zentrale Stage;
- Rand/Basis bleibt stabil;
- Toppings erscheinen sichtbar und räumlich verteilt;
- Layer-Platzierung deterministisch genug für Screenshot-Tests;
- kleine zufällige Variation nur, wenn Test-/State-Stabilität erhalten bleibt.

### Döner/Yufka

- seitlich/3/4;
- Schichten vertikal bzw. räumlich lesbar;
- Sauce darf als eigene Overlay-/Gloss-/Drizzle-Schicht erscheinen;
- frische Zutaten sollen farblich erkennbar bleiben;
- Brot/Form darf nicht bei jeder kleinen Modifier-Wahl neu springen.

### Extras

- bezahlte Extras benötigen nicht zwingend eine eigene riesige Animation;
- wenn visuell sinnvoll, müssen sie aber im FoodStage erkennbar werden;
- Preisänderung bleibt immer parallel sichtbar.

## 7. Store Visual Hierarchy

Aus den Referenzen ergibt sich folgende Produkt-Hierarchie:

### Signature

- großes Food-Objekt;
- großer Produktname;
- klarer Preis;
- kurze Beschreibung;
- `Genau so` / `Anpassen` bzw. direkte Hauptaktion.

### Standard Product

- deutlich kompakter;
- Bild bleibt wichtig, aber nicht hero-groß;
- Preis und Add/Configure schneller scanbar.

### Drinks / einfache Sides

- sehr kompakt;
- keine unnötig große Food-Inszenierung.

## 8. Was aus den Referenzbildern NICHT als Fakt übernommen wird

Nicht ableiten:

- Produktnamen;
- konkrete Zutatenlisten;
- Preise;
- Allergene;
- Portionsgrößen;
- Mcello-Standardrezepte;
- reale Verfügbarkeit;
- tatsächliche Foto-/Servierweise bei Mcello.

Diese Fakten kommen ausschließlich aus First-Party-/Owner-bestätigten Daten.

## 9. Design-Auswirkung

Die Referenzen verstärken folgende Entscheidungen:

- `D065`: FoodStage wird zentraler und größer;
- `D066`: Mcello Originals sind visuell klarer Ausgangspunkt;
- `D067`: Public darf emotionaler, Store/Builder präziser werden;
- `D068`: Referenz-/Konzeptmaterial bleibt klar getrennt von realen Mcello-Assets;
- `D069`: Pizza und Döner/Yufka brauchen eigene visuelle Acceptance-Screenshots.

## 10. Nächster Asset-Schritt

Sobald echte Mcello-Gerichte/Rezepte bestätigt sind, wird pro Produktklasse entschieden:

1. Signature Hero benötigt eigenes Shooting?
2. Store Product benötigt standardisierte Aufnahme?
3. Builder benötigt Layer-/Ingredient-Assets?
4. Ist das Produkt überhaupt builder-relevant?

Nicht jedes Produkt braucht alle drei Klassen.
