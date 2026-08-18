# Mcello — Design & Product Experience Masterplan

Stand: 2026-08-18

Status: **kanonische Arbeitsreihenfolge für den Mcello Design-Rebaseline-Slice**. Bei Widersprüchen bleiben `DECISIONS.md`, Security-/Domain-Invarianten und nachgewiesene Acceptance/Evidence autoritativ. Dieser Plan erweitert die visuelle und interaktive Produktqualität; er baut bestehende verifizierte Ordering-/KDS-/CMS-/Auth-/PWA-/Self-host-Slices nicht neu.

## 1. Zielbild

Mcello soll nicht wie eine Restaurant-Website mit aufgesetztem Online-Shop wirken, sondern wie ein eigenständiges digitales Gastro-Produkt:

- **Public Experience:** Atmosphäre, Marke, Menschen, Food, Ort und Community.
- **Commerce Experience:** schnell, klar, mobile-first, appetitanregend und app-artig.
- **Interactive Food Builder:** Konfiguration wird sichtbar erlebbar; das Essen selbst ist die Interaktion.
- **Operations:** KDS/Admin bleiben pragmatisch und schnell, erhalten aber dieselbe Mcello-DNA.
- **BusinessWebFactory:** Wiederverwendbare Logik fließt nur dann in `@business-web/*`, wenn sie wirklich generisch ist.

Interne Leitidee: **BUILD YOUR MCELLO / DEIN MCELLO**. Dies ist vorerst eine Design-/Produktidee und kein final veröffentlichter Claim, solange Mcello sie nicht freigibt.

## 2. Nicht verhandelbare Grenzen

1. `main` ist Source of Truth; Builder, Design-Tools und Coding-Agents sind Clients.
2. Keine Production-Mutation und kein Production-Deploy ohne separate ausdrückliche Freigabe.
3. Keine neue zwingende SaaS-/Runtime-Abhängigkeit.
4. Bestehende server-/DB-autoritative Preise, Verfügbarkeit, Capacity, Ordering- und KDS-Invarianten bleiben autoritativ.
5. V1 bleibt Pickup + pay-on-site + WhatsApp-only Messaging-Boundary.
6. Keine erfundenen realen Mcello-Gerichte, Team-/Story-Fakten oder Venue-Fotos als Production-Wahrheit.
7. Visuelle Food-Layer dürfen bis zu echten freigegebenen Assets bewusst stilisiert/abstrakt sein.
8. Accessibility, Reduced Motion und Performance sind Teil des Designs, keine spätere Reparaturrunde.

---

# Phase 0 — Baseline Freeze & Hygiene

## Ziel

Ein einziger belastbarer Ausgangspunkt, bevor visuelle Architektur verändert wird.

## Aufgaben

- offenen Präsentations-/Runtime-Hardening-Slice abschließen;
- `main` und CI als Baseline festhalten;
- keine alten Agent-Branches als aktuelle Wahrheit behandeln;
- aktuelle Decision-, Acceptance-, Evidence-, Architecture- und Roadmap-Dokumente lesen;
- Design-Rebaseline-Branch ausschließlich vom grünen `main` ableiten.

## Gate

- kanonischer Baseline-SHA dokumentiert;
- relevante CI-/Demo-Gates grün;
- keine offenen präsentationskritischen Review-Threads.

---

# Phase 1 — Knowledge Rebaseline & neue bindende Design-Entscheidungen

## Ziel

Alle neuen Produktideen aus Chat-/Design-Übergaben zurück ins Repo holen.

## Aufgaben

- Interactive Food Builder als bindende V1-Experience erfassen;
- Public Experience und Commerce Mode explizit trennen;
- Signature-/Original-Rezepte als vorbefüllte Builder-Ausgangspunkte festlegen;
- visuelle Owner-Gates und Screenshot-Evidence definieren;
- User Journeys und Design Acceptance dokumentieren.

## Deliverables

- `DESIGN_MASTERPLAN.md`
- `DESIGN_ACCEPTANCE.md`
- `USER_JOURNEYS.md`
- neue Decisions in `DECISIONS.md`
- aktualisierte `ROADMAP.md`

## Gate

Keine große UI-Implementierung, bevor diese Dokumente im PR reviewbar sind.

---

# Phase 2 — Art Direction: drei echte Richtungen

## Ziel

