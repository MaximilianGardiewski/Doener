# Codex Handoff — D076 Layer Masters

Stand: 2026-08-24
Branch: `codex/mcello-atomic-tomato`, dirty worktree, **kein Commit**
Auftrag: zwölf governte Layer-Master erzeugen. Nur Assets. Kein Runtime-Code.

## Warum du das machst und nicht Claude Code

Der Adobe-Connector der Claude-Sitzung stellt kein Text-zu-Bild-Werkzeug bereit. Gemessen am 2026-08-24: Konto `auth`, generative Berechtigung nachweislich aktiv (`image_generative_expand`, Seed `64424`, Ergebnis 1280 × 1024, `requestId d7ce4134-85fd-4406-b37a-cf73fa8aec81`), aber `image_generate` existiert im Werkzeugsatz nicht und Neuverbinden ändert das nicht. In deiner Sitzung war `image_generate` vorhanden — siehe `ATOMIC_INGREDIENT_ASSET_WORKLOG.md`.

## Grenzen

- **Nur `data/mcello/ingredients/` anfassen.** Keine Datei unter `apps/`, `scripts/`, `tests/` oder `packages/` ändern.
- **Die neun bestehenden Verzeichnisse unverändert lassen.** `tomato/`, `cucumber/`, `lettuce/`, `onion/`, `doner-meat/`, `falafel/`, `garlic-sauce/`, `curry-sauce/`, `flatbread/` bleiben genau wie sie sind. Der Austausch passiert später in einem Zug mit der Registry, damit kein Zwischenstand rot wird.
- **Zwölf neue Verzeichnisse anlegen.** Namen exakt wie unten.
- **Keine Platzhalter.** Schlägt ein Aufruf fehl: einmal wiederholen, dann als Blocker protokollieren. Niemals eine Fake-Datei erzeugen.
- **Kein Commit.** Nicht committen, nicht pushen, `.agents/`, `.codex/`, `.codex-plugins/` nicht berühren.
- `adobe_mandatory_init` genau einmal pro Sitzung.
- Nach jedem wesentlichen Schritt Preview. Ablage auf demselben Familien-Board.

## Gemeinsamer Prompt-Aufbau

Jeder Prompt ist `<Subject>` plus wörtlich dieser Schwanz:

```
, photorealistic premium Mcello food photography, one single horizontal layer spanning most of the frame width, lying almost flat with visible thickness at the front edge, isometric view exactly 45 degree angle, studio lighting with direct warm top light and soft downward shadow, solid black background, centered, entire subject in frame, clean separation, no other objects.
```

Der schwarze Hintergrund ist Pflicht — er ist die Voraussetzung für sauberes Freistellen, nicht Deko. Kamera und Licht sind über alle zwölf identisch; nur so rasten die Schichten später ohne Verzerren aufeinander.

Gemeinsamer Negativ-Prompt:

```
second copy of the subject, duplicate, extra layer behind, stack of two, plate, bowl, board, tray, packaging, other foods, assembled sandwich, kebab sandwich, hands, people, garnish, text, logo, watermark, cast shadow on a surface, tilted camera, vertical camera, flat top-down view, illustration, cartoon, 3D render, CGI
```

Bei allen Nicht-Brot-Assets zusätzlich: `bread, flatbread, bun, pita`.

## Die zwölf Assets

