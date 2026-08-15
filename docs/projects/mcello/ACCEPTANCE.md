# Mcello V1 — Acceptance Criteria

Every item maps back to the binding Decision Ledger. Detailed evidence and explicit partial blockers live in `V1_EVIDENCE.md`.

## Brand/Public
- [ ] Modern Warm Premium visual system (`D001`, `D029`)
- [ ] Real Mcello media with production rights confirmed; no fake documentary imagery (`D024`, `D025`)
- [ ] Public navigation and emphasized order CTA (`D030`)
- [ ] Homepage hero, bestseller quick-order, community/news/events, story/team (`D024`)
- [x] Installable browser-compatible PWA (`D060`)
- [ ] Showcase-grade motion without harming usability (`D058`)

## Menu/Configurator
- [ ] Structured categories/products/variants/modifier groups (`D007`, `D008`, `D020`)
- [ ] Ingredient/sauce toggle and explicit extras (`D008`)
- [x] Allergen/dietary label model (`D045`)
- [x] Sold-out products/options visible but disabled (`D035`)
- [x] Timed availability (`D051`)
- [x] Provisional supplied menu seed with provenance + owner-confirmation flag (`D036`)
- [x] Curated/rule-based cross-sells (`D046`)

## Ordering
- [x] Pickup ASAP + preorder slots (`D005`, `D009`)
- [x] 15-minute slot capacity (`D039`)
- [ ] Closed/paused/cutoff browse/configure/cart but no submit (`D037`, `D044`, `D052`)
- [x] Cart persistence + revalidation (`D038`)
- [x] Minimal checkout data (`D018`, `D048`)
- [ ] WhatsApp OTP primary + SMS fallback (`D003`)
- [x] Development OTP can run without external paid messaging (`D064`)
- [ ] No paid messaging provider activated without explicit owner approval (`D064`)
- [x] Pay on site (`D004`)
- [x] Binding only on KDS acceptance (`D042`)
- [x] Edit/cancel pre-accept only (`D043`)
- [x] Configurable default 5-min acceptance timeout (`D053`)

## KDS
- [x] Repeating incoming alarm + multi-device sync (`D014`, `D049`)
- [x] One-click accept/time -> preparation (`D010`)
- [x] Quick reject reasons (`D011`)
- [x] Ready + completed states (`D010`)
- [x] Rush/pause and item/ingredient snooze (`D012`, `D013`)
- [x] Planned future lane + configurable activation lead (`D055`)
- [x] +5/+10/+15/custom delay + customer update (`D056`)

## Customer status
- [ ] Live status/order summary/pickup location (`D015`)
- [x] Target time + approximate countdown (`D054`)
- [ ] WhatsApp/SMS status notifications (`D016`)
- [ ] Route + call actions (`D017`)

## CMS/Roles
- [ ] Admin full catalog/content control (`D020`)
- [x] Staff operational-only role (`D021`)
- [x] Safe homepage section ordering/toggling (`D031`)
- [x] Event/Special/Presse/News scheduling + pinning (`D032`)
- [x] Gallery categories + featured media (`D033`)
- [x] Server/database role enforcement (`D022`, `D023`)

## Infrastructure / Portability
- [x] Local development backend runs using Supabase CLI/Docker without a managed paid project (`D063`)
- [ ] Staging/production path is reproducible on self-hosted infrastructure from Git + migrations (`D063`)
- [x] V1 does not depend on Lovable or Vercel to build, run or deploy (`D063`)
- [ ] Production self-host plan includes TLS, secrets, firewalling, backups, restore test and monitoring (`D063`)

## Prepared now
- [x] Payment provider boundary (`D004`)
- [x] Delivery fulfillment/zone contracts with no V1 delivery UI (`D006`)
- [x] Future web/counter/table order source contract (`D027`)
- [x] Future effort-weight capacity field (`D040`)
- [x] Analytics/recommendation event data (`D047`, `D050`)
- [x] Location boundary while Mcello UI stays single-location (`D057`)