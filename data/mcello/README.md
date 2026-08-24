# Mcello Creative Master Spec

This directory is the Git-governed handoff layer between design exploration (Adobe/Firefly and other optional clients) and the Mcello runtime.

## Authority

The binding product and design truth remains:

- `docs/projects/mcello/DECISIONS.md`
- `docs/projects/mcello/ART_DIRECTION.md`
- `docs/projects/mcello/BRAND_SYSTEM.md`
- tested application/domain behavior

Notebook research and generated concept art are evidence and exploration, not product truth.

## Files

- `brand-profile.json` — working Mcello visual profile and experience mix.
- `visual-rules.json` — implementation constraints for Public, Commerce, Builder and Operations surfaces.
- `rights-policy.json` — provenance and publishability rules for real, generated and placeholder media.
- `asset-manifest.json` — governed inventory of creative assets and planned replacements.
- `prompt-library.json` — reproducible prompts for Adobe/Firefly concept exploration.

Existing `builder-presentation.v1.json` remains a presentation-only local-demo contract and must not be promoted to catalog truth.

## Asset pipeline

1. Design brief derives from the canonical Mcello docs.
2. Optional clients such as Adobe create concept/reference assets.
3. Every candidate receives provenance and a publishability class in `asset-manifest.json`.
4. Runtime-safe assets are checked into Git or enter the governed Media/CMS path.
5. Generated concept art is never represented as documentary Mcello photography.
6. Visual acceptance still requires Mobile/Desktop screenshots and the relevant visual gate.

## Scroll story

The notebook-inspired exploded-food sequence is implemented as a **144-step logical scrub**, not 144 raster files. This keeps the V1 runtime light and lets the existing same-origin GSAP adapter drive presentation while preserving a fully functional reduced-motion / GSAP-unavailable fallback. A future approved frame sequence or GLB/GLTF asset can replace the stage renderer through the manifest without moving pricing, availability or modifier validity into the animation layer.