Nicht drei Farbvarianten desselben Layouts, sondern drei klar unterscheidbare Mcello-Systeme.

## Direction A — Cinematic Urban Bistro

- dunkle, atmosphärische Bühne;
- echte Food-/Venue-Fotografie als Hauptmaterial;
- große Typografie;
- warme Licht-/Ofen-/Brotwelt;
- Kupfer/Gold als hochwertige Akzente.

## Direction B — Editorial Street Luxury

- asymmetrische Magazine-Kompositionen;
- mutigere Typografie;
- plakative Crops und Linien;
- urbane Street-Food-Energie;
- weniger klassische Card-Layouts.

## Direction C — Warm Future Hospitality

- hochwertige Consumer-App-DNA;
- sehr klare Mobile UX;
- ruhige helle/dunkle Flächenwechsel;
- subtile räumliche Layer;
- Interaction Design im Vordergrund.

## Zielmischung

Arbeitsrichtung, solange kein Owner-Gate etwas anderes entscheidet:

- 55–60 % Cinematic Urban Bistro
- 25–30 % Warm Future Hospitality
- 10–15 % Editorial Street Luxury

## Tooling

- Adobe: Moodboard/Art Direction, Font-Exploration, später Lightroom/Photoshop/Firefly-Assetarbeit.
- Figma: High-Fidelity-Design, Tokens, Komponenten, Prototyping.
- GitHub: endgültige Tokens, Entscheidungen und Implementierung.

## Gate A

Drei visuell klar unterschiedliche Richtungen mit mindestens:

- Homepage Desktop
- Homepage Mobile
- Store Mobile
- Builder Mobile

---

# Phase 3 — Brand System & Photography Direction

## Ziel

Mcello bekommt eine eigene visuelle Grammatik statt generischem Dark-SaaS-UI.

## Farbrollen

Arbeitstitel für semantische Tokens:

- `mcello-ink`
- `mcello-charcoal`
- `mcello-coal`
- `mcello-copper`
- `mcello-gold`
- `mcello-olive`
- `mcello-cream`
- `mcello-bread`
- `mcello-ember`

Regeln:

- Anthrazit/Ink = Grundbühne, nicht endlose schwarze Cards.
- Gold/Kupfer = Premium-/Heat-Akzent, nicht jeder CTA.
- Grün = Recognition/Freshness/Status selektiv.
- Creme/Stone/Bread = Rhythmus, Wärme und bessere Lesbarkeit.

## Typografie

- charaktervolle Display-Schrift;
- extrem gut lesbare Interface-Schrift;
- Weblizenz/Self-host-Fähigkeit vor Implementierung prüfen;
- klare Hierarchie für Hero, Produktname, Preis, Status und Interface.

## Photography Direction

Getrennte Shot-Klassen:

1. Hero Food — nah, warm, textural, appetitanregend.
2. Store Product — reproduzierbarer Winkel und Crop.
3. Ingredients — Builder-taugliche einzelne Zutaten/Layer.
4. Venue — Innenraum, Terrasse, Theke, Ofen, Details.
5. Human — Owner/Team/Handwerk, nur mit bestätigter Freigabe.

## Gate B

Brand Board + Tokens + Type-Pairing + Photography Direction akzeptiert.

---

# Phase 4 — Design System & Component Taxonomy

## Ziel

Komponenten entstehen aus Journeys, nicht aus einer universellen `Card`.

## Foundations

- Farben
- Typografie
- Spacing
- Grid
- Breakpoints
- Radius
- Layer/Z-Ebenen
- Image Ratios
- Motion Curves
- Focus/State Tokens

## Komponentenfamilien

- `EditorialSection`
- `FullBleedMedia`
- `SignatureDish`
- `CompactDishRow`
- `CategoryRail`
- `StoryStrip`
- `FoodStage`
- `BuilderStepRail`
- `ConfiguratorOption`
- `StickyOrderBar`
- `CartSheet`
- `PickupSelector`
- `StatusTimeline`
- `LocationPanel`
- `KdsLane`
- `KdsOrderCard`

## Gate

Designsystem muss Mobile und Desktop abdecken, bevor mehrere Seiten gleichzeitig umgesetzt werden.

---

# Phase 5 — User Journeys & Interaction Architecture

## Primärer Order Flow

