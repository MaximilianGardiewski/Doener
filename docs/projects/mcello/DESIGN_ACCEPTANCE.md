# Mcello — Design Acceptance

Stand: 2026-08-18

Diese Acceptance ergänzt die technische V1-Acceptance. Ein grüner Domain-/DB-/Browser-Test beweist keine visuelle Qualität; ein schönes Mockup beweist keine funktionierende Runtime. Für Mcello müssen künftig beide Ebenen erfüllt sein.

## A. Brand / Art Direction

- [ ] Drei klar unterschiedliche Art Directions existieren; keine reinen Farbvarianten.
- [ ] Die gewählte Richtung ist eindeutig Mcello und weder generisches SaaS noch Lebtig-Kopie.
- [ ] Anthrazit, Kupfer/Gold, selektives Grün und warme helle Kontrastflächen haben definierte Rollen.
- [ ] Display- und Interface-Typografie sind festgelegt und web-/lizenzseitig einsetzbar.
- [ ] Photography Direction trennt Hero, Product, Ingredient, Venue und Human Shots.
- [ ] Konzept-/AI-Material ist sichtbar von echten Mcello-Assets getrennt.

## B. Homepage / Public Experience

- [ ] Mobile und Desktop besitzen einen starken, nicht-cardbasierten Hero.
- [ ] `Bestellen` ist im ersten View klar erreichbar.
- [ ] Signature Food, Venue, Aktuelles, Story und Location bilden eine dramaturgische Reihenfolge.
- [ ] Homepage verwendet keine erfundenen realen Business-Fakten.
- [ ] Motion unterstützt Orientierung/Marke und hat einen vollständigen Reduced-Motion-Pfad.
- [ ] Mobile Navigation bleibt schnell und eindeutig.

## C. Store / Commerce Mode

- [ ] Store-Header zeigt Shop-/Pickup-Kontext kompakt.
- [ ] Category Rail ist auf Mobile sticky und scanbar.
- [ ] Signature-Gerichte dürfen größer sein; Standardprodukte bleiben kompakt.
- [ ] Produktname, Preis, entscheidende Attribute und Add-/Configure-Aktion sind klar.
- [ ] Sold-out bleibt sichtbar, aber disabled.
- [ ] Cart-Zustand ist im Store eindeutig sichtbar.

## D. Interactive Food Builder

- [ ] Der Builder nutzt bestehende Produkt-/Modifier-/Ingredient-Daten und dupliziert keine Preisautorität.
- [ ] `FoodStage` reagiert sichtbar auf relevante Auswahlen.
- [ ] Tap funktioniert vollständig ohne Drag & Drop.
- [ ] Keyboard/Screenreader funktionieren ohne visuelle Layer als Pflichtinformation.
- [ ] Preis ist während der Konfiguration permanent erreichbar.
- [ ] Primäre Add-to-cart-Aktion bleibt auf Mobile permanent erreichbar.
- [ ] Entfernte Zutaten verschwinden auch aus der Visualisierung.
- [ ] Sold-out-/unzulässige Optionen sind sichtbar, aber nicht auswählbar.
- [ ] Standard-/Original-Gerichte können vorbefüllt geöffnet werden.
- [ ] Kein Builder zeigt nicht bestätigte Zutaten als reale Mcello-Wahrheit.

## E. Pizza Builder

- [ ] Top-View-Visualisierung besitzt deterministische/stabile Layer-Anordnung.
- [ ] Belag hinzufügen/entfernen ist unmittelbar sichtbar.
- [ ] Layer-Assets erfüllen Performance-Budget.
- [ ] Reduced Motion verändert keine funktionale Bedienbarkeit.
- [ ] Preis-/Modifier-Revalidation bleibt server-/domainautoritativ.

## F. Döner/Yufka Builder

- [ ] Basis/Herzstück/Frisch/Sauce/Extras sind logisch getrennt.
- [ ] Layer-Reihenfolge ist visuell verständlich.
- [ ] Mindestens ein Mcello-Original und eine angepasste Variante sind vollständig testbar.
- [ ] Unterschiedliche Produktformen verwenden nur zulässige Optionen aus dem Produktmodell.

## G. Cart / Pickup / Checkout

