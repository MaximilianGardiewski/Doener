# Mcello V1 — Acceptance Criteria

Every item maps back to the binding Decision Ledger.

## Brand/Public
- [ ] Modern Warm Premium visual system (`D001`, `D029`)
- [ ] Real Mcello media with production rights confirmed; no fake documentary imagery (`D024`, `D025`)
- [ ] Public navigation and emphasized order CTA (`D030`)
- [ ] Homepage hero, bestseller quick-order, community/news/events, story/team (`D024`)
- [ ] Installable browser-compatible PWA (`D060`)
- [ ] Showcase-grade motion without harming usability (`D058`)

## Menu/Configurator
- [ ] Structured categories/products/variants/modifier groups (`D007`, `D008`, `D020`)
- [ ] Ingredient/sauce toggle and explicit extras (`D008`)
- [ ] Allergen/dietary label model (`D045`)
- [ ] Sold-out products/options visible but disabled (`D035`)
- [ ] Timed availability (`D051`)
- [ ] Provisional supplied menu seed with provenance + owner-confirmation flag (`D036`)
- [x] Curated/rule-based cross-sells (`D046`)

## Ordering
- [ ] Pickup ASAP + preorder slots (`D005`, `D009`)
- [ ] 15-minute slot capacity (`D039`)
- [ ] Closed/paused/cutoff browse/configure/cart but no submit (`D037`, `D044`, `D052`)
- [ ] Cart persistence + revalidation (`D038`)
- [ ] Minimal checkout data (`D018`, `D048`)
- [ ] WhatsApp OTP primary + SMS fallback (`D003`)
- [ ] Development OTP can run without external paid messaging (`D064`)
- [ ] No paid messaging provider activated without explicit owner approval (`D064`)
- [x] Pay on site (`D004`)
- [ ] Binding only on KDS acceptance (`D042`)
- [ ] Edit/cancel pre-accept only (`D043`)
- [ ] Configurable default 5-min acceptance timeout (`D053`)

## KDS
- [ ] Repeating incoming alarm + multi-device sync (`D014`, `D049`)
- [ ] One-click accept/time -> preparation (`D010`)
- [ ] Quick reject reasons (`D011`)
- [ ] Ready + completed states (`D010`)
- [ ] Rush/pause and item/ingredient snooze (`D012`, `D013`)
- [ ] Planned future lane + configurable activation lead (`D055`)
- [ ] +5/+10/+15/custom delay + customer update (`D056`)

## Customer status
- [ ] Live status/order summary/pickup location (`D015`)
- [ ] Target time + approximate countdown (`D054`)
- [ ] WhatsApp/SMS status notifications (`D016`)
- [ ] Route + call actions (`D017`)

## CMS/Roles
- [ ] Admin full catalog/content control (`D020`)
- [ ] Staff operational-only role (`D021`)
- [ ] Safe homepage section ordering/toggling (`D031`)
- [ ] Event/Special/Presse/News scheduling + pinning (`D032`)
- [x] Gallery categories + featured media (`D033`)
- [ ] Server/database role enforcement (`D022`, `D023`)

## Infrastructure / Portability
- [ ] Local development backend runs using Supabase CLI/Docker without a managed paid project (`D063`)
- [ ] Staging/production path is reproducible on self-hosted infrastructure from Git + migrations (`D063`)
- [ ] V1 does not depend on Lovable or Vercel to build, run or deploy (`D063`)
- [ ] Production self-host plan includes TLS, secrets, firewalling, backups, restore test and monitoring (`D063`)

## Prepared now
- [x] Payment provider boundary (`D004`)
- [ ] Delivery fulfillment/zone contracts with no V1 delivery UI (`D006`)
- [ ] Future web/counter/table order source contract (`D027`)
- [ ] Future effort-weight capacity field (`D040`)
- [x] Analytics/recommendation event data (`D047`, `D050`)
- [x] Location boundary while Mcello UI stays single-location (`D057`)