| Verzeichnis | Asset-ID | Seed | Subject-Klausel |
|---|---|---:|---|
| `flatbread-base/` | `ingredient.flatbread.base` | 76001 | One fresh round Turkish flatbread base, lightly toasted, visible open pores and scattered brown spots, sliced horizontally with the cut face upward, completely empty with no filling, natural bread thickness |
| `flatbread-lid/` | `ingredient.flatbread.lid` | 76002 | One domed Turkish flatbread lid, toasted golden crust, scattered sesame seeds, gently curved top, the matching upper half of a horizontally sliced flatbread |
| `garlic-sauce-layer/` | `ingredient.sauce.garlic.layer` | 76003 | One poured layer of creamy white garlic sauce with fine green herb flecks, glossy appetizing surface, softly irregular spreading edge, natural creamy thickness |
| `curry-sauce-layer/` | `ingredient.sauce.curry.layer` | 76004 | One poured layer of glossy golden-orange curry sauce with fine spice specks, smooth appetizing surface, softly irregular spreading edge, natural creamy thickness |
| `hot-sauce-layer/` | `ingredient.sauce.hot.layer` | 76005 | One poured layer of glossy deep-red chili sauce with visible fine chili flakes, smooth appetizing surface, softly irregular spreading edge, natural thickness |
| `tomato-layer/` | `ingredient.tomato.layer` | 76006 | Exactly three fresh red tomato slices lying side by side in one row, juicy seed chambers, delicate flesh texture, subtle moisture highlights, visible slice thickness, slices touching but never stacked |
| `tomato-layer-extra/` | `ingredient.tomato.layer.extra` | 76007 | Exactly two fresh red tomato slices lying side by side, same tomato, same cut and same thickness as a three-slice row, meant to be laid over it |
| `cucumber-layer/` | `ingredient.cucumber.layer` | 76008 | Exactly four thin Salatgurke cucumber slices lying flat side by side in one row, one continuous dark-green peel edge each, translucent pale-green flesh and visible seeds, cut faces upward |
| `onion-layer/` | `ingredient.onion.layer` | 76009 | A scattered layer of thin intact red onion rings, purple-magenta and translucent white, lying nearly flat, loosely overlapping, visible cut thickness |
| `doner-meat-layer/` | `ingredient.meat.doner.layer` | 76010 | One loose layer of thinly shaved döner kebab veal, crisp caramelized edges, juicy fibrous grain, warm kebab seasoning, shavings overlapping into a single low heap, unmistakably döner shavings and not roast slices |
| `falafel-layer/` | `ingredient.falafel.layer` | 76011 | One row of five whole falafel balls, coarse crisp deep golden-brown fried crust, tiny green herb specks, natural cracks, none cut open, arranged side by side as one layer |
| `lettuce-layer/` | `ingredient.lettuce.layer` | 76012 | One volume of freshly torn iceberg lettuce, coarsely plucked ruffled pale-green pieces with curled edges and subtle moisture, spread as one airy layer, never a whole head |

`hot-sauce-layer` ist optional. `Scharf` hat bisher keinen Master und behält sonst eine schematische Vektorlinie mitten in einem fotorealistischen Stapel. Erzeuge ihn, wenn das Adobe-Budget es hergibt.

## Verarbeitung je Asset

Unverändert zur ersten Runde:

1. `image_generate`, Preview.
2. Kandidat prüfen: genau ein Objekt, exakt 45 Grad, waagerechte Schicht, sichtbare Dicke. Sonst neuer Seed, alten Kandidaten als Rejected protokollieren.
3. `image_remove_background`, Preview.
4. Tight Extract mit 4 % Rand.
5. Auf transparentes 1024 × 1024 quadratisch normalisieren.
6. Abschluss-Preview.
7. Auf das Familien-Board `urn:aaid:sc:EU:2f4c5352-565c-47f6-8519-3e78da00691d` legen.

Farbkorrekturen nur, wenn eine Schicht sichtbar aus der gemeinsamen Lichtachse fällt — und dann previewed und im Manifest protokolliert.

## Dateien je Verzeichnis

```
<slug>/
  source/<assetId>.firefly-seed-<seed>.png    genau eine Datei
  master/<assetId>.png                        genau eine Datei, RGBA, 1024 x 1024, transparent
  <slug>.asset.json
  README.md
  web/README.md
```

Der Manifest-Name muss exakt `<slug>.asset.json` heißen — der Delivery-Test leitet ihn aus dem Verzeichnisnamen ab.

## Manifest

Nimm `data/mcello/ingredients/tomato/tomato.asset.json` als Vorlage und übernimm die Struktur eins zu eins. Diese Felder ändern sich:

- `assetId`, `ingredient`, alle Pfade, `delivery.publicPath`
- `visual.role`: `"stacked-configurator-layer"`
- `visual.view`: `"isometric-45"`
- `visual.subject`: kurze Beschreibung der Schicht
- `visual.instancePolicy`: `canonicalMasterCount` 1, `frontendInstantiation` `"single-layer-instance"`, `extraSelection` `"separate-extra-layer-master"`, `separateExtraAssetAllowed` `true`
- `status.visualLanguageDecision`: `"D076"`
- `provenance.board`: das Familien-Board oben
- `provenance.selectedGeneration`: echter Seed, echte `requestId`, echte `assetUrn`, echte Maße, vollständiger Prompt und Negativ-Prompt
- `provenance.masterProcessing.steps`: die tatsächlich ausgeführten Schritte mit echten Request-IDs