- [ ] Mobile Cart ist als Sheet/Page verständlich und nicht als überladener Desktop-Drawer.
- [ ] Konfigurationen werden menschenlesbar zusammengefasst.
- [ ] Summe und `Weiter` bleiben klar erreichbar.
- [ ] ASAP und spätere Pickup-Slots nutzen echte Capacity-/Cutoff-Regeln.
- [ ] Checkout fragt nur Vorname, Mobilnummer und optionalen Kommentar.
- [ ] WhatsApp-only Copy ist konsistent; keine SMS-Fallback-Copy.
- [ ] Development-OTP ist transparent als DEV-Hilfe gekennzeichnet.

## H. Status

- [ ] Bestellnummer und aktueller Status sind die wichtigsten visuellen Signale.
- [ ] Ziel-Uhrzeit + Countdown sind sichtbar, sobald fachlich verfügbar.
- [ ] Timeline ist reduziert und verständlich.
- [ ] Pre-accept Edit/Cancel ist sichtbar verfügbar; nach Acceptance gesperrt.
- [ ] Route/Call erscheinen erst mit bestätigten First-Party-Daten.

## I. KDS / Admin

- [ ] KDS ist auf Tablet touch-optimiert und schneller lesbar als die Public UI.
- [ ] Alarm, Accept/Reject, ETA, Delay, Ready und Completed bleiben operativ dominant.
- [ ] KDS-Motion ist minimal und nie show-orientiert.
- [ ] Admin/KDS teilen Mcello-Tokens, ohne Public-Layouts zu kopieren.
- [ ] Staff bekommt keine strukturellen Katalog-/Preis-/Media-Rechte.

## J. Responsive / Accessibility

- [ ] 320, 360, 390, 412 und 430 px Mobile sind ohne horizontales Overflow nutzbar.
- [ ] 768, 834 und 1024 px Tablet sind geprüft.
- [ ] 1280, 1440 und 1920 px Desktop sind geprüft.
- [ ] Primäre Touch-Ziele liegen typischerweise bei mindestens 44–48 px.
- [ ] Sichtbare Focus States sind vorhanden.
- [ ] Bedienung per Tastatur ist möglich.
- [ ] Semantik/Screenreader-Namen sind sinnvoll.
- [ ] Information wird nie ausschließlich über Farbe oder Animation vermittelt.
- [ ] `prefers-reduced-motion` ist ein echtes Gate.

## K. Performance

Ziel am 75. Perzentil:

- [ ] LCP ≤ 2,5 s
- [ ] INP ≤ 200 ms
- [ ] CLS ≤ 0,1
- [ ] Above-the-fold LCP-Medien werden nicht unnötig lazy geladen.
- [ ] Below-the-fold Medien verwenden Lazy Loading/geeignete responsive Sources.
- [ ] Builder-Layer besitzen ein dokumentiertes Asset-/Payload-Budget.

## L. Visual Evidence

Vor breitem Merge des Design-Rebaseline müssen echte Screenshots vorliegen für:

- [ ] Homepage Desktop
- [ ] Homepage Mobile
- [ ] Store Desktop
- [ ] Store Mobile
- [ ] Pizza Builder
- [ ] Döner/Yufka Builder
- [ ] Cart
- [ ] Checkout
- [ ] Status
- [ ] KDS Tablet
- [ ] Admin

## M. Owner Visual Gates

- [ ] Gate A — Art Directions / Moodboards
- [ ] Gate B — Brand System / Typography / Photography Direction
- [ ] Gate C — Homepage
- [ ] Gate D — Store
- [ ] Gate E — Builder
- [ ] Gate F — Cart / Checkout / Status
- [ ] Gate G — KDS / Admin
- [ ] Gate H — Final real-asset pass

## N. Integrity / Portability

- [ ] Reale Mcello-Fotos/Claims/Storys haben nachvollziehbare First-Party-/Rights-Quelle.
- [ ] Adobe/Figma/Canva/Lovable/Visual Truth sind keine Runtime-Pflicht.
- [ ] Relevante Tokens/Entscheidungen/Assets landen im Repo bzw. im vorgesehenen Media-System.
- [ ] Keine Production-Mutation ohne separate Freigabe.
- [ ] Keine neue laufende Provider-/SaaS-Kostenpflicht ohne explizite Freigabe.
