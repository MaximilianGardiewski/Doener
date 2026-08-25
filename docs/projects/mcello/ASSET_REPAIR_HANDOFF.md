# Mcello — Layer Master Repair Handoff

Status: **Ready to execute. Blocked only on an authorized Adobe connector.**

Scope: the twelve `D076` layer masters under `data/mcello/ingredients/`. Binding decision
[[DECISIONS]] `D076`, scoped against `D075`, `D070`, `D068`. Hub: [[DONER_BUILDER_BLUEPRINT_V1]].
Generation provenance: [[ATOMIC_INGREDIENT_ASSET_WORKLOG]].

This document is presentation and asset work only. Prices, availability, selection limits and order
validity stay authoritative in `@business-web/menu-engine` and the normal Mcello application path.
Every generated image stays provisional and non-documentary under `D068`.

## Why this exists

The stacked stage now renders all twelve layers, and the blueprint HUD makes the stack legible as a
build. That legibility is exactly what exposes the remaining asset defects: in the closed stack the
flaws sit between bread base and lid and read as acceptable, but fanned out each layer is inspected
on its own.

## Precondition

The Adobe connector must be authorized before any step here can run. It was **not** authorized in
the session that wrote this document, and that session was non-interactive, so the OAuth flow could
not be started. Authorize it from the claude.ai connector settings, or via `claude mcp` / `/mcp` in
an interactive session.

A second precondition applies to the regeneration half only: this Adobe connector exposes **no
text-to-image tool**. Editing existing images works, generating new ones does not. That was measured,
not assumed — see the "Open blockers" section of [[DONER_BUILDER_BLUEPRINT_V1]], including the
successful `image_generative_expand` probe (`requestId d7ce4134-85fd-4406-b37a-cf73fa8aec81`) that
proves the account is entitled and the service works. Regeneration therefore needs a session whose
connector does expose `image_generate`.

## The one rule that will otherwise turn the suite red

`tests/mcello-atomic-ingredient-asset-delivery.test.mjs` pins each master's `sha256`, its `bytes`,
and a 1024 × 1024 non-interlaced RGBA contract, and asserts exactly one source and one master image
per directory.

Any pixel that changes therefore requires, in the same change:

1. Re-run the tight extract and the transparent 1024 × 1024 square normalization, so the contract
   still holds.
2. Update `files.master.bytes` and `files.master.sha256` in that directory's `*.asset.json`.
3. Append the Adobe request IDs to `provenance.masterProcessing.steps`, so the repair is traceable
   the same way the original generation is.
4. Do **not** add a second image to the directory. There is one source and one master, and the
   variant ban in the delivery suite enforces it.

Then run `npm run check`, plus `npm run build:preview` and `npm run build:preview:cloudflare`.

## Part 1 — Repairable by editing

These need the connector authorized and nothing else.

| # | Asset | Directory | Defect | Tool |
|---|---|---|---|---|
| 1 | `ingredient.onion.layer` | `onion-layer/` | Rings run past the left and right frame edge instead of sitting fully inside it | `image_generative_expand`, then re-extract and re-normalize |
| 2 | `ingredient.sauce.curry.layer` | `curry-sauce-layer/` | Cutout clipped a hard edge on the right | `image_generative_expand`, then re-extract and re-normalize |
| 3 | `ingredient.cucumber.layer` | `cucumber-layer/` | Mean subject luminance 160, above the 129–146 band | `image_adjust_*` |
| 4 | `ingredient.sauce.garlic.layer` | `garlic-sauce-layer/` | Mean subject luminance 171, above the band | `image_adjust_*` |
| 5 | `ingredient.falafel.layer` | `falafel-layer/` | Mean subject luminance 91, below the band | `image_adjust_*` |

On 3 to 5, judge before forcing. Cucumber and garlic sauce are genuinely pale ingredients and
falafel is genuinely dark, so the previous pass accepted the deviation deliberately. Correct toward
the band only as far as the ingredient still looks like itself; a grey falafel is worse than an
out-of-band one.

## Part 2 — Not repairable, needs regeneration

| # | Asset | Directory | Defect |
|---|---|---|---|
| 6 | `ingredient.cucumber.layer` | `cucumber-layer/` | Generated on a near top-down camera instead of the isometric 45 degrees `D076` specifies |
| 7 | `ingredient.lettuce.layer` | `lettuce-layer/` | Same |
| 8 | `ingredient.meat.doner.layer` | `doner-meat-layer/` | Same |

Camera axis is not a correction that image editing can make. These three, plus
`ingredient.tomato.layer`, are also the four that came from the Firefly web interface at 512 × 512
and were upscaled, so they are measurably softer than the eight produced through the API at
2048 × 2048. Regenerating them fixes both problems in one pass, which is why upscaling is not
proposed here as a separate step: it would spend effort inventing detail on images that need to be
replaced anyway.

Regenerate with the shared contract from the blueprint, unchanged:

```
<camera>     Isometric view, exactly 45 degree angle, horizon locked, no perspective drift
<lighting>   Studio lighting, direct warm top light, soft downward shadow, consistent falloff
<background> Solid black
```

Plus, on every subject: the object forms one horizontal layer spanning most of the frame width, sits
almost flat, shows visible thickness at its front edge, is fully inside the frame, and touches
nothing else.

Carry the revised subject wording forward rather than the original brief text. The first pass
produced the wrong subject three times out of four, and the corrected prompts are already stored per
manifest as `briefPrompt` with `promptRevisedFromBrief: true`. Two specific traps recorded from that
run: cucumber came back halved lengthwise instead of as round slices, and lettuce came back as whole
heads although the prompt said "never a whole head". The döner meat prompt was refused outright by
Firefly's usage policy until "veal" and "kebab" were replaced with "roasted rotisserie meat strips".

## Part 3 — Composition, worth deciding before regenerating

The bread base is the layer that reads worst on the assembled stage. It renders as a flat round
bread beside the filling rather than as a base underneath it, because the master shows a whole
flatbread at an angle rather than the lower half of a horizontally sliced one.

Stage geometry was already pulled as far as it goes: the base was moved up and sized closer to the
lid, and the explode gap was reduced so the stack stays on the HUD plate. Further improvement is an
asset question, not a geometry one. If a regeneration budget exists beyond the three layers above,
this is the highest-value fourth.

## Verification

- `npm run check` — currently 407 pass, 0 fail. The delivery suite iterates the directory tree, so
  a repaired directory is picked up with no test edit.
- `npm run build:preview` and `npm run build:preview:cloudflare` — both must stay green and emit
  exactly twelve ingredient PNGs.
- `tests/mcello-atomic-tomato.browser.mjs` is **still written against the superseded nine-atom
  repeat counts** and is the last place in the repository carrying the old asset ids. It needs its
  own rewrite before it can verify anything here.
- Visual acceptance under `D069` needs real Desktop and Mobile screenshots, assembled and fanned
  out. Note that the Builder is gated to landscape on phones, so the mobile evidence is landscape.

## What must not change

- One renderer. `atomic-ingredient-renderer.js` is never forked or duplicated.
- No `Math.random()`, no Adobe call from the browser, no new image-conversion runtime.
- Yufka keeps its vector vessel, zero flatbread instances and zero flatbread media requests.
- Generated imagery stays provisional and non-documentary (`D068`); Adobe stays an optional design
  client and never a runtime dependency (`D070`).
- Pizza stays outside this slice.
