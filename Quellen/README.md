# Doener / BusinessWebFactory — Quellen-Kompass

Stand: 2026-08-18

Dieser Ordner ist der Einstiegspunkt für Menschen und Coding-Agents, die am Doener-Projekt weiterarbeiten. Er sammelt Projektkontext, Roadmap, verbleibende reale Go-live-Inputs und die vorgesehenen Skills/Plugins, **ohne** die bindenden Quell-Dateien zu ersetzen.

## Priorität der Wahrheit

Wenn Informationen widersprüchlich sind, gilt diese Reihenfolge:

1. `docs/projects/*/DECISIONS.md` — bindende bestätigte Produktentscheidungen.
2. `AGENTS.md` — projektweite Arbeitsregeln und Nicht-Verhandelbares.
3. Datenbank-Migrationen, Domain-Code und Tests — tatsächlich implementierte Invarianten.
4. `docs/projects/*/ACCEPTANCE.md`, `V1_EVIDENCE.md` und `ARCHITECTURE.md` — überprüfbarer Ziel-/Evidence-/Architekturstand.
5. `skill-registry.json` und `skills/*/SKILL.md` — kanonische wiederverwendbare Projekt-Skills.
6. Dieser Ordner `Quellen/` — abgeleiteter Überblick und Arbeitskompass.

## Dateien in diesem Ordner

- [`PROJEKTKONTEXT.md`](./PROJEKTKONTEXT.md) — Mission, Architekturprinzipien, harte Grenzen und aktueller Mcello-Kontext.
- [`ROADMAP.md`](./ROADMAP.md) — aktueller VERIFIED-Stand, externe Blocker und priorisierte Weiterarbeit.
- [`V1-GO-LIVE-INPUTS.md`](./V1-GO-LIVE-INPUTS.md) — konkrete First-Party-/Owner-/Provider-Inputs, die die letzten offenen V1-Haken entsperren.
- [`SKILLS-UND-PLUGINS.md`](./SKILLS-UND-PLUGINS.md) — kanonische Repo-Skills und projekt-relevante Tool-/Plugin-Rollen.

## Wichtige kanonische Quellen

- [`../AGENTS.md`](../AGENTS.md)
- [`../skill-registry.json`](../skill-registry.json)
- [`../docs/projects/mcello/DECISIONS.md`](../docs/projects/mcello/DECISIONS.md)
- [`../docs/projects/mcello/ACCEPTANCE.md`](../docs/projects/mcello/ACCEPTANCE.md)
- [`../docs/projects/mcello/V1_EVIDENCE.md`](../docs/projects/mcello/V1_EVIDENCE.md)
- [`../docs/projects/mcello/ARCHITECTURE.md`](../docs/projects/mcello/ARCHITECTURE.md)
- [`../docs/environment.md`](../docs/environment.md)
- [`../.github/workflows/supabase-integration.yml`](../.github/workflows/supabase-integration.yml)
- [`../.github/workflows/selfhost-release.yml`](../.github/workflows/selfhost-release.yml)
- [`../.github/workflows/selfhost-db-drill.yml`](../.github/workflows/selfhost-db-drill.yml)

## Arbeitsregel

GitHub ist der Quellcode- und Review-Referenzpunkt. Lovable, Figma, Visual Truth, Vercel, Claude Code, Codex, Adobe/Canva und andere Assistenten/Builder dürfen beim Erstellen und Prüfen helfen, aber kein wichtiger Projektstand darf ausschließlich in einem dieser Werkzeuge existieren.

**Vor neuer Implementierung immer zuerst `V1_EVIDENCE.md` und `ROADMAP.md` lesen.** Bereits VERIFIED Bausteine werden nicht neu gebaut. Wenn ein offener Punkt in `V1-GO-LIVE-INPUTS.md` steht, ist zunächst der echte Input/die Freigabe erforderlich.

Produktions-Deployment oder Produktionsmutation erfolgen nur nach ausdrücklicher Freigabe. Provider-spezifische Runtime-Abhängigkeiten und neue laufende SaaS-Kosten dürfen nicht stillschweigend eingeführt werden.
