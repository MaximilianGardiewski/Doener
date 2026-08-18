# Mcello — Standalone Design Pipeline V5

Stand: 2026-08-18

Status: **binding design/tooling contract** for Mcello visual work. This document refines D063 and D070 and supersedes older tooling assumptions where they imply a mandatory Figma, Lovable, Vercel, Adobe or other design-service dependency. `DECISIONS.md`, security/domain invariants and verified acceptance evidence remain authoritative.

## 1. Goal

Mcello is built as a standalone, self-hostable product. Design and coding tools may accelerate development, but the finished application must remain operable without them.

Runtime target:

```text
Mcello PWA / Web App
  -> application/domain packages
  -> provider-neutral adapters
  -> PostgreSQL/Auth/Realtime/Storage
  -> self-hostable infrastructure
```

No normal customer, staff, admin, KDS or CMS interaction may require Lovable, Figma, Firefly, Vercel, ChatGPT, Claude, Codex or another design/coding service.

## 2. Source of truth

GitHub/repository content is the technical source of truth:

- code;
- migrations;
- tests;
- repo-owned design tokens;
- accepted media/assets;
- decision ledgers;
- acceptance/evidence;
- deployment and self-host runbooks.

External tools are clients/workspaces, never a parallel product truth.

## 3. Design tokens

Design tokens are allowed and encouraged, but they must be repo-owned and usable without a remote design service.

Allowed canonical forms include:

- CSS custom properties;
- TypeScript/JavaScript constants;
- JSON token files;
- app-owned font and asset metadata.

Not allowed as a runtime/build requirement:

- Figma Variables/Tokens fetched from Figma;
- Firefly/Adobe-hosted design state required to render the app;
- Lovable-only theme state;
- remote token APIs that make the app or build fail when the design vendor is unavailable.

A design tool may originate or edit a token, but accepted values must be copied/translated into the repository before implementation is considered complete.

## 4. Firefly Boards — primary visual workspace

Adobe Firefly Boards is the preferred visual exploration workspace for the current Mcello design phase because the owner already has an Adobe subscription and its development-time usage is explicitly approved.

Recommended master board:

`Mcello — Visual Direction V5`

Suggested board areas/artboards:

1. Brand DNA
2. Food Language
3. Venue / Homepage
4. Store & Builder
5. Operations / KDS / Admin
6. Motion / Microinteraction references
7. Rejected Directions
8. Approved Direction

Firefly may be used for:

- moodboards and art direction;
- style/composition references;
- food/ingredient illustration exploration;
- textures/backgrounds;
- image variants and refinements;
- supporting Adobe image workflows.

Firefly-generated or Firefly-edited assets are not automatically production assets.

## 5. Asset acceptance flow

```text
Firefly/Adobe generation or edit
  -> visual review
  -> provenance/content-integrity review
  -> accepted export
  -> Git or governed Mcello Media/CMS
  -> optimized app format where appropriate
  -> browser/runtime verification
```

Rules:

- AI/stylized food must not be presented as documentary real Mcello photography.
- First-party real venue/product/team imagery requires provenance/rights confirmation.
- Accepted assets must not require a live Adobe request to display.
- Prefer portable runtime formats such as SVG, PNG, WebP or AVIF as appropriate.

## 6. Figma — optional specialist tool

Figma is no longer a mandatory stage between Firefly and implementation.

Use Figma only where it creates clear value, for example:

- complex component-system exploration;
- a large UI redesign that benefits from pre-code prototyping;
- collaborative high-fidelity review;
- a future multi-product BusinessWebFactory design-system effort.

If Figma is used, its output still returns to Git. No Figma variable, file, component or token is a Mcello runtime dependency.

Default current loop:

```text
Firefly Boards
  -> accepted visual direction/assets
  -> GitHub implementation
  -> real browser screenshots
  -> visual acceptance
  -> optional Firefly iteration
```

## 7. Self-host and vendor boundary

The production path must remain reproducible on owned/available infrastructure.

Expected boundary:

- app container/runtime owned by the project;
- PostgreSQL/Supabase-compatible self-host path;
- app-owned migration history;
- app-owned media contract;
- backup/restore and monitoring path;
- no mandatory Vercel/Lovable/Figma/Adobe runtime.

Adobe/Firefly subscription cost is an approved development/design-tool cost and therefore is not blocked by the project's no-new-mandatory-runtime-SaaS principle. This approval does not convert Adobe into a production dependency.

## 8. Browser is the final UI proof

A mockup or board does not mark a visual slice complete.

Final design acceptance happens against the real Mcello runtime using the existing gates, including as scope applies:

- desktop screenshots;
- tablet landscape;
- phone portrait/landscape;
- rotation/state recovery;
- keyboard/tap;
- reduced motion;
- overflow/layout checks;
- content-integrity checks;
- no security/domain-authority duplication.

## 9. Operational rule

For future Mcello design work:

1. Read current Git truth first.
2. Use Firefly Boards for visual exploration when helpful.
3. Accept only reviewed directions/assets.
4. Convert all accepted design state into repo-owned code/tokens/assets.
5. Implement on a feature branch.
6. Validate in the real browser/runtime.
7. Merge only after applicable CI/review/visual gates.
8. Never production-deploy without separate explicit approval.
