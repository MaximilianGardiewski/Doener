# Doener / BusinessWebFactory Wiki

> Einstieg für Menschen, Coding-Agents und Design-Tools. Dieses Wiki erklärt den Projektstand und verweist auf die kanonischen Quellen im Repository. Es ersetzt weder Decision Ledger noch Tests, Migrationen, Acceptance oder Evidence.

**Stand:** 19.08.2026  
**Kanonischer Integrationsbranch:** `main`  
**Main-Snapshot beim Anlegen:** `e09a4466deafc49a22c9b7336d3a738068775240`

## Was ist Doener?

`Doener` ist das Repository der **BusinessWebFactory**: einer vendor-neutralen Plattform für wiederverwendbare Business-Websites und operative Business-Apps. **Mcello** ist aktuell die umfangreichste Referenzanwendung und beweist insbesondere Gastro-, Ordering-, KDS-, CMS-, PWA- und Self-host-Slices. **Lebtig** dient als zweiter Consumer/Donor für die Wiederverwendbarkeit der gemeinsamen Plattformbausteine.

## Schnellnavigation

- [Projektüberblick](./Project-Overview.md)
- [Mcello V1](./Mcello-V1.md)
- [Architektur](./Architecture.md)
- [Roadmap](./Roadmap.md)
- [Skills & Tools](./Skills-and-Tools.md)

## Aktueller Schwerpunkt

Die technische Mcello-V1-Basis wird **nicht neu gebaut**. Der aktuelle Fokus liegt auf der visuellen und interaktiven Qualität von Public Experience, Store und Interactive Food Builder, ohne die bestehenden Domain-, Pricing-, Availability-, Ordering- oder Security-Grenzen zu verschieben.

Zum Zeitpunkt dieses Wiki-Starts sind insbesondere folgende Design-/Motion-Arbeiten offen bzw. in Review:

- PR #91 — **Design: Mcello interactive configurator experience**
- PR #84 — **Mcello D074 — GSAP cart confirmation migration**

Aktuelle Merge- und Review-Wahrheit immer direkt in GitHub prüfen.

## Source of Truth

Bei Widersprüchen gilt die im Quellen-Kompass definierte Priorität. Besonders wichtig:

1. [`docs/projects/mcello/DECISIONS.md`](../../docs/projects/mcello/DECISIONS.md)
2. [`AGENTS.md`](../../AGENTS.md)
3. Migrationen, Domain-Code und Tests
4. [`ACCEPTANCE.md`](../../docs/projects/mcello/ACCEPTANCE.md), [`V1_EVIDENCE.md`](../../docs/projects/mcello/V1_EVIDENCE.md), [`ARCHITECTURE.md`](../../docs/projects/mcello/ARCHITECTURE.md)
5. [`skill-registry.json`](../../skill-registry.json) und `skills/*/SKILL.md`
6. [`Quellen/`](../../Quellen/README.md) und dieses Wiki als abgeleitete Orientierung

## Wichtige Einstiege

- [`README.md`](../../README.md) — Repository-Überblick und lokaler Start
- [`Quellen/README.md`](../../Quellen/README.md) — Quellen-Kompass
- [`Quellen/ROADMAP.md`](../../Quellen/ROADMAP.md) — aktuelle Arbeitsreihenfolge
- [`Quellen/V1-GO-LIVE-INPUTS.md`](../../Quellen/V1-GO-LIVE-INPUTS.md) — echte Owner-/Provider-Inputs
- [`Quellen/SKILLS-UND-PLUGINS.md`](../../Quellen/SKILLS-UND-PLUGINS.md) — Tool- und Skill-Rollen

## Harte Projektgrenzen

- GitHub/Repo bleibt Source of Truth.
- Keine bereits VERIFIED Slices neu bauen.
- Keine stillen Scope- oder Produktentscheidungen.
- Keine Secrets in Git oder Browsercode.
- Keine neue kostenpflichtige Runtime-Abhängigkeit ohne explizite Freigabe.
- Kein Production-Deploy und keine Production-Mutation ohne separate ausdrückliche Freigabe.
- Adobe, Figma, Canva, Lovable, Vercel, Claude Code, Codex und ähnliche Werkzeuge sind Clients/Hilfsmittel — keine Parallelquelle.
