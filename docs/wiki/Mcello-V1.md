# Mcello V1

## Zielbild

Mcello ist die Gastro-Referenzanwendung der BusinessWebFactory. V1 soll eine eigenständige, hochwertige digitale Customer Journey vom Einstieg bis zur abgeholten Bestellung abbilden und gleichzeitig einen belastbaren operativen Pfad für Küche/Admin liefern.

Kanonischer Demo-Flow:

`Homepage → Speisekarte/Konfigurator → Warenkorb/Pickup → WhatsApp-Key → Bestellung empfangen → KDS akzeptieren/Status ändern → Live-Status → optional Admin/CMS`

## Technisch bereits verifiziert

### Ordering / Operations

- first-party Ordering
- Pickup ASAP + Vorbestellslots
- atomare Slot-Kapazität
- serverseitige Cart-Revalidation
- Checkout + freie Hinweise
- KDS Accept/Reject/Preparing/Ready/Completed
- Rush/Pause/Snooze/Delay
- Multi-Device Realtime
- Öffnungszeiten, Cutoff und Admin Overrides

### Menu / CMS / Admin

- Kategorien, Produkte, Preise und Beschreibungen
- Modifier-/Zutaten-/Saucen-/Extra-Gruppen
- Produktmedien mit Rollenboundary
- Allergene und Dietary Labels
- Cross-Sells
- zeitgesteuerte Verfügbarkeit
- Homepage-Sektionen
- News/Events Scheduling
- Galerie-Control-Plane

### Public Experience / Platform

- Modern-Warm-Premium Designsystem
- responsive Public Experience
- PWA
- provider-neutrale Payment-, Delivery-, Analytics- und Location-Boundaries
- Auth/RLS/RPC/Storage-Grenzen
- Self-host Release-, Migration-, Backup- und Restore-Pfad

## Aktueller Designfokus

Die technische V1-Basis bleibt bestehen. Der aktuelle Ausbau konzentriert sich auf:

- Public Experience vs. Commerce Mode
- Store V2
- Interactive Food Builder / `FoodStage`
- `Genau so` + vorbefülltes `Anpassen`
- Pizza- und Döner/Yufka-Präsentation
- Cart/Checkout/Status Polish
- GSAP Motion V3 innerhalb der bestehenden Ownership-Grenzen
- Visual Acceptance, Responsive, Accessibility und Performance

Wichtig: Der Builder darf Domain-Autorität nicht übernehmen. Pricing, Availability, Modifier-Gültigkeit und Order-State bleiben in den bestehenden autoritativen Schichten.

## Noch echte Go-live-Inputs nötig

Die verbleibenden V1-Haken sind zu großen Teilen reale Inputs/Freigaben und keine fehlende Grundarchitektur:

- bestätigte Adresse
- Telefonnummer / WhatsApp-Kontakt
- explizit freigegebener Production-WhatsApp-Provider samt Kosten
- owner-bestätigte Produkte, Zutaten, Saucen und Extras
- finales Logo
- echte freigegebene Mcello-Fotos und Bildrechte
- bestätigte Owner-/Team-/Story-Fakten

Siehe [`Quellen/V1-GO-LIVE-INPUTS.md`](../../Quellen/V1-GO-LIVE-INPUTS.md).

## Verbindliche Detailquellen

- [`DECISIONS.md`](../../docs/projects/mcello/DECISIONS.md)
- [`ACCEPTANCE.md`](../../docs/projects/mcello/ACCEPTANCE.md)
- [`V1_EVIDENCE.md`](../../docs/projects/mcello/V1_EVIDENCE.md)
- [`ARCHITECTURE.md`](../../docs/projects/mcello/ARCHITECTURE.md)
- [`DESIGN_MASTERPLAN.md`](../../docs/projects/mcello/DESIGN_MASTERPLAN.md)
- [`DESIGN_ACCEPTANCE.md`](../../docs/projects/mcello/DESIGN_ACCEPTANCE.md)
- [`ART_DIRECTION.md`](../../docs/projects/mcello/ART_DIRECTION.md)
- [`BRAND_SYSTEM.md`](../../docs/projects/mcello/BRAND_SYSTEM.md)
