# Mcello — Layer Master Generation Brief V2

Status: **Ready to execute. Blocked in the Claude session only by the absence of any text-to-image tool.**

Scope: the twelve `D076` layer masters. Binding decision [[DECISIONS]] `D076`, scoped against `D075`,
`D070`, `D068`. Hub: [[DONER_BUILDER_BLUEPRINT_V1]]. Repair path for the current set:
[[ASSET_REPAIR_HANDOFF]].

Presentation and asset work only. Prices, availability, selection limits and order validity stay
authoritative in `@business-web/menu-engine`. Everything generated here stays provisional and
non-documentary under `D068`.

## Why a second brief

The owner supplied two reference renders showing the intended result: an exploded stack where every
layer is separated, evenly spaced, fully readable on its own, and shot on one consistent axis. The
current twelve masters were generated against the V1 brief in two different sessions through two
different surfaces, and the result is not uniform — three layers came back near top-down, four came
back at 512 px and were upscaled, and the sauces were authored as thick blobs rather than spread
layers. Six of the twelve were replaced from the owner's asset library on 2026-08-25, which fixed
the bread, the meat and the sauces; the remaining four are the ones this brief targets first.

The V1 wording is not repeated here. This brief supersedes it for any new generation.

## Where this can run

Measured on 2026-08-25, in this session:

| Surface | Text-to-image | Note |
|---|---|---|
| Adobe for creativity connector | No | Its own initialization document states generative capabilities are unavailable here; `image_generative_expand` is the single exception |
| Higgsfield / Recraft connector | No | `recraft_v4_1` is the right model and was priced at 8 credits per 2K image, but submission returns `Requires basic plan or higher` |
| Any other connected service | No | They produce designs, diagrams or video, not isolated ingredient cutouts |

So it runs in a Codex session whose connector exposes `image_generate`, in the Firefly web interface,
or here once the Recraft plan is upgraded. `recraft_v4_1` is worth preferring if it becomes
available, because it takes an explicit `background_color` parameter — the solid black ground the
extraction step depends on becomes enforced rather than hoped for, which was a real failure source
in the first pass.

## Shared contract

Every prompt below is completed with the same three clauses. Identical camera and light are the
entire point: they are what let independently generated layers stack without manual distortion.

```
<camera>     Isometric view, exactly 45 degree angle, horizon locked, no perspective drift
<lighting>   Studio lighting, direct warm top light, soft downward shadow, consistent falloff
<background> Solid pure black
```

Plus, carried by every subject: the object forms **one horizontal layer** that spans most of the
frame width, sits almost flat, shows visible thickness at its front edge, is fully inside the frame,
and touches nothing else.

Shared negative prompt:

```
second copy of the subject, duplicate, extra layer behind, stack of two, plate, bowl, board, tray,
packaging, other foods, assembled sandwich, kebab sandwich, hands, people, garnish, text, logo,
watermark, cast shadow on a surface, tilted camera, vertical camera, flat top-down view,
illustration, cartoon, 3D render, CGI
```

Aspect ratio 4:3 for the wide layers, resolution 2K or higher. Never 512 — the four upscaled masters
in the current set are measurably softer than the rest and that is not recoverable.

## Subjects, in stack order

