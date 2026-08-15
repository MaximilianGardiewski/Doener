# Mcello — Architecture

## Strategy
Mcello is the second real reference implementation. Reuse Lebtig's proven technical concepts, not butcher-specific content/branding.

## Boundaries
```text
browser/PWA
   +-- venue/CMS UI
   +-- menu/configurator
   +-- cart/checkout
   +-- live order status
   +-- staff/admin shell
   +-- KDS
          |
          v
application services/adapters
          |
  +-------+---------+----------------+
  |                 |                |
Postgres/Auth      Notification     Payment
RLS/Realtime       provider         provider (later)
```

Domain packages must not depend on Lovable, Supabase SDK, Twilio/Meta, Stripe or a specific host.

## Media boundary
Gallery originals live in the private `mcello-media` bucket. Browser uploads use
the authenticated admin JWT and Storage RLS; the service-role key never reaches
the browser. Application-owned `media_assets` and `gallery_items` rows carry
category, provenance, rights confirmation, alt text, publication window and
featured ordering. Public pages receive only approved media IDs and load bytes
through `/api/media/:id`, which re-checks the published metadata before streaming
the private object. This keeps storage-provider paths out of public content data
and preserves a portable application-owned media contract.

## Recommendation boundary
V1 recommendations are deterministic business configuration, not profiling.
`product_cross_sells` stores owner-curated product pairs. Location-scoped
`cross_sell_rules` can react to a product category or to an explicitly selected
modifier option and target one product or a category. The public contract emits
only rules whose trigger and target still resolve to published catalog data;
availability and sold-out state continue to come from the current menu snapshot.
The browser resolves the same contract in the configurator and cart, while all
structural writes remain admin-only and are transactionally saved with the
product editor. No recommendation rows are inferred or seeded from provisional
Mcello data.

## Lebtig reuse candidates
- profiles + explicit role rows
- bootstrap admin invariant
- last-admin guard
- private media + app streaming route
- CMS publish/scheduling conventions
- admin layout/forms
- RLS-first authorization
- Playwright route/auth QA
- redirects/sitemap/environment docs

## Order state
```text
draft
 -> awaiting_verification
 -> waiting_for_acceptance
      -> rejected
      -> cancelled
      -> scheduled (accepted future order)
      -> preparing (accepted ASAP)
scheduled -> preparing
preparing -> ready
ready -> completed
```

Acceptance is the binding boundary.

## V1/future boundaries
V1 exposes pickup only and pay-on-site only. Fulfillment/payment contracts are designed for later delivery/online payment. Mcello UI is single-location while domain entities retain `locationId`.
