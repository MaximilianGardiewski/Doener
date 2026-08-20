---
name: visual-web-design-engineer
description: Take over an existing web or PWA repository and raise the quality of its real interface — layout, hierarchy, interaction states, motion and responsive behaviour — by changing the actual application, judging every iteration in a running browser, and keeping domain, pricing, availability and checkout authority exactly where the repository already has it.
---

# Visual Web Design Engineer

Use this skill when an application already exists and the job is to make its interface genuinely better: an ordering flow, a configurator, a dashboard, a marketing site, an onboarding wizard. It is a design **and** engineering workflow — the deliverable is working UI in the real repository plus a reviewable branch, never a mockup, a markdown concept or a disconnected prototype.

Do not use it to design a product from scratch with no codebase, to write a visual concept document with no implementation, or as a substitute for a domain-specific skill (see *Companion skills*).

## Core principle

**The running application is the design artifact, and existing domain logic stays authoritative.**

Two failure modes make most of the damage, and both are avoidable:

1. Declaring a design finished from source code, type checks or a green test suite without ever looking at the rendered result.
2. Improving the visuals by quietly re-implementing business truth — prices, validity, availability, permissions, totals — inside presentation code, so the interface and the application can now disagree.

## 1. Read repository truth before designing anything

Do not open a design tool, and do not restyle a screen, before the repository has told you what it already believes.

Read, in this order, whatever the repository actually has:

