# Lebtig — Projekt-Governance

Stand: 2026-08-18

Lebtig ist der zweite echte Consumer der BusinessWebFactory und zugleich ein kontrollierter Donor für bereits erprobte Website-/CMS-/Auth-/Media-Muster. Dieser Ordner dokumentiert ausschließlich den im Repository und im verifizierten Donor-Snapshot belegten Portierungsstand.

## Source of truth

Es gelten dieselben Prioritäten wie projektweit:

1. `AGENTS.md` und bestätigte Produktentscheidungen.
2. Git-Code, Migrationen und Tests.
3. verifizierte Portierungs-Evidence.
4. diese abgeleitete Projektdokumentation.

Der verifizierte Donor-Stand ist das verbundene Lovable-Projekt `18d92034-aaee-4d76-8209-393d47b3949c` mit Snapshot `abb54c73f42b784d7c66cd1e1d468b532a67f065`. Lovable bleibt dabei read-only Donor/optionaler Client, nicht Source of Truth und nicht notwendige Runtime.

## Wichtige Dateien

- [`PORTING_BASELINE.md`](./PORTING_BASELINE.md) — belegter Ist-Stand, Grenzen und nächste sichere Port-Slices.
- [`PORTING_ACCEPTANCE.md`](./PORTING_ACCEPTANCE.md) — technische Acceptance für die Konsolidierung in die BusinessWebFactory.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — app-owned und provider-neutrale Zielgrenzen.
- [`../../../apps/lebtig/README.md`](../../../apps/lebtig/README.md) — aktueller Code-/Consumer-Stand.

## Bewusst kein `DECISIONS.md`

Für Lebtig liegt im Repository noch kein vollständiges owner-/discovery-bestätigtes Produkt-Decision-Ledger vor. Deshalb wird hier **kein scheinbar bindendes Produkt-Decision-Ledger erfunden**. Technische Portierungsgrenzen werden in `PORTING_BASELINE.md` dokumentiert. Ein echtes `DECISIONS.md` wird erst angelegt, wenn die relevanten Produkt-/Businessentscheidungen belastbar bestätigt sind.

## Nicht verhandelbar

- keine Business-Fakten, Claims, Preise, Öffnungszeiten, Betreiberinformationen oder Medienrechte erfinden
- keine Admin-/RLS-Sicherheit aus UI-Annahmen ableiten
- keine neue Pflicht-SaaS- oder Builder-Runtime einführen
- keine Production-Mutation und kein Production-Deploy ohne separate ausdrückliche Freigabe
- relevante Portierungsergebnisse müssen in Git, Tests und reproduzierbare Konfiguration zurückfließen
