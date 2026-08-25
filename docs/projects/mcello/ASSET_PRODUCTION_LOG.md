# Mcello ingredient asset production log

This log records immutable production checkpoints for governed interactive-builder ingredient assets. It is documentation only; menu/catalog truth remains server-authoritative.

## Tomato — completed checkpoint

- Asset ID: `fresh-tomato-slice-master-v1`
- Runtime path: `/assets/ingredients/fresh/tomato-slice-master.png`
- Slot: `fresh.tomato`
- Authoring: Adobe Firefly → background removal → crop/normalization → QA → local runtime publication
- Runtime scope: `presentation-only-local-demo`
- Commerce mapping: production modifier option ID intentionally remains unresolved until confirmed by catalog truth.
- Validation checkpoint: CI #696, Mcello Cloudflare Preview #125, Mcello Laptop Preview #112, Self-host Release #365, Mcello Demo Diagnostics #185 and Supabase Integration #508 all completed successfully on the tomato checkpoint head.

## Cucumber — integration checkpoint

- Asset ID: `fresh-cucumber-slice-master-v1`
- Runtime path: `/assets/ingredients/fresh/cucumber-slice-master.png`
- Slot: `fresh.cucumber`
- Authoring: Adobe Firefly → visual QA → background removal → cutout QA → crop/normalization → runtime QA → Firefly Board publication → local runtime publication
- Generation request: `d767ebd2-8b81-4656-a078-1a466d8b822f`
- Background-removal request: `8407bb10-807b-4e45-9ca3-7a729231f9af`
- Crop request: `c3689f36-00ba-4cca-994a-8c3ec2a3eaee`
- Firefly Board: `urn:aaid:sc:EU:bea31d70-9090-4de1-9b2e-e4feeeec4ef7`
- Board entity: `5b68a677-f847-4335-8c79-24052ab7d31f`
- Runtime scope: `presentation-only-local-demo`
- Commerce mapping: production modifier option ID intentionally remains unresolved until confirmed by catalog truth.
- Final ingredient acceptance gate: the standard six-workflow PR validation set must pass after this user-authored documentation checkpoint before the production workflow may advance to red onion.

## Sequential gate

Do not start the next ingredient while the current ingredient has an open or failed gate. The required order is: tomato → cucumber → red onion → lettuce → döner meat → falafel → bread bottom → bread top.