`bytes`, `width`, `height`, `bitDepth`, `pngColorType` und `sha256` müssen die realen Werte der abgelegten Dateien sein. Der Delivery-Test prüft Hashes und PNG-Header gegen die Datei.

## Fertig ist es, wenn

- Zwölf neue Verzeichnisse existieren, jedes mit genau einer Source-, einer Master- und einer Manifest-Datei.
- Jeder Master 1024 × 1024 RGBA und wirklich transparent ist.
- Jedes Manifest reale Hashes, Maße und Adobe-Request-IDs trägt.
- Alle zwölf auf dem Familien-Board liegen.
- `node --test tests/mcello-atomic-ingredient-asset-delivery.test.mjs` grün ist.
- Die neun alten Verzeichnisse unverändert sind.
- Nichts committed ist.

Trage die neuen Zeilen anschließend in die Tabelle in `ATOMIC_INGREDIENT_ASSET_WORKLOG.md` ein, inklusive verworfener Kandidaten.

## Nachtrag 2026-08-24 — vier Layer fehlen noch

Der erste Durchlauf hat acht Layer erzeugt und nach Seed `76009` abgebrochen. Verarbeitet und im Repo abgelegt sind: `76001`, `76002`, `76003`, `76004`, `76005`, `76007`, `76009`, `76011`.

**Offen sind genau diese vier — und das sind ausgerechnet die, die Mengen tragen:**

| Verzeichnis | Asset-ID | Seed |
|---|---|---:|
| `tomato-layer/` | `ingredient.tomato.layer` | 76006 |
| `cucumber-layer/` | `ingredient.cucumber.layer` | 76008 |
| `doner-meat-layer/` | `ingredient.meat.doner.layer` | 76010 |
| `lettuce-layer/` | `ingredient.lettuce.layer` | 76012 |

Ohne sie hat die Bühne kein Fleisch, keinen Salat, keine Gurke und keine Grund-Tomatenreihe. P3 kann nicht starten.

Zwei Korrekturen gegenüber dem ersten Durchlauf:

1. **Licht ernst nehmen.** Die acht Rohbilder hatten stark unterschiedliche Helligkeit — gemessene mittlere Motivluminanz zwischen 40 und 170, Ziel ist 129 bis 146. Genau das soll die gemeinsame Lichtklausel verhindern. Prüfe jeden Kandidaten dagegen, bevor du ihn auswählst.
2. **Motiv vollständig im Rahmen.** Bei `76009` laufen die Zwiebelringe links und rechts aus dem Bild. Der Prompt-Schwanz fordert `entire subject in frame` — verwirf Kandidaten, die das verletzen.

Nur die vier fehlenden Verzeichnisse anlegen. Die acht bestehenden `*-layer/`-Verzeichnisse und die neun alten Zutatenverzeichnisse nicht anfassen.

## Copy/Paste Startauftrag

> Lies `AGENTS.md`, `docs/projects/mcello/DONER_BUILDER_BLUEPRINT_V1.md` und `docs/projects/mcello/CODEX_HANDOFF_LAYER_MASTERS.md` inklusive Nachtrag. Arbeite auf `codex/mcello-atomic-tomato` im vorhandenen dirty Worktree und bewahre alle bestehenden Änderungen. Erzeuge ausschließlich die noch fehlenden vier D076-Layer-Master (Seeds 76006, 76008, 76010, 76012) nach dem dortigen Brief: gemeinsamer Prompt-Schwanz, isometrisch exakt 45 Grad, warmes Top-Light, Solid Black, danach Background Removal, Tight Extract mit 4 % Rand, transparente 1024×1024-Normalisierung, Preview nach jedem wesentlichen Schritt und Ablage auf dem Familien-Board. Lege sie in zwölf neuen Verzeichnissen ab und lass die neun bestehenden Zutatenverzeichnisse unangetastet. Ändere keinen Runtime-Code, keine Tests und keine Registry. Keine Platzhalterdateien. Nicht committen.
