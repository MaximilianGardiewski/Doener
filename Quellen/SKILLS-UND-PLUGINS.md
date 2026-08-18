# Skills & Plugins — Projekt-Matrix

Stand: 2026-08-18

## Grundsatz

Die **kanonischen Projekt-Skills** liegen im Repository und werden über `skill-registry.json` gefunden. Externe Apps/Plugins/Coding-Agents sind Werkzeuge, nicht Source of Truth und nicht automatisch Runtime-Abhängigkeiten.

Aktueller operativer Default für Mcello-Engineering ist: **GitHub als Source of Truth + Supabase/PostgreSQL als Adapter/Integrationsebene + Repo-Skills + automatisierte Node/Chromium-/Self-host-Gates**. Design-/Builder-Tools werden nur dort zugeschaltet, wo sie einen klaren Vorteil bringen; ihr Ergebnis muss zurück ins Repo.

## Kanonische Repo-Skills

| Skill | Aufgabe | Pfad |
|---|---|---|
| `business-website-discovery-interviewer` | strukturiertes Discovery-Interview, bestätigte Antworten in bindende Decisions überführen | `skills/business-website-discovery-interviewer/SKILL.md` |
| `business-web-cms-builder` | moderne CMS-backed Business-Website mit Rollen, wiederkehrenden Inhalten, Migration, SEO, Accessibility | `skills/business-web-cms-builder/SKILL.md` |
| `gastro-ordering-experience-designer` | visuelles, mobile-first Gastro-Bestellerlebnis über bestehender server-/domainautoritativer Menu-/Modifier-/Pricing-Logik; FoodStage, Originals, Tap-first, Visual-Integrity und Visual Gates | `skills/gastro-ordering-experience-designer/SKILL.md` |
| `cms-v1-accelerator` | schnelle, produktionsorientierte V1-Vertical-Slices für CMS-Websites | `skills/cms-v1-accelerator/SKILL.md` |
| `legacy-web-migration-engineer` | bestehende Websites/URLs/Inhalte/Forms/SEO sauber migrieren | `skills/legacy-web-migration-engineer/SKILL.md` |
| `multi-page-business-site-architect` | klare route-basierte Informationsarchitektur statt überladener One-Pager | `skills/multi-page-business-site-architect/SKILL.md` |
| `public-content-integrity-auditor` | Claims, Metadaten, Bilder, Alt-Texte und Fakten gegen Quellen prüfen | `skills/public-content-integrity-auditor/SKILL.md` |
| `responsive-route-qa-engineer` | provider-neutrale Build-/Lint-/Route-/Mobile-/Overflow-/Console-QA | `skills/responsive-route-qa-engineer/SKILL.md` |
| `supabase-rls-security-auditor` | Auth, Rollen, RLS, Functions, Storage und privilegierte Zugriffe härten | `skills/supabase-rls-security-auditor/SKILL.md` |
| `web-app-portability-architect` | Portabilität zwischen Buildern, Hosts, Datenbanken und Coding-Tools absichern | `skills/web-app-portability-architect/SKILL.md` |
| `web-release-launch-engineer` | Release, Migration, Backup, DNS, Smoke Tests, Rollback und Launch-Härtung | `skills/web-release-launch-engineer/SKILL.md` |

`skill-registry.json` ist die kanonische Registry. Neue wiederverwendbare Skills gehören ins Repo und in diese Registry; sie dürfen nicht nur in einem einzelnen Chat oder Agentenprofil existieren.

## Projekt-relevante Apps/Plugins/Tools

### GitHub — **Pflicht für Source of Truth / Review**

Einsatz:
- Repository lesen/schreiben
- Branches und Pull Requests
- Review/CI-Status
- Issues/Projektkontext, wenn genutzt

Regel: Ein Agenten- oder Builder-Stand gilt erst als projektfähig, wenn die relevanten Änderungen im Git-Repo nachvollziehbar sind. Acceptance-/Evidence-Haken werden erst nach grüner Runtime-/DB-/Browser-Evidenz gesetzt.

### Supabase — **Backend-Adapter + Self-hostbarer Runtime-Baustein**

Einsatz:
- PostgreSQL/Migrationen
- Auth/RLS
- Realtime
- Storage
- lokale Integration über CLI/Docker

Regeln:
- Domain bleibt Supabase-unabhängig.
- RLS/DB-Invarianten schützen kritische Grenzen zusätzlich zur Application Layer.
- `service_role` niemals in Browsercode.
- Storage-Objekte über die Storage API schreiben/löschen; SQL verwaltet Metadaten/Referenzen/Invarianten.
- Änderungen mit echtem lokalen Stack/Integrationstests beweisen.
- Managed Supabase darf nicht still zur notwendigen kostenpflichtigen Voraussetzung werden; Self-Host-Pfad bleibt erhalten.

### Figma — **Designsystem und High-Fidelity-Design**

Einsatz:
- visuelle Richtung
- Komponenten/Layouts
- Designsystem-Übergabe
- ggf. Design-to-Code-Referenz

Regel: Figma ist Designquelle, aber nicht alleinige Quelle für Produktentscheidungen oder Business-Inhalte. Relevante Tokens/Entscheidungen müssen in implementierbarer Form zurück ins Repo.

### Lovable — **optionaler UI-/Prototyping-Client**

Einsatz:
- schnelle UI-Varianten
- Prototyping
- visuelle Exploration

Regel: Keine Architektur darf Lovable zum zwingenden Build-/Runtime-/Deployment-Abhängigkeitspunkt machen (`D063`, `D070`). Nutzbare Ergebnisse werden ins Git-Repo überführt.

