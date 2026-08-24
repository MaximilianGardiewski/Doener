# Claude Code / Claude Design Handoff — Atomic Mcello Döner

Stand: 2026-08-24  
Branch: `codex/mcello-atomic-tomato`  
Commit: **keiner** — Working Tree bewusst uncommitted, weil die finale Flatbread-Ansicht visuell noch nicht akzeptiert ist.

## Auftrag und Grenzen

Die Tomate sowie Gurke, Eisbergsalat, Zwiebel, Dönerfleisch, Falafel, Knoblauchsoße, Currysoße und Fladenbrot werden als atomare, transparente Adobe-Master mehrfach deterministisch im vorhandenen FoodStage instanziiert. Das Gesamtbild soll als Döner lesbar werden.

Unverhandelbar:

- Bestehende Architektur weiterführen; kein zweiter Renderer.
- Preise, Verfügbarkeit und Regeln bleiben in `@business-web/menu-engine`.
- Visuelle Metadaten bleiben Presentation-only.
- Kein `Math.random()`, keine Adobe-Aufrufe im Browser, keine neue Bildkonvertierungs-Runtime.
- Extra Tomate nutzt denselben Master: 3 Basisinstanzen + nur 2 Delta-Instanzen.
- Curry und Knoblauch sind getrennte Master und dürfen gleichzeitig erscheinen.
- `flatbread-pocket` kommt nur aus strukturierten Metadaten; nie aus Produktnamen ableiten.
- `yufka-wrap` erzeugt **0** Flatbread-Instanzen und **0** Flatbread-Requests.
- Kalb-Master niemals als Pute ausgeben; unbekannte Proteinoption behält den Vector-Fallback.
- Reduced Motion, Delta-only GSAP und bestehende Commerce-Autorität erhalten.
- Pizza bleibt außerhalb dieses Slices.
- `.agents/`, `.codex/`, `.codex-plugins/` sind unrelated und dürfen nicht in einen Commit.

## Was fertig ist

1. **Adobe-Assets:** neun Source/Master-Sets, jeweils genau ein Source-PNG und ein transparenter 1024×1024-RGBA-Master unter `data/mcello/ingredients/`.
2. **Generische Runtime:** `ingredient-visuals.js` + `atomic-ingredient-renderer.js`; stabile Keys, Slots, Rotation/Scale, ein batched Delta-Event.
3. **Füllungen:** Fleisch 7, Falafel 5, Salat 5, Tomate 3, Gurke 4, Zwiebel 3, Curry 1, Knoblauch 1.
4. **Extra Tomate:** 3↔5, nur Keys `:3`/`:4` werden addiert/entfernt.
5. **Proteinwechsel:** ein Batch mit 7 Meat removals + 5 Falafel additions; unveränderte Zutaten behalten ihre Nodes.
6. **Asset-Delivery:** Development und Preview liefern aus den kanonischen Data-Mastern; PWA cached große Medien nur on demand.
7. **Product-form-Sidecar:** `warm-013..015 → flatbread-pocket`, `warm-016..018 → yufka-wrap`; lokale Runtime-UUIDs werden mit demselben Namespace/SHA256-Verfahren wie der Importer gebildet.
8. **Browservertrag:** Flatbread genau 1 Instanz/Request; Yufka 0/0; Vector-Fallback bleibt bei Yufka sichtbar.

## Aktueller Blocker

Die Funktion ist korrekt, aber das Flatbread-Compositing ist visuell **noch nicht akzeptabel**:

- Der alte dunkle `mcBreadInner`-Block in `stageMarkup()` bleibt hinter den Zutaten sichtbar und bildet ein hartes braunes Rechteck.
- Der einzige Flatbread-Master liegt vollständig hinter allen Zutaten; dadurch wirken Fleisch/Gemüse/Soßen schwebend.
- Dasselbe Problem ist Desktop und Phone-Landscape sichtbar.
- Yufka ist korrekt unverändert und darf beim Fix nicht regressieren.

Betroffene Stellen:

