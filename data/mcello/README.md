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
- `combined-workflow.v1.json` — combined production contract derived from the Cinematic, Manual Hand-off and Terminal-to-Reality workflows.
- `ingredient-asset-contract.v1.json` — reusable 2.5D ingredient-layer and visual-state contract for the interactive builder.

Existing `builder-presentation.v1.json` remains a presentation-only local-demo contract and must not be promoted to catalog truth.

## Combined asset pipeline

The three explored workflows are intentionally combined instead of choosing one as the whole system:

1. Product/ingredient truth and rights are approved first.
2. A reproducible asset brief is derived from the canonical Mcello art direction.
3. Firefly or another approved generator creates candidate assets in **staging** only.
4. Candidates pass visual/provenance QA before they can become runtime assets.
5. Approved candidates receive a versioned `asset-manifest.json` entry.
6. Renderer routing splits the output into either the cinematic story or reusable interactive ingredient layers.
7. The browser publishes a presentation-only visual selection projection; the menu engine remains authoritative for price, validity, availability and related commerce truth.
8. Ordering/KDS and CI/preview gates remain downstream of the domain layer.

Generated output never writes directly into production truth, and Adobe/Firefly URLs never become a runtime dependency.

## Two renderer modes

### Cinematic story

The notebook-inspired exploded-food sequence is currently implemented as a **144-step logical scrub**, not 144 raster files. This keeps the V1 runtime light and lets the existing same-origin GSAP adapter drive presentation while preserving a fully functional reduced-motion / GSAP-unavailable fallback. A future approved frame sequence can replace the bounded story renderer through the manifest.

Frame sequences are deliberately restricted to linear storytelling and transitions. They must not encode the full modifier-combination matrix of the real configurator.

### Interactive builder

The freely combinable configurator uses a **2.5D ingredient-layer contract**. Approved transparent ingredient assets map explicitly to domain modifier option IDs and stable visual slots such as `bread.bottom`, `protein.primary`, `fresh.tomato`, `sauce.primary` and `bread.top`.

`apps/mcello/public/builder-visual-state.js` emits `mcello:builder-visual-state` as a presentation-only projection of checked modifier inputs. Consumers may animate those selections, but they must not calculate or infer price, availability, validity, allergens, capacity, cart or checkout state.

Until the first approved runtime ingredient pack exists, missing visual mappings fall back to the existing product visual instead of inventing product imagery.

## Visual acceptance

Runtime-safe assets still require the relevant Mobile/Desktop screenshots, reduced-motion behavior and the project visual gate. Generated concept art is never represented as documentary Mcello photography.