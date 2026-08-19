# Skills & Tools

> Kanonische Detailmatrix: [`Quellen/SKILLS-UND-PLUGINS.md`](../../Quellen/SKILLS-UND-PLUGINS.md)

## Grundregel

**Repo-Skills und GitHub sind die dauerhafte Projektbasis.** Externe Apps, Plugins, Builder und Coding-Agents sind Werkzeuge. Ihr Ergebnis muss als Code, Asset, Decision, Test oder Dokumentation zurück ins Repository gelangen.

## Kanonische Repo-Skills

Aktuell unter anderem:

- `business-website-discovery-interviewer`
- `business-web-cms-builder`
- `gastro-ordering-experience-designer`
- `cms-v1-accelerator`
- `legacy-web-migration-engineer`
- `multi-page-business-site-architect`
- `public-content-integrity-auditor`
- `responsive-route-qa-engineer`
- `supabase-rls-security-auditor`
- `web-app-portability-architect`
- `web-release-launch-engineer`

`skill-registry.json` ist die kanonische Registry. Wiederverwendbare neue Projekt-Skills gehören ins Repo und nicht ausschließlich in einen Chat oder ein Agentenprofil.

## Tool-Rollen

### GitHub

**Pflicht für Source of Truth und Review.**

- Branches / PRs
- Code und Dokumentation
- Review / CI
- Issues und nachvollziehbare Historie

### Supabase / PostgreSQL

**Backend-Adapter und Integrationsebene.**

- Migrationen
- Auth / RLS
- Realtime
- Storage
- lokaler Integrationstack

Domain-Logik bleibt möglichst Supabase-unabhängig; `service_role` gehört niemals in Browsercode.

### Adobe / Firefly

**Bevorzugte visuelle Arbeitsfläche für aktuelle Mcello-Designarbeit.**

- Art Direction
- Moodboards
- Food-/Venue-/Builder-Exploration
- Asset-Aufbereitung

AI-/Konzeptbilder dürfen nicht als dokumentarisch echte Mcello-Produkte ausgegeben werden. Akzeptierte Assets und Tokens müssen zurück in den kontrollierten Repo-/Media-Pfad.

### Figma

**Optionales Spezialwerkzeug.** Sinnvoll bei großem High-Fidelity-Redesign, komplexem Designsystem oder kollaborativer Prototyparbeit. Kein Pflichtschritt und keine Runtime-Abhängigkeit.

### Lovable / Visual Truth

Optionale UI-/Prototyping-Clients. Nutzbare Ergebnisse müssen im Repo landen; kein Lock-in als Build- oder Runtime-Pflicht.

### Vercel

Optionale Preview-/Deployment-Hilfe. Der reproduzierbare Self-host-Pfad bleibt unabhängig davon erhalten.

### Claude Code / Codex / andere Coding-Agents

Implementierungs- und Review-Clients. Vor Arbeit zuerst Decisions, Evidence, Roadmap, AGENTS und relevante Repo-Skills lesen. Keine VERIFIED Slices neu bauen.

### Canva

Optional für Content-, Marketing- und Präsentationsmaterial. Keine Source of Truth und keine Runtime-Pflicht.

## Design- und Motion-Regel

Für Mcello gilt aktuell:

- vorhandene Architektur und `FoodStage`-/GSAP-Ownership respektieren
- keine zweite Motion-Runtime ohne belegten Mehrwert
- Reduced Motion als harte Grenze
- visuelle Qualität im echten Browser bewerten
- Design-Tool-Ergebnis erst dann projektgültig, wenn es im Repo umgesetzt/dokumentiert ist

## Nicht verhandelbar

- keine Secrets in Git/Frontend
- keine neue Pflichtkosten-/SaaS-Runtime ohne explizite Entscheidung
- keine Production-Mutation ohne explizite Freigabe
- keine ungeprüften Drittquellen als Production-Business-Wahrheit
- keine externen Designzustände als notwendige Build-/Runtime-Quelle