### Visual Truth — **optionaler visueller Code-Editor**

Einsatz:
- lokale React/Web-UI visuell selektieren, verschieben, skalieren und restylen
- schnelles UI-Finetuning mit anschließendem Code-Handoff

Regel: Nur für kompatible lokale UI und nur so, dass der endgültige Code im Repo landet. Keine versteckte Parallelquelle.

### Vercel — **optionale Preview-/Deployment-Hilfe**

Einsatz:
- Preview-Deployments
- Browser-Verifikation
- Hosting nur, wenn bewusst gewählt

Regel: V1 darf nicht davon abhängen. Der Self-Host-Pfad auf vorhandener Infrastruktur bleibt reproduzierbar (`D063`). Keine automatische Production-Veröffentlichung.

### Claude Code / Codex / andere Coding-Agents — **Implementierungs-Clients**

Einsatz:
- Code schreiben/reviewen
- Tests und Audits
- Refactoring
- Agent-zu-Agent-Handoffs

Regeln:
- `AGENTS.md`, Decision Ledger, `V1_EVIDENCE.md`, `Quellen/ROADMAP.md` und Repo-Skills zuerst lesen.
- keine bereits VERIFIED Slices neu bauen.
- keine stillen Scope-Änderungen.
- keine „fertig“-Meldung ohne Tests/Evidenz.
- wichtige Entscheidungen nicht nur im Chat behalten.
- Branch/PR statt unreviewter Production-Änderung.

### Canva / Adobe — **optionale Asset- und Content-Workflows**

Einsatz:
- Art Direction/Moodboards und Brand-Exploration
- freigegebene Marketing-/Social-/Bildassets
- Varianten/Retusche/Formatanpassungen
- Photography-/Ingredient-Asset-Aufbereitung für visuelle Ordering-Flows

Regeln:
- Medienrechte, Provenienz und Content-Integrity beachten.
- keine erfundenen „authentischen“ Mcello-Bilder oder Claims.
- Konzept-/AI-Food darf nicht als dokumentarisch echtes Mcello-Gericht ausgegeben werden (`D068`).
- Assets müssen in den vorgesehenen Media-/CMS-Prozess überführt werden.
- reale Produkt-/Venue-Fotos erst nach First-Party-/Rechtefreigabe als Mcello-Realität veröffentlichen.
- kein Adobe-/Canva-Tool wird Runtime-Pflicht (`D070`).

## Empfohlene Skill-/Tool-Kombination je Phase

| Phase | Primäre Skills | Hilfstools |
|---|---|---|
| Discovery/Scope | discovery-interviewer | GitHub, optional Recherche |
| Domain/Vertical Slice | cms-v1-accelerator, portability-architect | GitHub, Supabase |
| DB/Auth/RLS/Storage | supabase-rls-security-auditor | Supabase, GitHub CI |
| Public IA/Migration | multi-page architect, legacy migration | GitHub, ggf. Figma |
| Gastro Store / Interactive Builder | gastro-ordering-experience-designer + responsive QA + content-integrity | GitHub, Figma, Adobe, ggf. Canva/Lovable/Visual Truth |
| Visual Polish | CMS builder + responsive QA | Figma, Lovable, Visual Truth, ggf. Adobe/Canva |
| Content Release | public-content-integrity-auditor | CMS/Media-Workflow + First-Party-Quellen |
| Launch | web-release-launch-engineer + responsive QA | GitHub CI, Self-host Release/DB Drill, optional Preview |

## Aktuelle Gate-Kette

Für relevante Mcello-Slices wird je nach Scope kombiniert:

- normale CI: Domain-/Schema-/Evidence-Guards, Build und echte Chromium-Smokes
- Supabase Integration: kompletter DB-Rebuild + reale PostgREST/RPC/Auth/RLS/Realtime/Storage-Flows
- Self-host Release: non-root/read-only Container, Health, Production-Preflight
- Self-host DB Drill: Migration-Dry-Run sowie echter Dump/Drop/Restore-Roundtrip
- Design-Slices: zusätzlich reale Desktop/Mobile-Screenshots, Visual Acceptance und die in `DESIGN_ACCEPTANCE.md` definierten Gates

Nicht jeder reine Dokumentations-Slice braucht alle Runtime-/DB-/Release-Gates. Runtime-/DB-/Release-Änderungen müssen aber die jeweils betroffene Gegenprobe erhalten. Ein grüner technischer Test ersetzt keine visuelle Abnahme; ein schönes Mockup ersetzt keinen technischen Nachweis (`D069`).

## Nicht verhandelbare Tool-Grenzen

- Kein Tool darf bestätigte `IMPLEMENT_V1`-Decisions still streichen.
- `PREPARE_NOW_IMPLEMENT_LATER` heißt: Boundary/Contract/Data Model jetzt, Future-UI später.
- Keine Provider-Credentials oder Secrets in Git/Frontend.
- Keine Pflichtkosten ohne explizite Entscheidung/Freigabe.
- Keine Production-Mutation ohne explizite Freigabe.
- Keine ungeprüften Drittquellen als Production-Business-Wahrheit.
- Jede relevante Builder-/Agentenänderung muss zurück in Git + Tests + Dokumentation.
- Adobe/Figma/Canva/Lovable/Visual Truth und ähnliche Design-Clients bleiben optional und dürfen keine Parallelquelle bzw. Runtime-Pflicht werden (`D070`).