`Homepage → Bestellen → Store → Produkt/Original → Builder → Cart → Pickup → Kontakt → WhatsApp-Verifikation → Received → KDS Accept → Live Status → Ready → Completed`

## Zusätzliche Journeys

- Browse-only: Homepage → Menü → Story/Events/Galerie → Standort.
- Closed Shop: Store → Konfiguration → Cart persistieren → später Revalidation → Submit.
- Pre-accept Edit: Status → Edit/Cancel vor Annahme → nach Annahme gesperrt.
- KDS: Alarm → Accept/ETA → Preparing → Delay optional → Ready → Completed.
- Admin: Katalog/CMS/Availability/Shop-State ohne Staff-Privileg-Eskalation.

## Gate

Jede neue Screen-Familie muss einer dokumentierten Journey dienen.

---

# Phase 6 — Homepage V2: Experience Mode

## Ziel

Eine dramaturgische Markenreise statt Startseite aus Cards.

## Szenen

1. **Hero:** starke Food-/Venue-Bühne, ein primärer CTA `Bestellen`.
2. **Signature Food:** 2–3 große Mcello-Gerichte statt komplette Produktliste.
3. **Dein Mcello:** Teaser in den Builder.
4. **Venue:** Ort, Atmosphäre, Terrasse/Bistro.
5. **Aktuelles/Events:** CMS-backed.
6. **Story/Team:** bestätigte Inhalte, kurz und persönlich.
7. **Location/Contact:** konkrete First-Party-Daten erst nach Bestätigung.

## Motion

- native View Transitions/Scroll-driven CSS bevorzugen;
- hochwertige Reveals, Crops, Masken und leichte Tiefe;
- kein Preloader-/Cursor-/Gimmick-Zwang;
- `prefers-reduced-motion` vollwertig.

## Gate C

Homepage Desktop + Mobile als reale Screenshots reviewen.

---

# Phase 7 — Store V2: Commerce Mode

## Ziel

Beim Wechsel zu `Bestellen` wird die Oberfläche merklich schneller, dichter und funktionaler.

## Struktur

- kompakter Store-Header mit Pickup-/Shop-State;
- sticky horizontale `CategoryRail`;
- Signature/Highlights größer;
- normale Produkte kompakter und scanbar;
- Drinks/Sides nochmals dichter;
- Warenkorbzustand direkt sichtbar;
- sold-out sichtbar, eindeutig disabled.

## Gate D

Store Mobile zuerst, danach Desktop. Keine breite Implementierung ohne Mobile-Abnahme.

---

# Phase 8 — Builder Core: BUILD YOUR MCELLO

## Ziel

Konfiguration wird zur visuellen Produkterfahrung, ohne die bestehende Menu Engine oder serverautoritative Preislogik zu duplizieren.

## Architektur

- `FoodStage`: reine visuelle Darstellung des aktuellen Produktzustands.
- `BuilderStepRail`: Basis/Herzstück/Frisch/Sauce/Extras bzw. produktspezifische Schritte.
- `ConfiguratorOption`: Auswahl aus bestehenden Modifier-/Ingredient-Daten.
- `StickyOrderBar`: Live-Preis + Hauptaktion permanent erreichbar.
- Adapter übersetzt bestehende Produkt-/Modifier-Struktur in Visual-Layer-Metadaten; Preis und Zulässigkeit bleiben bestehende Domain-/Server-Autorität.

## Interaktion

- Tap ist immer primär.
- Drag & Drop nur optionales Progressive Enhancement.
- Jede relevante Auswahl erzeugt sofort sichtbares Feedback.
- Entfernen einer Auswahl entfernt auch die visuelle Layer-Darstellung.
- Tastatur-/Screenreader-Nutzung bleibt möglich; Visualisierung ist niemals alleinige Informationsquelle.

## Gate E

Builder Core mit mindestens einem vollständig funktionierenden Produkt und grünen Domain-/Browser-Gates.

---

# Phase 9 — Pizza Builder

## Ziel

Visuell stärkster Builder-Use-Case.

## Schritte

1. Basis/Größe
2. Sauce/Käse
3. Belag
4. Extras

## Visualisierung

- Top-View Pizza;
- einzelne Toppings als performante SVG/WebP/AVIF-/Canvas-Layer je nach finalem Asset-Stil;
- Verteilung deterministisch genug für stabile Screenshots/Tests;
- keine Pflicht zu fotorealistischer AI-Food-Fälschung.

