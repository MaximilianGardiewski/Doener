# Mcello — User Reference Synthesis

Stand: 2026-08-18

Quelle: vom Owner im Projektchat bereitgestellte visuelle Referenzbilder am 2026-08-18.

Status: **kanonische Interpretation der Referenzen**, nicht Kopierauftrag. Einzelne Fremddesigns, Marken, Fotos oder Layouts werden nicht 1:1 übernommen. Die Synthese beschreibt wiederkehrende Gestaltungsprinzipien, die in eine eigenständige Mcello-Sprache übersetzt werden.

## 1. Wichtigste Erkenntnis

Die Referenzen verschieben Mcello weg von einer zu ernsten "Dark Luxury Restaurant"-Ästhetik hin zu einer **food-first, editorial, warm, urban und leicht spielerischen Markenwelt**.

Mcello darf hochwertig wirken, soll aber nicht aussehen wie:

- Hotelbar;
- Luxusuhren-Shop;
- schwarzes SaaS-Dashboard;
- generisches Schwarz-Gold-Restauranttemplate.

Stattdessen soll das Produkt selbst visuell dominieren.

## 2. Wiederkehrende Muster aus den Referenzen

### A — Food ist Hero, nicht Dekoration

Wiederkehrend:

- sehr große Produkt-/Food-Darstellung;
- harte oder ungewöhnliche Crops;
- Top-down- und Close-up-Perspektiven;
- einzelne Zutaten oder Produkte als freigestellte visuelle Objekte;
- Bildmaterial darf über Layoutgrenzen hinausgreifen;
- Food ist aktiver Teil der Komposition.

Übersetzung für Mcello:

- Hero-Media größer und mutiger;
- Signature-Gerichte erhalten echte Bühne;
- Builder `FoodStage` wird zentraler visueller Anker;
- Produktbilder werden nicht in kleine Standard-Cards eingesperrt.

### B — Oversized Typography

Wiederkehrend:

- große, teils sehr große Headlines;
- starke Kombination aus Display-Typografie und nüchterner Interface-Schrift;
- Wörter werden als grafische Form benutzt;
- Produktnamen dürfen die Komposition mitbestimmen;
- weniger klassische "Headline + 2 Zeilen + Button"-Templates.

Übersetzung:

- Homepage-Hero mit starkem Wortbild;
- Section Headlines deutlich größer;
- Signature-Produkte bekommen typografische Hierarchie;
- Commerce bleibt lesbar und kompakt, ohne dieselbe Typo-Größe überall zu erzwingen.

### C — Warme, satte Farbflächen statt permanentem Schwarz

Wiederkehrend:

- Creme/Off-White;
- Rot/Terracotta/Ember;
- Grün/Olive;
- Gelb/Gold/Warm Orange;
- dunkle Bereiche als Kontrast, nicht als einzige Bühne.

Übersetzung:

- bestehendes Anthrazit bleibt Markenbasis;
- warme helle Flächen werden deutlich wichtiger;
- Copper/Gold wird material-/heat-orientiert statt "Luxury Accent";
- Olive/Green darf in Food-/Freshness-Zusammenhängen sichtbarer werden;
- Ember/Terracotta wird als möglicher sekundärer Food-/Heat-Akzent vorbereitet, nicht als dauerhafte CTA-Farbe.

### D — Editoriale Asymmetrie

Wiederkehrend:

- große freie Flächen;
- verschobene Bild-/Textachsen;
- ungewöhnliche Section-Wechsel;
- Overlaps;
- grafische Linien, Nummern, Labels und kleine Stempel;
- Layout wirkt kuratiert statt aus gleichförmigen Cards zusammengesetzt.

Übersetzung:

- Homepage darf deutlich stärker asymmetrisch werden;
- Signature-/Venue-/Event-Sektionen vermeiden universelle Card-Grids;
- Store bleibt funktionaler, kann aber einzelne Signature-Produkte editorial hervorheben.

### E — Organische Formensprache

Wiederkehrend:

- runde/ovale Foodformen;
- gebogene oder weich geschnittene Flächen;
- unregelmäßige grafische Masken;
- physisches/analoges Gefühl statt perfekt steriler Digitalgeometrie.

Übersetzung:

- Food-Crops dürfen natürliche Konturen behalten;
- einzelne Übergänge/Badges/Media-Masken können organischer werden;
- Controls selbst bleiben klar und touch-sicher.

### F — Product Builder / Ingredient Thinking

Besonders relevant für D065/D066:

