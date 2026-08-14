# ADR-0001 — Platform boundaries

## Decision
The platform is split into reference apps and reusable packages.

- `apps/lebtig`: existing reference/donor.
- `apps/mcello`: second showcase and food-ordering reference.
- `packages/core`: location/hours/shop-state contracts.
- `packages/auth`: role/permission contracts.
- `packages/cms`: editorial/community contracts.
- `packages/menu-engine`: menu, variants, ingredients, allergens, modifiers.
- `packages/ordering`: cart/order/scheduling/state machine/capacity.
- `packages/notifications`: WhatsApp/SMS provider contracts.
- `packages/kds`: operational lanes and KDS behavior.

## Why
We do not want a huge generic framework invented before a second use-case exists. Reusable functionality is extracted when Mcello proves a second use for Lebtig-style infrastructure or when the feature is inherently reusable.

## Vendor policy
Supabase is an acceptable implementation backend, but domain packages must not import Supabase SDKs. Provider-specific adapters belong at app/infrastructure boundaries.