## Gate

Pizza Builder Mobile + Desktop, Preis-/Modifier-Revalidation und Reduced-Motion-Evidence.

---

# Phase 10 — Döner/Yufka Builder

## Ziel

Layer-Aufbau, der sich wie eine digitale Theke anfühlt.

## Schritte

- Form/Basis
- Herzstück
- Frisch
- Sauce
- Extras

Nur Optionen darstellen, die aus bestätigten/zulässigen Produktdaten kommen.

## Visualisierung

Brot/Yufka + Füllungs-/Fresh-/Sauce-/Extra-Layer; stilisiert bis echte freigegebene Assets vorhanden sind.

## Gate

Mindestens ein Döner-/Yufka-Original und ein angepasster Flow vollständig bewiesen.

---

# Phase 11 — Mcello Originals / Signature Defaults

## Ziel

Kunden starten nicht zwingend auf einer leeren Leinwand.

## UX

Ein bestehendes Gericht kann öffnen als:

- `Genau so`
- `Anpassen`

`Anpassen` öffnet den Builder mit dem Standardrezept bereits ausgewählt. Änderungen bleiben transparent sichtbar.

## Gate

Keine Default-Auswahl darf vom echten Produktmodell abweichen oder nicht bestätigte Zutaten erfinden.

---

# Phase 12 — Cart, Pickup, Checkout & Status Polish

## Cart

Mobile als Sheet/Page statt überladener Desktop-Drawer. Konfiguration verständlich zusammenfassen; Summe und `Weiter` sticky.

## Pickup

- ASAP + reale ETA/Slot-Verfügbarkeit;
- spätere Abholslots;
- bestehende Capacity-/Cutoff-Logik bleibt autoritativ.

## Checkout

Nur bestehende V1-Daten:

- Vorname
- Mobilnummer
- optionaler Kommentar

## Verification

WhatsApp-only. Development zeigt den lokalen DEV-Code transparent; keine SMS-Copy.

## Status

- Bestellnummer als Hauptsignal;
- bindender Status;
- Ziel-Uhrzeit + Countdown;
- reduzierte Timeline;
- Route/Call erst mit bestätigten Daten.

## Gate F

Kompletter Browserflow Kunde → WhatsApp DEV-Key → Bestellung → KDS → Status weiterhin grün.

---

# Phase 13 — KDS & Admin Visual Reconciliation

## KDS

Kein Neubau der Operationslogik. Priorität:

1. Geschwindigkeit
2. Lesbarkeit
3. Touch
4. Alarm/Status
5. Marken-Kohärenz

Lanes bleiben operativ klar: Neu / Geplant / In Zubereitung / Bereit.

## Admin

Bestehende Control Plane beibehalten, aber visuell vereinheitlichen: Katalog, Modifier, Verfügbarkeit, CMS, News, Galerie, Öffnungszeiten/Shop-State.

## Gate

KDS auf Tablet und Admin auf Desktop/Mobile ohne Regression der Rollen-/RLS-Grenzen.

---

# Phase 14 — Real Assets & Owner Inputs

## Menü

Produktweise bestätigen:

- Name
- Preis
- Standardzutaten
- Saucen
- Extras
- Allergene
- Dietary Labels
- Bestellbarkeit

## Brand

Finales Logo als Originaldatei/vektorisierte freigegebene Varianten.

## Photography

Geplanter Shot-Pool:

- 5–8 Hero/Signature
- 15–20 Produktbilder
- Builder-taugliche Ingredient-Shots/Layers
- ca. 10 Venue-Aufnahmen
- Team/Owner nur mit Einwilligung

## Adobe Asset Pipeline

`Original → Lightroom Look → Photoshop Cleanup → Crop/Format → rights-aware Mcello Media/CMS`

Keine freigegebenen Medien außerhalb der vorgesehenen Media-/Rights-Grenze als Production-Wahrheit einsetzen.

---

# Phase 15 — Responsive, Accessibility, Performance & Visual QA

## Responsive Zielklassen

Mobile: 320 / 360 / 390 / 412 / 430

Tablet: 768 / 834 / 1024

Desktop: 1280 / 1440 / 1920

## Accessibility