- Produkt wird als zusammengesetztes Objekt verstanden;
- Zutaten/Bestandteile sind visuell einzeln erfassbar;
- Top-down bzw. Layer-Darstellung eignet sich für Pizza;
- gestaffelter Aufbau eignet sich für Döner/Yufka/Bowl;
- Auswahlchips und Food-Visual können gleichzeitig sichtbar sein.

Übersetzung:

- Pizza Builder: Top-down `FoodStage` + deterministische Layer;
- Döner/Yufka: Assembly-/Layer-Stage;
- Zutatenoptionen bleiben strukturierte Controls, Visualisierung reagiert darauf;
- Preis/Validität bleiben bestehende Domain-/Server-Autorität.

### G — Mobile Commerce bleibt extrem klar

Trotz expressiver Markenwelt zeigen die Referenzen wiederkehrend:

- große Touch-Ziele;
- kompakte Produktinfos;
- Sticky/Bottom Actions;
- klare Preis-Hierarchie;
- einfache Kategorie-Navigation;
- Sheet-/Drawer-ähnliche Konfiguration;
- visuelle Markenwelt wird beim Kauf nicht zum Hindernis.

Übersetzung:

- Store und Builder weiterhin mobile-first;
- Sticky `CategoryRail`;
- Sticky Price/Add-Bar;
- keine Scroll-Rallye zum Abschluss;
- Tap-first, Drag nur optional.

## 3. Neue Gewichtung der Art Direction

Die ursprüngliche Working Direction war:

- 58 % Cinematic Urban Bistro
- 28 % Warm Future Hospitality
- 14 % Editorial Street Luxury

Nach Auswertung der Owner-Referenzen wird für die nächste visuelle Iteration folgende **Arbeitsgewichtung** verwendet:

- **45 % Cinematic Food / Urban Bistro**
- **30 % Warm Future Hospitality / Commerce Precision**
- **25 % Editorial Street-Food Energy**

Interpretation:

1. Food-/Atmosphäre bleibt emotionaler Kern.
2. Commerce bleibt hochpräzise und app-artig.
3. Editoriale Eigenständigkeit wird deutlich stärker als zuvor.

Das ist weiterhin eine Arbeitsrichtung bis Owner Gate A/B ausdrücklich bestätigt ist.

## 4. Homepage-Auswirkung

Homepage V2 soll dadurch stärker werden in:

- größerem Food-Hero;
- weniger "UI-Card" und mehr Komposition;
- hell/dunkel/warmem Farbrhythmus;
- übergroßen Headlines;
- asymmetrischen Signature-/Venue-Blöcken;
- grafischen Labels/Rules statt Glas-/SaaS-Dekoration;
- stärkerer visueller Bewegung zwischen Sections.

Die aktuelle V2-Foundation darf deshalb als technische Zwischenstufe behandelt und visuell weitergeschärft werden.

## 5. Store-Auswirkung

Store V2 soll:

- klare Signature-Produkte größer darstellen;
- normale Produkte deutlich kompakter halten;
- Food-Bilder/Illustrationen stärker als Produktobjekte behandeln;
- Category Rail und Cart/Price immer klar halten;
- weniger dekorative Cards verwenden;
- Farbe/Typografie zur Kategorie- und Produkterkennung nutzen.

## 6. Builder-Auswirkung

Der Referenzhaufen bestätigt die Builder-Strategie besonders stark.

Builder Core bekommt:

- große sichtbare `FoodStage`;
- klar getrennte Ingredient-/Modifier-Steps;
- direkte visuelle Reaktion auf Auswahl;
- Sticky Preis + Add-to-cart;
- "Mcello Original" als vorbefüllten Startzustand;
- spielerische visuelle Rückmeldung ohne Gamification-Zwang.

## 7. Was ausdrücklich NICHT übernommen wird

- fremde Logos;
- fremde Claims;
- fremde Produktfotos;
- fremde Markenfarben als 1:1-Palette;
- identische Layouts;
- individuelle Illustrationen anderer Marken;
- unveränderte Navigationen/Component Patterns anderer Produkte.

Referenzen dienen ausschließlich zur Ableitung von Gestaltungsprinzipien.

## 8. Nächste Design-Gates

Bei Homepage/Store/Builder wird künftig zusätzlich geprüft:

- Wirkt Food groß genug, um die Marke zu tragen?
- Ist die Typografie eigenständig genug?
- Gibt es genug warme/helle Fläche, damit das System nicht in Dark-Luxury kippt?
- Gibt es bewusst asymmetrische/editoriale Momente?
- Bleibt Mobile Commerce trotz Expressivität schneller als die Public Experience?
- Sieht der Builder nach Produktaufbau aus statt nach Formular?
