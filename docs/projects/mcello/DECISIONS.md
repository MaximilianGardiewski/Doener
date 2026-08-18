# Mcello — Binding Decision Ledger

Source: interactive discovery interview, 2026-08-14; D003/D016/D064 clarified by owner on 2026-08-18.

Status semantics:
- `IMPLEMENT_V1`: must be implemented before V1 is considered complete.
- `PREPARE_NOW_IMPLEMENT_LATER`: architecture/contracts/data model/interfaces prepared now; visible feature later.
- `LATER_OPTION`: recorded but not required in V1.

| ID | Topic | Decision | Status |
|---|---|---|---|
| D001 | Brand | Modern Warm Premium: darker anthracite layout, warm premium accents, large warm real food photography, clean fast-casual usability. | `IMPLEMENT_V1` |
| D002 | Ordering | Own independent ordering system on the Mcello website; no third-party marketplace required for the core flow. | `IMPLEMENT_V1` |
| D003 | Verification | Mcello V1 uses WhatsApp only for anti-fake verification: the customer receives a one-time key/code through WhatsApp and must verify it before order submission. There is no SMS fallback in V1. | `IMPLEMENT_V1` |
| D004 | Payment | V1 is pay on pickup/on-site (cash/card). Payment architecture must allow online payment later. | `PREPARE_NOW_IMPLEMENT_LATER` |
| D005 | Fulfillment | V1 supports pickup plus preorder for later pickup. Delivery comes later. | `IMPLEMENT_V1` |
| D006 | Delivery | Delivery zones/PLZ/radius must be architecturally possible later without rewriting the order core. | `PREPARE_NOW_IMPLEMENT_LATER` |
| D007 | Menu UX | Hybrid ordering-app layout: sticky category rail, prominent bestseller/highlight cards, structured configurator for mains, compact drinks/sides. | `IMPLEMENT_V1` |
| D008 | Configurator | Ingredients and sauces are structured choices; standard ingredients can be toggled on/off; paid extras are modeled explicitly. | `IMPLEMENT_V1` |
| D009 | Scheduling | Customer chooses ASAP or a later available pickup slot. | `IMPLEMENT_V1` |
| D010 | KDS Workflow | Three-step operational flow: incoming alarm -> accept via time/slot button and enter preparation; ready; completed. | `IMPLEMENT_V1` |
| D011 | KDS Reject | Orders can be rejected using one-click predefined reasons such as overload, sold out, kitchen closing. | `IMPLEMENT_V1` |
| D012 | Rush Mode | KDS has pause/rush controls to pause online ordering or alter operational timing. | `IMPLEMENT_V1` |
| D013 | Item Snooze | Staff can mark products or ingredients sold out for today with one click. | `IMPLEMENT_V1` |
| D014 | KDS Alarm | Incoming order emits repeating audible alert until actively handled; handling on one device clears the alert on synced devices. | `IMPLEMENT_V1` |
| D015 | Customer Status | After OTP/order submission customer lands on live status page with progress, order number, summary and pickup address. | `IMPLEMENT_V1` |
| D016 | Customer Push | Mcello V1 sends customer confirmation/status links, relevant status updates and the final ready notification through WhatsApp only. SMS is not an active or fallback channel in V1. | `IMPLEMENT_V1` |
| D017 | Status Actions | Live status page includes Google Maps route button and call-Mcello button. | `IMPLEMENT_V1` |
| D018 | Checkout Data | V1 checkout asks for first name, mobile number and optional free-order comment only. | `IMPLEMENT_V1` |
| D019 | Customer Accounts | Email receipts/accounts/favorites/reorder are later options, not V1 blockers. | `LATER_OPTION` |
| D020 | Admin Menu | Admin/inheritor can fully edit categories, products, descriptions, images, prices, reusable ingredient/sauce/extra groups. | `IMPLEMENT_V1` |
| D021 | Staff Permissions | Staff/theken role is operational only: orders, rush/pause, sold-out. No structural/menu price editing. | `IMPLEMENT_V1` |
| D022 | Reuse | Reuse Lebtig backend/auth/RLS/media/admin/UI foundations pragmatically, but build Mcello branding/order/configurator/KDS/OTP as separated modules. | `IMPLEMENT_V1` |
| D023 | Platform | Architecture must be D-ready: reusable core from day one; Mcello + Lebtig become platform examples. | `IMPLEMENT_V1` |
| D024 | Homepage | Homepage hero + premium claim + visible bestsellers/quick order + sticky order CTA; below it community/news/events + story/team. | `IMPLEMENT_V1` |
| D025 | Venue Focus | Mcello is positioned primarily as a real local venue/community place with quality and personality; ordering is outstanding but not the only identity. | `IMPLEMENT_V1` |
| D026 | Positioning | Emotional value combines owner/personality, atmosphere, food/craft/quality, selection, terrace/bistro, community/events and juice offering. | `IMPLEMENT_V1` |
| D027 | In-store Ordering | V1 ordering interface is customer-online only. Counter/table ordering through same core may come later. | `PREPARE_NOW_IMPLEMENT_LATER` |
| D028 | Reservations | No table reservation system in V1. | `LATER_OPTION` |
| D029 | Brand Palette | Keep existing logo/recognition; reinterpret premium: anthracite base, amber/gold primary accent, existing green used selectively. | `IMPLEMENT_V1` |
| D030 | Public Navigation | Start · Speisekarte & Bestellen · Über Mcello · Aktuelles & Events · Galerie · Kontakt & Anfahrt, with emphasized order CTA/mobile access. | `IMPLEMENT_V1` |
| D031 | CMS Layout | Owner can show/hide and reorder controlled homepage sections; not unrestricted page-builder freedom. | `IMPLEMENT_V1` |
| D032 | News CMS | Content types Event/Special/Presse/News with start/end scheduling and pinned/highlight behavior. | `IMPLEMENT_V1` |
| D033 | Gallery | Gallery categories Food/Lokal/Team/Events plus featured images. Instagram integration may come later. | `IMPLEMENT_V1` |
| D034 | Instagram | Instagram/social integration should be possible later but not required for V1. | `LATER_OPTION` |
| D035 | Sold Out UX | Sold-out products remain visible but disabled and clearly labeled; sold-out ingredient options remain visible/disabled with alternatives where appropriate. | `IMPLEMENT_V1` |
| D036 | Seed Menu | Current supplied menu-card images are imported as provisional seed data; owner must confirm prices/names/ingredients before go-live. | `IMPLEMENT_V1` |
| D037 | Closed Shop | When shop is closed, customers may browse/configure/build cart but cannot submit. Phone/WhatsApp are shown as fallback contact routes. | `IMPLEMENT_V1` |
| D038 | Cart Persistence | Configured cart persists locally across closed periods; availability/prices are revalidated before later submit. | `IMPLEMENT_V1` |
| D039 | Capacity V1 | V1 has per-15-minute pickup-slot capacity limits. | `IMPLEMENT_V1` |
| D040 | Capacity Future | Order/product kitchen-effort weights can later drive smarter capacity. | `PREPARE_NOW_IMPLEMENT_LATER` |
| D041 | Printing | V1 KDS is paperless tablet-only. Optional kitchen printer later; possibly multiple print targets afterward. | `LATER_OPTION` |
| D042 | Binding Acceptance | Submitted/verified order is only 'received'; it becomes binding only when Mcello accepts it in KDS and confirms pickup timing. | `IMPLEMENT_V1` |
| D043 | Pre-accept Edits | Customer may edit/cancel while waiting for acceptance. After acceptance, website changes are locked; changes go through phone/WhatsApp. | `IMPLEMENT_V1` |
| D044 | Shop State | Shop state derives from opening hours but has manual overrides: open, closed, pause/rush, today closed plus operator message. | `IMPLEMENT_V1` |
| D045 | Allergens | Structured ingredient/allergen model plus voluntary dietary labels (vegetarian/vegan/spicy) with clear distinction from mandatory allergen data. | `IMPLEMENT_V1` |
| D046 | Upselling | V1 supports admin-curated 'pairs well with' plus rule-based category/ingredient upselling. | `IMPLEMENT_V1` |
| D047 | Recommendations | Data-driven 'frequently ordered together'/personalized recommendations come later; store enough order data to enable them. | `PREPARE_NOW_IMPLEMENT_LATER` |
| D048 | Comments | Because payment is on-site in V1, free-form special-request comments are allowed even if they may imply extra cost; structured options remain preferred. | `IMPLEMENT_V1` |
| D049 | Multi-device | KDS must run on multiple devices with live synchronized state. | `IMPLEMENT_V1` |
| D050 | Analytics | Store analytics-ready order/event data now; detailed analytics UI can come later. | `PREPARE_NOW_IMPLEMENT_LATER` |
| D051 | Timed Availability | Admin can schedule product/category/special availability by weekday, time and date range; staff sold-out override sits above it. | `IMPLEMENT_V1` |
| D052 | Order Cutoff | Online order cutoff before kitchen close is admin-configurable (e.g. 15/30/45 min). | `IMPLEMENT_V1` |
| D053 | Acceptance Timeout | Default acceptance timeout is 5 minutes, admin-configurable; warn/escalate then auto-reject and notify customer if untouched. | `IMPLEMENT_V1` |
| D054 | ETA UX | Accepted order shows both target pickup clock time and approximate countdown. | `IMPLEMENT_V1` |
| D055 | Scheduled KDS | Future pickup orders live in a 'Geplant' lane and move into active workflow using configurable preparation lead time. | `IMPLEMENT_V1` |
| D056 | Delay Handling | KDS has +5/+10/+15/custom delay controls; new ETA updates live and triggers customer notification. | `IMPLEMENT_V1` |
| D057 | Location | Mcello UI is single-location. Core should retain location boundary so future multi-location customers do not require a rewrite. | `PREPARE_NOW_IMPLEMENT_LATER` |
| D058 | Wow Level | Showcase target is luxury-app + cinematic-food + tech-app wow; motion must remain fast, premium and non-gimmicky. | `IMPLEMENT_V1` |
| D059 | Tone | Copy tone: premium/quiet + warm/personal with occasional relaxed street-food moments. | `IMPLEMENT_V1` |
| D060 | Public PWA | Public Mcello experience is installable PWA while remaining fully usable in browser. | `IMPLEMENT_V1` |
| D061 | Future Loyalty | Favorites/reorder/push/loyalty may use the PWA foundation later. | `LATER_OPTION` |
| D062 | Scope Rule | Every confirmed interview decision is binding according to its explicit V1/prepared/later status. | `IMPLEMENT_V1` |
| D063 | Infrastructure Cost | Development and deployment must introduce no mandatory new monthly SaaS cost. Use local Supabase via Docker for development and a self-hosted Supabase/app deployment on already-available infrastructure for staging/production. GitHub is source of truth; Vercel/Lovable are optional clients only. | `IMPLEMENT_V1` |
| D064 | External Messaging Spend | Mcello V1 messaging is WhatsApp-only. No paid WhatsApp provider may be silently enabled; development uses the local OTP provider, while production WhatsApp activation requires explicit owner approval of unavoidable carrier/provider charges. SMS must not be configured, exposed or invoked by Mcello V1. | `IMPLEMENT_V1` |
