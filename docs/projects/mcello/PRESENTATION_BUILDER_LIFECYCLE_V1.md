# Mcello Presentation Builder Lifecycle V1

Status: **AUTOMATED LOCAL PRESENTATION GATE**

## Presentation story

The presentation is only considered complete when the Builder output survives the real Mcello commerce lifecycle rather than stopping at visual interaction.

The automated local flow proves:

1. Open **Pizza Mcello**.
2. Start from the five presentation recipe modifiers.
3. Remove `Zwiebeln` and observe the Pizza FoodStage layer count change.
4. Add the configured Pizza through the normal Mcello cart path.
5. Open **Drehspieß im Yufka**.
6. Select the confirmed presentation sauces `Knoblauch` and `Scharf` through normal modifier inputs.
7. Add the configured Yufka through the same cart path.
8. Complete WhatsApp-only local DEV verification and submit the real local order.
9. Confirm the KDS snapshot contains both products and the selected modifier snapshots, including the absence of removed Pizza `Zwiebeln`.
10. Move the same order through `Eingegangen -> In Zubereitung -> Abholbereit -> Abgeholt`.
11. Confirm the customer status surface follows each server-authoritative transition.

## Authority boundary

The lifecycle test does not call an alternate presentation checkout. It uses the normal public UI, cart payload, OTP DEV path, order endpoint, Supabase validation, KDS endpoint/actions and customer status token.

The presentation-only Builder fixture remains limited to the disposable localhost Supabase stack. Prices and production selection rules are not invented by this test.

## Device interaction gate

The separate presentation Builder browser gate proves phone portrait -> landscape rotation with real Pizza modifier state preservation. Builder Responsive V3 additionally covers tablet landscape and desktop layout. Together these checks establish the presentation device matrix without duplicating commerce state.

## Diagnostics

`Mcello Demo Diagnostics` runs, in order:

- Builder visual/interaction browser proof,
- Builder commerce lifecycle proof,
- existing general Mcello presentation flow.

The workflow uploads separate logs for each proof so presentation regressions are diagnosable without weakening the existing generic flow.