1. agent/contributor instructions (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`) and the README;
2. any decision ledger, architecture doc, acceptance criteria or evidence log;
3. repo-local skills and their registry;
4. the design system: tokens, typography scale, spacing, radii, motion durations/easings;
5. the test commands in the package/build manifest, and the preview/dev commands;
6. recent history and open branches/PRs touching the same surface.

Then state to yourself which constraints are **binding**. When a repository decision and your brief disagree, the repository wins; say so explicitly rather than silently overriding it. Binding constraints frequently include things a designer would otherwise "fix", for example a deliberate orientation restriction, a mandated disabled-but-visible state, or a motion runtime boundary.

**Check for concurrent work before implementing.** If another branch owns a slice you were about to rewrite, design around it or keep your changes separable.

## 2. Get the real application rendering, with real data

Prefer the repository's own preview/dev command. Only build a harness when the repo-native path cannot reach the state you must design against — for example when the full flow needs a database you do not have.

If you build one, keep it **outside** the repository (a scratch directory), make it serve the **real** application files, and feed it the **repository's own** fixture/seed data rather than data you invented. A harness that serves fake screens teaches you nothing.

Confirm before continuing: the real screen renders, the real data is present, and the flow you must improve can actually be exercised.

## 3. Capture the honest baseline

Before changing anything, render and look at the current state across the viewports that matter, and drive the real flow.

Write down what you actually see, separating:

- what is already good and must survive;
- what is generic (gradient blobs, uniform pill rows, identical radii everywhere, meaningless decoration, everything centred);
- what is broken (overflow, clipped labels, unreachable actions, contradictory states);
- what is slow (taps that should not be needed, information the user must scroll back for).

This baseline is what makes later critique concrete instead of decorative. Screenshots of the pre-change state are worth keeping until the work is done.

## 4. Pick the highest-value problems, not the easiest ones

Rank findings by: broken > slow > unclear > merely unrefined. A control the user cannot see or reach outranks any amount of polish. An action that lies about what it does outranks spacing.

Implement a **vertical slice** of the real flow end to end before generalising anything. Resist building an abstraction until a second real case demands it.

## 5. Keep domain authority where it already is

Presentation code may **read** state and **render** it. It must not decide it.

Practical rules that hold across projects:

- Never compute a second price, total, validity or availability in presentation code. Read the value the application already produced.
- When a presentation layer needs structure, have the **application** publish it — machine-readable attributes derived from its own authoritative model (identifiers, group/option names, deltas, defaults, disabled reasons, category). Then presentation adapters consume that contract.
- Never match on human-facing labels or on a specific product/record name. Name matching is the classic shortcut that turns a presentation adapter into hidden, brittle business logic.
- A visual layer may be enabled by *capabilities resolved from real data* (a category, a declared metadata field, a resolved structural role) — never by `if (thing.name === "…")`.
- If a one-tap shortcut adds something to a cart/queue/record, make it invoke the application's own authoritative action rather than reimplementing it.

**Watch the labels too.** If a shortcut's label describes a state that no longer holds after the user edits something, the shortcut must change or disappear. A button that says one thing and does another is a correctness bug, not a copy nit.

## 6. Iterate in the browser, not in your head

Run this loop, and run it more than twice:

```
implement
  -> render the real screen
  -> interact with it like a user
  -> look at the result and criticise it specifically
  -> change the implementation
  -> render again
```

Each critique pass must be grounded in what was rendered. Useful questions:

- Does this look like *this product*, or like a generated template?
- Is the primary task faster or slower than before?
- Can I answer, without scrolling: what is this, what is in it, what can I change, what is required, what costs more, what is unavailable, what does it cost, what happens next?
- Is anything decorative that carries no meaning?
- Does anything read as the wrong object entirely? (Illustration and iconography routinely fail here — check that the drawing reads as the thing it depicts.)
- Can I complete this one-handed on the smallest supported screen?

Then **change the code**. A critique you did not act on is not a critique.

Two classes of bug are found only by rendering, so look for them deliberately:

- **Silently invalid CSS.** One undefined custom property inside a `color-mix()`/`var()` chain invalidates the whole declaration, so an entire background, colour or layout can vanish while the source looks correct.
- **Fixed/sticky chrome with no reserved space.** A fixed bar covers content and swallows taps at the bottom of the page unless the layout reserves matching room.

## 7. Motion: verify it, do not just write it

Motion should explain state — added, removed, changed, invalid, completed, moved — not prove that animation exists.

Work in this order:

1. Find the existing motion runtime and its ownership markers. Do not introduce a second system writing the same properties.
2. Decide what state change needs explaining, and let everything else be still.
3. Implement with transform/opacity; keep interaction feedback short (roughly 150–450 ms).
4. **Watch it.** Sample computed styles over time or capture mid-transition frames — do not judge timing from source.
5. Differentiate entry from exit. An overshoot that makes an added element feel *placed* makes a removed element feel *wrong*; exits should be shorter and decisive.
6. Verify `prefers-reduced-motion`. Reduced motion is not the same animation slower: decorative motion disappears while state feedback stays instant and legible.
7. Verify the runtime-unavailable path. If the animation library fails to load, every function must still work.

Never let a task depend on an animation completing.

## 8. Accessibility and state legibility

- Every state must be readable without colour and without the illustration: text, labels, or an explicit chip.
- Visible focus, keyboard operability, comfortable touch targets — and never shrink a primary touch target to win layout space; take the space from type and padding instead.
- Give a live text mirror of any rich visual state so it is usable without seeing it.
- Keep unavailable options visible and disabled with a stated reason when the product requires it, instead of deleting them.

## 9. Tool selection: earn every dependency

Prefer few strong, well-bounded tools over many overlapping ones. Walk this ladder and stop at the first "yes":

```
Which capability do I actually need?
  -> Can the repository already do it?            -> use it
  -> Is there a repo-local skill for it?          -> use it
  -> Does a small local dev tool solve it?        -> use it, temporarily
  -> Would an editor/agent plugin or MCP help?    -> use it for this task only
  -> Does it truly need a new runtime dependency? -> analyse, compare, isolated spike, decide with evidence
```

Rules that keep this honest:

- Never adopt a runtime dependency because it is interesting. Adopt it because a specific problem is unreasonably hard with the current stack, and an isolated spike showed a concrete advantage at acceptable cost.
- External design/asset services may accelerate exploration. They must never become a required runtime, build or deployment dependency, and decisions must return to the repository.
- Never introduce a mandatory paid service, a runtime CDN fetch, or a secret without explicit approval.
- Anything used only for exploration should be recorded as such and not left wired into the project.

Report tool decisions in four buckets — used, recommended, experimental, rejected — with a reason each. "Rejected" entries are as valuable as "used" ones; they stop the next agent re-litigating the same choice.

## 10. Two gates, both required

**Technical gate** — discover the commands from the repository (manifest scripts, CI workflow); never assume a fixed command set. Typically: type check, unit/domain tests, integration/schema tests, static checks, build, and any existing browser tests.

**Visual gate** — drive the real UI and record measured results, not impressions:

- small, medium and large mobile widths; at least one landscape phone if the product supports it;
- tablet portrait and landscape; desktop, including a wide one;
- horizontal overflow, per element, not just document scroll width;
- fixed/sticky chrome does not cover or intercept content;
- primary action reachable and correctly sized at every viewport;
- focus visible, keyboard path complete;
- reduced motion, and the animation-runtime-unavailable path;
- zero unexpected console/page errors;
- the real user flow completed end to end, with the resulting state inspected.

Never weaken an assertion to get green. When a test fails because it encodes an assumption your change made obsolete, fix the **implementation** first; only adjust the test when the guarantee is genuinely preserved (or strengthened) in the new shape, and say so in the commit. When a test fails only because your environment has richer or poorer data than it was written for, prove that by running it on unmodified code before concluding anything.

## 11. Deliver something reviewable

- Work on a dedicated branch; never commit or push to the default branch, never force-push, never merge your own PR.
- Read your own diff before pushing and ask: did I duplicate domain logic, hardcode a business fact, invent data, add a runtime dependency, weaken a reduced-motion path, break another system's ownership, or include unrelated files?
- Keep generated artefacts, lockfiles the repo does not track, and scratch harnesses out of the commit.
- Follow the repository's evidence conventions. If it records evidence as prose rather than committed binaries, do that — do not invent a new convention.
- The PR should state: goal, design direction, what changed in the interface, what stayed authoritative, motion and reduced-motion behaviour, accessibility, tests run with outcomes, visual verification with viewports, known limitations, and what still needs an owner decision.

## 12. Autonomy

Decide these yourself: layout, spacing, type scale within the existing system, component naming, animation timing, internal refactors, test additions, responsive fixes, reversible experiments.

Stop and ask only for: production deploys or data mutation, paid provider activation, a new mandatory runtime/SaaS dependency, exposing secrets, irreversible migrations, or overturning a binding product decision.

## Companion skills

This skill is the general workflow. Let domain skills own domain rules and use them together:

- a domain/vertical skill for what the interface must mean in that business (ordering, booking, finance, health, …);
- a QA skill for exhaustive route/viewport matrices;
- a content-integrity skill for claims, media provenance and placeholder honesty;
- a security/permissions skill when the surface touches roles or data boundaries.

If a rule is specific to one product, it belongs in that product's skill, not here.

## Definition of done

- Repository truth was read first, and binding constraints were respected or explicitly flagged.
- Work is isolated on its own branch.
- The real application was changed — no parallel prototype.
- The rendered UI was inspected and exercised in a browser.
- At least two critique passes were made on rendered output **and acted on**.
- Domain, pricing, validity, availability and checkout authority are unchanged.
- Motion was watched, reduced motion verified, runtime-unavailable path verified.
- Technical and visual gates both ran, with results recorded.
- Tool choices are justified, and nothing unnecessary was left wired in.
- The branch and PR are reviewable, and the PR states its own limitations.
