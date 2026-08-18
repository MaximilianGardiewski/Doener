# Mcello — Design Rebaseline Evidence

Stand: 2026-08-18

Dieses Addendum dokumentiert ausschließlich den neuen Design-/Product-Experience-Scope ab D065. Es ändert keine bereits verifizierte technische V1-Evidenz in `V1_EVIDENCE.md` und markiert D065-D070 **nicht** als implementiert.

## Baseline

- kanonisches Repo: `MaximilianGardiewski/Doener`
- Integrationsbranch: `main`
- letzter präsentationskritischer Baseline-Fix: PR #51 `fix: harden Mcello LAN launcher on real Windows laptop`
- Merge-SHA: `0952f97474c40f9589388e8a589d61ac76a89822`
- PR #51 hatte vor Merge grüne `CI`- und `Mcello Demo Diagnostics`-Runs sowie keine offenen Review-Threads.

Der Design-Rebaseline-Branch `agent/mcello-design-rebaseline` wurde exakt von diesem Merge-SHA abgeleitet.

## Scope-Evidenz

| Decision | Status | Nachweis | Bemerkung |
|---|---|---|---|
| D065 | `OPEN` | `DESIGN_MASTERPLAN.md`, `DESIGN_ACCEPTANCE.md`, `USER_JOURNEYS.md`, `skills/gastro-ordering-experience-designer/SKILL.md`, `tests/mcello-design-rebaseline.test.mjs` | Interactive Food Builder ist bindend definiert; die eigentliche `FoodStage`-/Runtime-Implementierung folgt in separaten Slices. |
| D066 | `OPEN` | dieselben Designquellen + Journey `Mcello Original` | `Genau so`/vorbefülltes `Anpassen` ist bindend; technische Produktintegration folgt. |
| D067 | `OPEN` | `DESIGN_MASTERPLAN.md`, `DESIGN_ACCEPTANCE.md`, Roadmap | Experience Mode vs Commerce Mode ist bindend; Homepage/Store V2 folgen separat. |
| D068 | `OPEN` | `DESIGN_MASTERPLAN.md`, `DESIGN_ACCEPTANCE.md`, Skill | Visual Content Integrity ist als Release-/Design-Grenze definiert; finale reale Assets bleiben owner-/rights-abhängig. |
| D069 | `OPEN` | `DESIGN_ACCEPTANCE.md`, `DESIGN_MASTERPLAN.md` | Gates A-H und Pflicht-Screenshotset sind definiert; Abnahmen folgen mit den jeweiligen UI-Slices. |
| D070 | `OPEN` | `DECISIONS.md`, `SKILLS-UND-PLUGINS.md`, `DESIGN_MASTERPLAN.md` | Adobe/Figma/Canva/Lovable bleiben optionale Clients; keine Runtime-/Deployment-Pflicht. |

## D062 Coverage-Erweiterung

`tests/decision-ledger-coverage.test.mjs` wurde im Rebaseline-Branch von **D001-D064** auf **D001-D070** erweitert. Damit wird nach Merge weiterhin erzwungen:

- exakt sequenzielle, eindeutige Decision-IDs;
- explizite Acceptance/Evidence-Abbildung jedes `IMPLEMENT_V1`-Punkts;
- doppelte Prepared-Abbildung für `PREPARE_NOW_IMPLEMENT_LATER`;
- kein stilles Hochstufen von `LATER_OPTION`;
- keine unbekannten Decision-Referenzen in Acceptance/Evidence.

Hinweis: Die ältere D062-Zeile in `V1_EVIDENCE.md` beschreibt den vor diesem Rebaseline gültigen Stand D001-D064. Für den neuen Scope ist dieses Addendum die ergänzende aktuelle Evidenz; der technische Guard selbst ist auf D001-D070 angehoben.

## Tool-Verifikation in dieser Arbeitsrunde

- GitHub: Lesen, Branch/PR/CI und Repo-Schreiboperationen funktionieren.
- Adobe: Connector initialisiert; Adobe-Toolrouting ist verfügbar. Der Font-Recommendation-Helper antwortete bei zwei Versuchen mit HTTP-400-Parameter-Validierung; der Rebaseline hängt deshalb nicht von diesem einzelnen Helper ab.
- Figma: Connector-Verbindung wurde erfolgreich verifiziert; konkrete Editier-/Erstellfähigkeit hängt vom verfügbaren Seat/den Berechtigungen ab.
- Canva: Connector-Verbindung funktioniert; Suche nach bestehenden Mcello-Designs lieferte keine vorhandenen Designs.

Diese Toolzustände sind Workflow-Evidenz, keine Runtime-Abhängigkeit von Mcello.

## Nächster Nachweis

Dieser Slice ist abgeschlossen, wenn sein Pull Request:

1. den Diff gegen aktuellen `main` transparent zeigt;
2. den neuen Decision-Coverage-Guard grün ausführt;
3. keine Runtime-/DB-/Production-Mutation enthält;
4. reviewbar bestätigt, dass D065-D070 **offen** bleiben und nicht als bereits implementiert ausgegeben werden.
