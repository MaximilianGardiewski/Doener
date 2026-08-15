# Doener / BusinessWebFactory — Quellen-Kompass

Stand: 2026-08-15

Dieser Ordner ist der Einstiegspunkt für Menschen und Coding-Agents, die am Doener-Projekt weiterarbeiten. Er sammelt Projektkontext, Roadmap und die vorgesehenen Skills/Plugins, **ohne** die bindenden Quell-Dateien zu ersetzen.

## Priorität der Wahrheit

Wenn Informationen widersprüchlich sind, gilt diese Reihenfolge:

1. `docs/projects/*/DECISIONS.md` — bindende bestätigte Produktentscheidungen.
2. `AGENTS.md` — projektweite Arbeitsregeln und Nicht-Verhandelbares.
3. Datenbank-Migrationen, Domain-Code und Tests — tatsächlich implementierte Invarianten.
4. `docs/projects/*/ACCEPTANCE.md` und `ARCHITECTURE.md` — überprüfbarer Ziel-/Architekturstand.
5. `skill-registry.json` und `skills/*/SKILL.md` — kanonische wiederverwendbare Projekt-Skills.
6. Dieser Ordner `Quellen/` — abgeleiteter Überblick und Arbeitskompass.

## Dateien in diesem Ordner

- [`PROJEKTKONTEXT.md`](./PROJEKTKONTEXT.md) — Mission, Architekturprinzipien, harte Grenzen und aktueller Mcello-Kontext.
- [`ROADMAP.md`](./ROADMAP.md) — priorisierte Weiterarbeit und Nachweisregeln.
- [`SKILLS-UND-PLUGINS.md`](./SKILLS-UND-PLUGINS.md) — kanonische Repo-Skills und projekt-relevante Tool-/Plugin-Rollen.

## Wichtige kanonische Quellen

- [`../AGENTS.md`](../AGENTS.md)
- [`../skill-registry.json`](../skill-registry.json)
- [`../docs/projects/mcello/DECISIONS.md`](../docs/projects/mcello/DECISIONS.md)
- [`../docs/projects/mcello/ACCEPTANCE.md`](../docs/projects/mcello/ACCEPTANCE.md)
- [`../docs/projects/mcello/ARCHITECTURE.md`](../docs/projects/mcello/ARCHITECTURE.md)
- [`../docs/environment.md`](../docs/environment.md)
- [`../.github/workflows/supabase-integration.yml`](../.github/workflows/supabase-integration.yml)

## Arbeitsregel

GitHub ist der Quellcode- und Review-Referenzpunkt. Lovable, Figma, Visual Truth, Vercel, Claude Code, Codex und andere Assistenten/Builder dürfen beim Erstellen und Prüfen helfen, aber kein wichtiger Projektstand darf ausschließlich in einem dieser Werkzeuge existieren.

Produktions-Deployment oder Produktionsmutation erfolgen nur nach ausdrücklicher Freigabe. Provider-spezifische Runtime-Abhängigkeiten und neue laufende SaaS-Kosten dürfen nicht stillschweigend eingeführt werden.
