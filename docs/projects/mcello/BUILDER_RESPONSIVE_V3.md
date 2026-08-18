# Mcello Builder Responsive V3

Status: **IMPLEMENTED PRESENTATION/INTERACTION CONTRACT**

## Purpose

The Builder is one domain-backed configurator with device-specific composition. Desktop, tablet and smartphone do not receive separate pricing, availability or selection logic.

## Binding device contract

- Desktop: full Builder works in the available viewport without an orientation restriction.
- Smartphone and Tablet: the Builder works only in **Querformat**.
- Portrait on a touch device shows a deliberate Mcello rotate gate instead of a squeezed configurator.
- Rotating portrait → landscape or landscape → portrait causes **kein Reload und kein Verlust** of the current input selection. The existing DOM inputs/domain state remain mounted and authoritative.
- The normal shop outside the open Builder remains responsive in portrait and landscape.

## Interaction contract

Touch landscape is a focused Food-Workbench rather than a scaled-down desktop modal:

1. FoodStage stays permanently visible on the left.
2. Controls stay on the right.
3. Existing modifier groups become guided steps.
4. Exactly one modifier step is visually focused at a time on touch landscape.
5. `Zurück` and `Weiter` only navigate presentation steps; they never calculate prices or mutate modifier values.
6. `Fertig` focuses the existing authoritative add-to-cart action.
7. Tap is sufficient for every required action. Drag and hover are never required.
8. Primary controls retain the existing touch-target contracts.
9. Smartphone landscape uses compact typography/padding when vertical space is short.
10. Safe-area insets are respected on all four sides.

## State and authority

`builder-core-v2.js` may decorate and navigate existing modifier markup only. It must not own:

- product price,
- modifier price deltas,
- selection validity,
- product availability,
- cart persistence,
- checkout validation,
- backend order state.

Those remain in the existing application/domain/server paths. Rotation only changes presentation datasets (`builderDevice`, `builderOrientation`, `builderStepCurrent`).

## Accessibility

The rotate gate has an explicit accessible label and live state. A user can return to the shop from the gate without rotating. Guided step labels expose the real modifier-group name and the current `x / n` progress. Reduced-motion users keep the existing reduced-motion path.

## Presentation relevance

This contract is the base for the Pizza and Döner/Yufka presentation builders. Their visual adapters may look different, but both inherit the same responsive/orientation/navigation rules so the demo behaves consistently on desktop, tablet and smartphone.