# Mcello — Presentation UX V4

Stand: 2026-08-18

Status: **binding implementation contract for the presentation-first V4 slice**. `DECISIONS.md`, security/domain invariants and verified acceptance remain authoritative if anything conflicts.

## Goal

The local/private-LAN presentation must feel like one coherent Mcello product rather than a collection of development pages. The technical V1 core is preserved. Presentation UX V4 improves the visible product without duplicating pricing, availability, ordering, KDS or role authority.

Presentation topology remains:

- laptop = host + presentation hub + any view;
- smartphone = customer/shop/builder;
- tablet = KDS/Ops/Admin;
- production later = self-hosted VPS/dedicated path, not Vercel runtime.

## D071 — Warm Editorial Cartoon Food

The Builder visual language is deliberately illustrative:

- adult, appetizing, warm and lightly playful;
- clean editorial shapes rather than emoji/kawaii/clip-art;
- consistent 3/4 assembly view for Döner/Yufka;
- top-down mental model for Pizza;
- soft depth/shadow, restrained texture and Mcello heat/freshness palette;
- generated/stylized media is never described as a real Mcello product photo.

Until a design-tool asset is accepted into the governed media pipeline, repo-native SVG/vector layers are the portable fallback and remain `documentary=false`.

## FoodStage V4

The visual stage mirrors real rendered modifier inputs and never mutates them.

Döner/Yufka presentation groups:

1. `Basis`: Fleisch | Falafel — presentation assumption;
2. `Gemüse`: Salat | Tomate | Gurke | Zwiebel — presentation assumptions;
3. `Soße`: Curry | Knoblauch | Scharf — owner-confirmed presentation sauces.

All presentation deltas remain zero. The local fixture importer remains loopback-only. None of these presentation assumptions silently upgrades the production catalog.

Visual layers:

- vessel/bread;
- protein: Fleisch or Falafel;
- fresh: Salat, Tomate, Gurke, Zwiebel;
- sauce: Curry, Knoblauch, Scharf.

Motion is feedback only. Prefer transform/opacity. Reduced-motion renders the same final state without decorative travel. Tap/keyboard controls remain the source of interaction.

## D072 — Operations IA

Admin, Ops and KDS will share a Mcello Operations shell and navigation grammar while retaining separate permissions.

Desktop: persistent sidebar + content.
Tablet: compact navigation rail/drawer + content.
Phone: drawer/compact navigation where an operational phone view is allowed.

Staff remains operational-only. Admin retains structural catalog/CMS rights. Visual consolidation must never broaden APIs, RLS or role checks.

## D073 — Integrated Handbook

Canonical help content lives under `docs/projects/mcello/handbook/` as versioned Markdown. Runtime may render an offline/self-hosted searchable handbook and contextual help links. No external wiki SaaS becomes mandatory.

Initial topics:

- Mcello in 5 minutes;
- order lifecycle/KDS;
- Rush/Pause;
- sold-out products/ingredients;
- product/catalog editing;
- opening hours/shop state;
- LAN presentation setup;
- troubleshooting.

## Presentation sequence

`Demo Hub → Smartphone Store → Döner/Yufka Builder → Cart/Checkout → Tablet KDS → Preparing/Ready → Smartphone Status → Admin/Handbook`

The first presentation gate is the Builder: a tap on Fleisch/Falafel, Salat, Tomate, Gurke, Zwiebel or a sauce must create immediate and obvious FoodStage feedback.

## Acceptance gates

A V4 slice is not accepted merely because CI is green. Require, as scope applies:

- real browser screenshot/review;
- desktop 1440×900;
- tablet landscape around 1180×820;
- phone landscape around 844×390;
- phone portrait rotate gate and exact state recovery;
- keyboard/tap path;
- `prefers-reduced-motion` path;
- no business-authority duplication;
- no public claim that stylized assets are real Mcello photography;
- LAN demo remains hostable from the presentation laptop.

## Tool boundary

Adobe/Figma/Canva and similar clients may generate or refine assets. Their outputs are accepted only after they are reviewed and returned to Git/Media/CMS with provenance. If a connector is unavailable, implementation may proceed using the governed repo-native vector fallback; runtime must never depend on the design connector.
