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

## Location boundary

Mcello V1 intentionally exposes one location per application instance. The
provider-neutral `SingleLocationContext` resolves that location from server
configuration and rejects a different location supplied by a checkout client.
Public menu, slots, analytics, KDS and admin routes all use the same resolved
boundary; the browser has no location selector.

Every reusable domain contract continues to carry `locationId`. PostgreSQL
keeps location ownership immutable and enforces same-location linkage for
categories/products, modifiers, availability, snoozes, recommendations,
analytics, media/gallery/editorial content and order products, including
privileged service writes that bypass RLS. A future multi-location shell can
therefore replace the single-location resolver without changing the core entity
and persistence contracts.

## Payment boundary

`packages/payments` owns provider-neutral payment semantics. Mcello V1 uses
`PayOnSiteOnlyPaymentPolicy`: after server-side cart repricing, checkout creates
a payment snapshot for the exact order amount with `pay_on_site`,
`cash_or_card`, `due_on_site` and `EUR`. A client-requested `online` mode is
rejected by the application boundary before an order is persisted.

PostgreSQL independently defaults existing/new V1 orders to the same state and
`orders_v1_payment_boundary` prevents online/provider payment state even for
privileged service-role writes. The public bearer-token status contract exposes
only payment mode/method/status/currency; provider references are never public.
The customer UI renders this as `Vor Ort · bar oder Karte`.

A future online implementation plugs into the `OnlinePaymentProvider` contract
and requires an explicit database migration that replaces the V1 constraint.
No concrete provider, SDK, checkout URL or paid service is part of V1.

## Order-source boundary

The reusable order model and PostgreSQL enum intentionally recognize `web`,
`counter` and `table`. Mcello V1 exposes only the customer web ordering flow:
`CheckoutRequest` has no source selector and the checkout service writes
`source: web` itself. Even an extra client payload field therefore cannot turn a
public checkout into a counter/table order.

Counter/table remain prepared future origins for a dedicated authenticated
operational interface. They do not require a second order state machine or new
order tables when implemented later.

## Capacity-effort boundary

V1 slot admission remains deliberately simple: 15-minute slots compare
`acceptedOrderCount` with the configured numeric slot capacity. Optional
`effortWeight` metadata is not consulted by that decision.

The product domain now carries the optional weight, checkout passes it as
prepared metadata, and PostgreSQL snapshots the authoritative product
`effort_weight` into `order_items.effort_weight_snapshot` at insert time. The
trigger overwrites any client/application-provided snapshot value, so historical
orders retain the actual configured weight at order time. A later weighted
capacity policy can therefore aggregate durable snapshots without changing the
V1 algorithm today.

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
V1 exposes pickup only, web-origin customer ordering and pay-on-site only. Delivery, counter/table entry, weighted capacity and online payment are prepared through stable contracts/data boundaries but remain inactive until later decisions explicitly enable them. Mcello UI is single-location while domain entities retain and enforce `locationId`.