- WCAG 2.2 AA als Ziel;
- komfortable Touch Targets, typischerweise 44–48 px;
- sichtbare Focus States;
- Keyboard;
- Screenreader-Namen;
- Semantik;
- Reduced Motion;
- Information nie ausschließlich über Farbe oder visuelle Food-Layer.

## Performance

Ziele am 75. Perzentil:

- LCP ≤ 2,5 s
- INP ≤ 200 ms
- CLS ≤ 0,1

Hero-/Signature-Medien priorisieren, below-the-fold lazy, feste Seitenverhältnisse, responsive Sources. Builder-Layer dürfen nicht unkontrolliert große Asset-Payloads erzeugen.

## Visual Regression

Pflicht-Screenshotset:

- Homepage Desktop/Mobile
- Store Desktop/Mobile
- Pizza Builder
- Döner/Yufka Builder
- Cart
- Checkout
- Status
- KDS Tablet
- Admin

---

# Phase 16 — Owner Visual Gates

- **Gate A:** Art Directions / Moodboards
- **Gate B:** Brand System / Typography / Photography Direction
- **Gate C:** Homepage Desktop + Mobile
- **Gate D:** Store Mobile + Desktop
- **Gate E:** Builder Core + Pizza + Döner/Yufka
- **Gate F:** Cart / Checkout / Status
- **Gate G:** KDS / Admin
- **Gate H:** Final real-asset pass

Ein technischer Test ersetzt kein visuelles Gate; ein visuelles Gate ersetzt keine Runtime-/DB-/Security-Evidence.

---

# Phase 17 — Production Hardening & Go-live

Vor echtem Production-Go-live:

- owner-bestätigte Menü-/Preis-/Ingredient-Daten;
- bestätigte Öffnungszeiten/Sonderzeiten/Cutoff/Kapazität;
- Adresse/Telefon/WhatsApp bestätigt;
- finales Logo + Media-Rechte;
- Production-WhatsApp-Transport nur nach expliziter Kostenfreigabe;
- finaler Auth/RLS/Storage-Audit;
- Secrets-/Environment-Audit;
- leerer DB-Rebuild;
- Self-host Migration-Dry-Run + Backup/Restore;
- Browser/PWA/Mobile-Smokes;
- SEO/Metadata/Content-Integrity;
- Rollback-Check;
- **separate Production-Freigabe**.

---

# Phase 18 — Future Platform Backflow

Nicht V1-blockierend, aber vorbereitet:

- Online Payment
- Delivery
- Counter/Table Source
- Loyalty/Favorites/Reorder
- datenbasierte Empfehlungen
- Analytics UI

Nur generische Verträge wandern in Shared Packages. Mcello-spezifische visuelle Food-Art bleibt in `apps/mcello`.

---

# Branch-/PR-Reihenfolge

Empfohlene Slices nach diesem Rebaseline-PR:

1. `agent/mcello-brand-system`
2. `agent/mcello-homepage-v2`
3. `agent/mcello-store-v2`
4. `agent/mcello-builder-core`
5. `agent/mcello-pizza-builder`
6. `agent/mcello-doner-builder`
7. `agent/mcello-cart-status-v2`
8. `agent/mcello-kds-admin-polish`
9. `agent/mcello-real-assets`
10. `agent/mcello-visual-release-gates`

Jeder Slice folgt:

`Branch → Implementierung → Tests → echte Screenshots/Evidence → PR → Review → CI → Merge`

# Definition of Done

Mcello ist für diesen Design-Rebaseline abgeschlossen, wenn:

1. die Marke innerhalb weniger Sekunden eigenständig erkennbar ist;
2. Public Experience Atmosphäre erzeugt, ohne Kernaktionen zu verstecken;
3. Store und Builder auf Mobile schneller und klarer werden, je näher der Nutzer dem Submit kommt;
4. Konfiguration sichtbar Spaß macht, aber ohne Lernpflicht funktioniert;
5. KDS/Admin operativ schneller statt dekorativer werden;
6. Accessibility, Reduced Motion und Performance nachgewiesen sind;
7. reale Mcello-Fakten/Assets sauber von Placeholder-/Konzeptmaterial getrennt bleiben;
8. keine neue Pflichtsubscription oder Vendor-Runtime eingeführt wurde;
9. alle relevanten Änderungen in Git, Tests und Evidence nachvollziehbar sind.
