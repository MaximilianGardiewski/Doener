# Mcello V1 — Acceptance Criteria

Every item maps back to the binding Decision Ledger. Detailed evidence and explicit partial blockers live in `V1_EVIDENCE.md`. Visual/detail acceptance is additionally expanded in `DESIGN_ACCEPTANCE.md`.

## Brand/Public
- [x] Modern Warm Premium visual system (`D001`)
- [ ] Existing logo/recognition with premium anthracite/amber/selective-green reinterpretation (`D029`)
- [ ] Real Mcello media with production rights confirmed; no fake documentary imagery (`D024`, `D025`)
- [x] Public navigation and emphasized order CTA (`D030`)
- [x] Homepage hero, highlight/quick-order, community/news/events, story/team (`D024`)
- [x] Installable browser-compatible PWA (`D060`)
- [x] Showcase-grade motion without harming usability (`D058`)
- [x] Public copy tone: premium/quiet + warm/personal with restrained street-food moments (`D059`)
- [ ] Public Experience and Commerce Mode are visually distinct but use one Mcello brand system (`D067`)
- [ ] Concept/generated/stylized imagery is never presented as documentary Mcello reality; final real media has first-party provenance/rights (`D068`)
- [ ] Required owner visual gates and Mobile/Desktop screenshot evidence are completed (`D069`)

## Menu/Configurator
- [ ] Structured categories/products/variants/modifier groups with owner-confirmed Mcello configuration (`D007`, `D008`)
- [ ] Ingredient/sauce toggle and explicit extras (`D008`)
- [x] Allergen/dietary label model (`D045`)
- [x] Sold-out products/options visible but disabled (`D035`)
- [x] Timed availability (`D051`)
- [x] Provisional supplied menu seed with provenance + owner-confirmation flag (`D036`)
- [x] Curated/rule-based cross-sells (`D046`)
- [ ] Interactive `FoodStage` reflects relevant structured choices while price/availability remain domain/server authoritative (`D065`)
- [ ] Builder is complete with Tap-only interaction; drag-and-drop is never required (`D065`)
- [ ] Mcello Originals support `Genau so` and prefilled `Anpassen` from the actual standard recipe (`D066`)
- [ ] Builder presentation layers use one coherent warm editorial cartoon-food language and remain explicitly illustrative rather than documentary Mcello media (`D071`)

## Ordering
- [x] Own independent first-party ordering core; no third-party marketplace required (`D002`)
- [x] Pickup ASAP + preorder slots (`D005`, `D009`)
- [x] 15-minute slot capacity (`D039`)
- [ ] Closed shop still allows browse/configure/cart but blocks submit and shows confirmed fallback contacts (`D037`)
- [x] Shop state derives from schedule with admin-only force-open plus closed/pause/rush/today-closed overrides and operator message (`D044`)
- [x] Admin-configurable online-order cutoff before scheduled close (`D052`)
- [x] Cart persistence + revalidation (`D038`)
- [x] Minimal checkout data (`D018`, `D048`)
- [ ] WhatsApp one-time key/code verification with no SMS fallback (`D003`)
- [x] Development OTP can run without external paid messaging (`D064`)
- [x] No paid WhatsApp provider activated without explicit owner approval (`D064`)
- [x] Mcello V1 production configuration rejects SMS messaging (`D064`)
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
- [ ] KDS, Ops and Admin use one adaptive Mcello Operations information architecture without weakening role/RLS boundaries (`D072`)

## Customer status
- [ ] Live status/order summary/pickup location (`D015`)
- [x] Target time + approximate countdown (`D054`)
- [ ] WhatsApp status/ready notifications (`D016`)
- [ ] Route + call actions (`D017`)

## CMS/Roles
- [x] Admin full catalog control: categories, products, descriptions, images, prices and reusable ingredient/sauce/extra groups (`D020`)
- [x] Staff operational-only role (`D021`)
- [x] Safe homepage section ordering/toggling (`D031`)
- [x] Event/Special/Presse/News scheduling + pinning (`D032`)
- [x] Gallery categories + featured media (`D033`)
- [x] Server/database role enforcement for admin/staff boundaries (`D020`, `D021`)
- [ ] Searchable integrated Admin/Staff handbook is rendered from versioned Git/Markdown content with contextual help and no external wiki runtime dependency (`D073`)

## Infrastructure / Portability
- [x] Reuse documented Lebtig foundations through shared packages without app-to-app coupling (`D022`)
- [x] Shared core remains reusable / Product-D-ready through workspace package boundaries (`D023`)
- [x] Binding Decision Ledger coverage/status discipline is enforced in CI (`D062`)
- [x] Local development backend runs using Supabase CLI/Docker without a managed paid project (`D063`)
- [x] Staging/production path is reproducible on self-hosted infrastructure from Git + migrations (`D063`)
- [x] V1 does not depend on Lovable or Vercel to build, run or deploy (`D063`)
- [x] Production self-host plan includes TLS, secrets, firewalling, backups, restore test and monitoring (`D063`)
- [ ] Adobe/Figma/Canva/Lovable and similar tools remain optional clients; relevant outputs return to Git/Media/CMS and no design tool becomes runtime-critical (`D070`)

## Prepared now
- [x] Payment provider boundary (`D004`)
- [x] Delivery fulfillment/zone contracts with no V1 delivery UI (`D006`)
- [x] Future web/counter/table order source contract (`D027`)
- [x] Future effort-weight capacity field (`D040`)
- [x] Analytics/recommendation event data (`D047`, `D050`)
- [x] Location boundary while Mcello UI stays single-location (`D057`)
