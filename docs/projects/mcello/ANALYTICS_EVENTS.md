# Mcello analytics event contract (D047, D050)

V1 prepares provider-neutral, analytics-ready data. It does not add a tracking SaaS, personalization, or an analytics dashboard.

## Stored events

| Event | Purpose | Structured references |
|---|---|---|
| `menu_view` | Menu reach | location, pseudonymous session |
| `product_view` | Product interest | product |
| `recommendation_impression` | Recommendation visibility | source product, suggested product, optional rule, surface |
| `recommendation_select` | Recommendation interaction | source product, suggested product, optional rule, surface |
| `cart_add` | Cart intent | product |
| `checkout_started` | Checkout funnel | location, pseudonymous session |
| `order_submitted` | Successful order attribution | order; recorded by the server only |

## Privacy and security boundary

- No name, mobile number, email address, IP address, order comment, item comment, user-agent, or free-form metadata is stored.
- A random, ephemeral page-session UUID is used as a pseudonymous identifier. It is neither persisted in browser storage nor used as an authentication/customer identifier.
- Browser calls terminate at the application server. `anon` and `authenticated` roles have neither table access nor RPC execution rights.
- The server validates a fixed event allowlist, UUID shape, same-location product/rule references, a bounded timestamp window, and a per-session request limit.
- `client_event_id` makes retries idempotent.
- Detailed reporting and personalization stay deferred. Existing `order_items` provide the future source for real product co-occurrence instead of invented recommendations.