- `apps/mcello/public/doner-yufka-builder-v2.js` — SVG-Reihenfolge, `mcBreadInner`, Clip/Vessel-Fallback.
- `apps/mcello/public/doner-yufka-builder-v2.css` — form-gesteuertes Ausblenden der Legacy-Brothälften.
- `apps/mcello/public/ingredient-visuals.js` — aktuell Flatbread-Transform `translate(380 390) rotate(0) scale(1)`, Größe 470.

Ziel für den nächsten Schritt: Mit **demselben einen Master** eine glaubhafte Brot-/Füllungsbeziehung herstellen. Layering, Clip/Mask und deterministische Slot-Tuning sind erlaubt; keine zweite Brotgrafik und kein neuer Renderer.

## Adobe / Claude Design

Vollständige Prompts, Negative Prompts, Request-IDs, Processing-Schritte und Rejected Candidates stehen in:

- `docs/projects/mcello/ATOMIC_INGREDIENT_ASSET_WORKLOG.md`
- den jeweiligen `data/mcello/ingredients/*/*.asset.json`

Boards:

- Familie: `urn:aaid:sc:EU:2f4c5352-565c-47f6-8519-3e78da00691d`
- URL: <https://firefly.adobe.com/boards/id/urn:aaid:sc:EU:2f4c5352-565c-47f6-8519-3e78da00691d>
- Tomate: `urn:aaid:sc:EU:a8c9ddc5-99ca-4ef4-87d3-2d1c52d43c91`
- Exploded-Döner-Referenz: `urn:aaid:sc:EU:f0691178-75d0-4960-912f-774eca120747`

Finale Master-URNs:

| Asset | Final master URN |
|---|---|
| Tomato | `urn:aaid:ps:US:a353e176-4211-4f07-bbbf-520cf7e21fdf` |
| Cucumber | `urn:aaid:ps:US:4f3452d3-3ac9-4e2b-9874-43addd3fb77c` |
| Lettuce | `urn:aaid:ps:US:16152ba2-1329-4e78-aa8c-942dfb519aef` |
| Onion | `urn:aaid:ps:US:d6293745-2c2a-4628-896c-7fa46c27de7a` |
| Döner meat | `urn:aaid:ps:US:2f125d7b-a9cc-4260-9f70-a32f31086860` |
| Falafel | `urn:aaid:ps:US:01f8982d-8715-455a-9543-d44aa682ea2d` |
| Garlic sauce | `urn:aaid:ps:US:a4672b49-0854-40b7-a209-d6c804cc865e` |
| Curry sauce | `urn:aaid:ps:US:79036669-1025-4f2c-b516-9ff6bb2dcae2` |
| Flatbread | `urn:aaid:ps:US:e0799145-5b22-4447-b1b5-1e54456e9edd` |

Der frühere Adobe-`403 FORBIDDEN` wurde transparent dokumentiert und ist behoben. Es wurden keine Platzhalter erzeugt. In derselben Tool-Session `adobe_mandatory_init` **nicht erneut** aufrufen; in einer tatsächlich neuen Adobe/Claude-Design-Session deren Pflichtworkflow genau einmal initialisieren. Neue Kreativarbeit weiterhin ausschließlich über Adobe, mit Preview nach jedem wesentlichen Schritt und Ablage auf demselben Familien-Board.

## Wichtigste Dateien

- Präsentationsvertrag: `data/mcello/builder-presentation.v1.json`
- Registry/Slots: `apps/mcello/public/ingredient-visuals.js`
- Reconciler: `apps/mcello/public/atomic-ingredient-renderer.js`
- FoodStage: `apps/mcello/public/doner-yufka-builder-v2.js` + `.css`
- Sidecar-Transport: `apps/mcello/server.mjs`, `apps/mcello/public/app.js`, `scripts/build-cloudflare-preview.mjs`
- Motion: `apps/mcello/public/motion.js`, `motion/commerce.js`, `motion.css`
- Delivery: `apps/mcello/server.mjs`, `scripts/build-preview.mjs`, `apps/mcello/public/sw.js`
- Governance: `DECISIONS.md` D075, `V1_EVIDENCE.md`, `ACCEPTANCE.md`, Asset Worklog
- Haupt-Browsertest: `tests/mcello-atomic-tomato.browser.mjs`