| # | Asset id | Directory | Subject clause |
|---|---|---|---|
| 1 | `ingredient.flatbread.base` | `flatbread-base/` | One round Turkish pide flatbread base, the lower half of a horizontally sliced flatbread, cut face upward showing soft open crumb, lightly toasted golden crust with scattered brown spots around the rim, completely empty |
| 2 | `ingredient.sauce.garlic.layer` | `garlic-sauce-layer/` | One poured layer of creamy white garlic yoghurt sauce with fine green herb flecks, glossy appetising surface, softly irregular spreading edge, natural creamy thickness, spread flat rather than heaped |
| 3 | `ingredient.sauce.curry.layer` | `curry-sauce-layer/` | One poured layer of glossy golden-orange curry sauce with fine spice specks, smooth surface, softly irregular spreading edge, spread flat rather than heaped |
| 4 | `ingredient.sauce.hot.layer` | `hot-sauce-layer/` | One poured layer of glossy deep-red chili sauce with visible fine chili flakes, smooth surface, softly irregular spreading edge, spread flat rather than heaped |
| 5 | `ingredient.tomato.layer` | `tomato-layer/` | Exactly three fresh red tomato slices lying side by side in one row, juicy seed chambers, delicate flesh texture, subtle moisture highlights, clearly visible slice thickness, slices touching but never stacked |
| 6 | `ingredient.tomato.layer.extra` | `tomato-layer-extra/` | Exactly two fresh red tomato slices lying side by side, same tomato, same cut and same thickness as the three-slice layer, intended to overlay it |
| 7 | `ingredient.cucumber.layer` | `cucumber-layer/` | Exactly four thin round Salatgurke cucumber slices lying flat side by side in one row, each with one continuous dark-green peel edge, translucent pale-green flesh and visible seeds, cut faces upward, never halved lengthwise |
| 8 | `ingredient.onion.layer` | `onion-layer/` | A scattered layer of thin intact red onion rings, purple-magenta and translucent white, lying nearly flat, loosely overlapping, visible cut thickness, every ring fully inside the frame |
| 9 | `ingredient.meat.doner.layer` | `doner-meat-layer/` | One loose layer of thinly shaved roasted rotisserie meat strips, crisp caramelised edges, juicy fibrous grain, warm seasoning, strips overlapping into a single low heap, unmistakably shaved from a vertical spit and never roast slices |
| 10 | `ingredient.falafel.layer` | `falafel-layer/` | One row of five whole falafel balls, coarse crisp deep golden-brown fried crust, tiny green herb specks, natural cracks, none cut open, arranged side by side as one layer |
| 11 | `ingredient.lettuce.layer` | `lettuce-layer/` | One volume of finely shredded crisp lettuce, pale-green and white shreds with subtle moisture, spread as one airy even layer, never a whole head and never large torn leaves |
| 12 | `ingredient.flatbread.lid` | `flatbread-lid/` | One domed Turkish pide flatbread lid, toasted golden crust, scattered sesame and nigella seeds, gently curved top, the matching upper half of a horizontally sliced flatbread |

## Traps recorded from the first pass

These cost four wasted generations last time. Do not re-enter them.

- **Cucumber came back halved lengthwise** instead of round slices. The phrase "round slices, cut
  faces upward, never halved lengthwise" is load-bearing.
- **Lettuce came back as whole heads** although the prompt said "never a whole head". Shredded reads
  better in the stack anyway and matches the reference; the wording above asks for shreds directly.
- **The meat prompt was refused by Firefly's usage policy.** "Ein oder mehrere Wörter entsprechen
  möglicherweise nicht den Nutzungsrichtlinien." Dropping "veal" and "kebab" for "roasted rotisserie
  meat strips" passed. That substitution is already in the table above.
- **The Firefly web interface silently returns 512 px** regardless of the requested rendition, and
  its prompt field is a textarea inside a shadow DOM, so simulated typing never reaches it and the
  generate button re-runs the previous prompt. Set the value through the native setter, dispatch
  `input` and `change`, and verify the field content before every generation.

## After generation

Per asset: preview, background removal, preview, deterministic alpha-bbox extract with 4% margin,
transparent 1024 × 1024 square normalization, final preview.

Then the step that will otherwise turn the suite red:
`tests/mcello-atomic-ingredient-asset-delivery.test.mjs` pins each master's `sha256`, its `bytes`
and a 1024 × 1024 non-interlaced RGBA contract, and allows exactly one source and one master image
per directory. Update `files.master` and `files.source` in that directory's `*.asset.json` in the
same change, record every request id under `provenance.masterProcessing.steps`, and record the
generator honestly — if it is not Adobe Firefly, do not leave `provider` saying it is.

Verify with `npm run check`, then `npm run build:preview` and `npm run build:preview:cloudflare`.

## Open composition question

The owner's first reference renders the salad as **one combined layer** — shredded lettuce, cucumber
slices and red onion rings mixed together — rather than three separate ones. That reads better as a
single fanned layer and is closer to how the food is actually assembled.

It is not proposed here, because it would change the runtime contract: `Salat`, `Gurke` and `Zwiebel`
are three independent modifier options, and one shared image cannot represent an arbitrary subset of
them. Merging them would either misreport the guest's selection or need a per-combination asset set.
That is a decision for the ledger, not a generation detail, so it is recorded rather than acted on.
