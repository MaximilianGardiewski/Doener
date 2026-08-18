# Mcello — First Presentation Readiness

Stand: 2026-08-18

## Ziel

Erste Mcello-Vorstellung am 2026-08-18, Zielzeitfenster ungefähr **13:42–15:42 CEST**. Bis dahin hat ein stabiler, nachvollziehbarer Demo-Flow Vorrang vor zusätzlichem Feature-Scope in Lebtig oder neuen Plattformmodulen.

Das Ziel ist eine **ehrliche Produktdemo**, kein behaupteter Production-Go-live. Fehlende First-Party-Daten, reale Medien, finales Logo und ein freigegebener Production-WhatsApp-Transport bleiben sichtbar als Go-live-Inputs dokumentiert und werden nicht erfunden.

## Kanonischer Demo-Flow

1. **Homepage** — Modern-Warm-Premium, Navigation, Quick-Order und Venue-/Community-Struktur zeigen.
2. **Speisekarte & Konfigurator** — Produkt auswählen, strukturierte Optionen demonstrieren, Warenkorb aufbauen.
3. **Pickup** — ASAP oder Vorbestellslot zeigen; Kapazität und Shop-State kurz erklären.
4. **Checkout** — Vorname, Mobilnummer, optionaler Kommentar; Zahlung vor Ort.
5. **WhatsApp-Key** — V1 ist WhatsApp-only. In der lokalen Demo erzeugt der kostenfreie Development-OTP-Provider den einmaligen Code, ohne echte Nachricht oder Paid Provider. Kein SMS-Fallback.
6. **Bestellung empfangen** — nach Verifikation landet die Bestellung zunächst nicht bindend in `waiting_for_acceptance`.
7. **KDS** — Bestellung akzeptieren, Zielzeit setzen, optional Delay zeigen, anschließend Ready.
8. **Kundenstatus** — Statusseite, Fortschritt, Ordernummer, Summary und ETA zeigen.
9. **Optional Admin/CMS** — nur wenn Zeit bleibt: Katalog-/Verfügbarkeits-/Content-Control-Plane kurz zeigen.

## Präsentations-Gates

Vor der Vorstellung sollen mindestens folgende Nachweise auf demselben Git-Head grün sein:

- `npm run check`
- Mcello Preview-Build
- Desktop- und Mobile-Chromium-Smokes
- vollständiger lokaler Supabase-Integrationslauf für Ordering/KDS
- Self-host Release Gate
- WhatsApp-only Messaging-Spend-Boundary-Test

Präsentationskritische Browserfehler, Konsolenfehler, horizontaler Overflow, kaputte Navigation oder ein unterbrochener Ordering/KDS/Status-Flow werden vor neuen Features behoben.

## Was in der Demo nicht behauptet werden darf

- kein Production-Go-live oder Production-Deployment
- keine finale Mcello-Adresse/Telefonnummer, solange nicht First-Party bestätigt
- keine final bestätigten Menü-/Zutaten-/Saucen-Daten, solange `owner_confirmed=false`
- keine dokumentarisch echten Mcello-Fotos ohne freigegebene Originalmedien/Rechte
- kein finales Logo, solange das Original-Asset fehlt
- keine echte WhatsApp-Zustellung, solange Provider/Kosten/Credentials nicht separat freigegeben und integriert sind
- kein SMS-Fallback in Mcello V1

## Scope bis zur Vorstellung

**Priorität:** Mcello-Demo stabilisieren und die bereits vorhandenen Kernflüsse vorzeigbar machen.

**Geparkt:** der nächste Lebtig-Wochenangebote-CMS-Slice und andere nicht präsentationskritische Erweiterungen. Die Branch-Vorbereitung darf bestehen bleiben, wird aber erst nach dem Mcello-Demo-Gate fortgesetzt.