## Bereits bestandene Prüfungen

- Asset-/Delivery/PWA/Motion: 22 Tests grün.
- Sidecar/Form/Configurator/Atomic Unit Contracts: 34 Tests grün.
- Vollständiger Atomic-Browsertest inklusive Desktop Flatbread, Phone-Landscape und Yufka: grün.
- `git diff --check`: grün; nur erwartete LF→CRLF-Warnungen auf Windows.
- Ein früherer kompletter `npm run check` war vor der letzten Flatbread-/Sidecar-Runde grün; **nach dem visuellen Fix erneut komplett ausführen**.

Browser-Screenshots:

- `C:/Users/SAMSUNG/.codex/visualizations/2026/08/24/01a0322b-dfcb-7ca3-ac08-57f4867ab9ba/tomato-visual-qa/desktop-flatbread-pocket.png`
- `.../phone-landscape-flatbread-pocket.png`
- `.../desktop-yufka-wrap-vector-vessel.png`
- `.../atomic-all-fillings-audit.png`
- `.../atomic-falafel-all-fillings-audit.png`

## Empfohlene Reihenfolge

1. Screenshots und Flatbread-Master ansehen.
2. `mcBreadInner`/Layer/Clip so korrigieren, dass Brot und Füllung eine Einheit bilden.
3. Browsertest unverändert grün halten: Flatbread 1/1, Yufka 0/0.
4. Desktop 1280×900 und Phone-Landscape 844×390 neu screenshotten; Reduced Motion prüfen.
5. `node tests/mcello-atomic-tomato.browser.mjs`.
6. `npm run build:preview` und `npm run build:preview:cloudflare`.
7. `npm run check`.
8. Erst nach visueller Abnahme D075 in `ACCEPTANCE.md`/`V1_EVIDENCE.md` auf verified setzen und einen gezielten Commit ohne unrelated Codex-Verzeichnisse erstellen.

## Copy/Paste Startauftrag für Claude Code

> Lies `AGENTS.md` und `docs/projects/mcello/CLAUDE_HANDOFF_ATOMIC_DONER.md`. Arbeite auf `codex/mcello-atomic-tomato` im vorhandenen dirty Worktree und bewahre alle bestehenden Änderungen. Repariere ausschließlich das Flatbread-Compositing im bestehenden FoodStage: entferne den sichtbaren Legacy-Innenbrot-Block und verankere die Füllung glaubhaft im einzigen kanonischen Flatbread-Master. Kein zweiter Renderer/Asset, keine Produktnamen-Inferenz, keine Commerce-/Pizza-Änderung. Prüfe Desktop, Phone-Landscape, Yufka 0 Requests, Reduced Motion, Builds und `npm run check`. Nicht committen, bevor die neuen Screenshots visuell akzeptiert sind.

## Copy/Paste Startauftrag für Claude Design

> Nutze das Adobe-Board und die Provenienz aus `docs/projects/mcello/CLAUDE_HANDOFF_ATOMIC_DONER.md` sowie den aktuellen Flatbread-Master als Ausgangspunkt. Beurteile zuerst, ob das Problem rein durch Layering/Clip/Position im FoodStage lösbar ist. Nur wenn der Master selbst klar ungeeignet ist, erzeuge über den vorhandenen Adobe-Workflow eine neue atomare Variante: exakt ein leeres, niedrig liegendes türkisches Flatbread-Pocket, transparent, top-three-quarter, sichtbare Dicke, keine Füllung/Fremdobjekte. Preview, Background Removal, tight extract, 1024×1024 transparent normalize, erneut Preview, auf dasselbe Board und mit vollständiger Manifest-Provenienz ins Repo. Keine Fake-Datei und keine Browser-Adobe-Abhängigkeit.
