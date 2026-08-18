# Mcello Operations Grundlagen

## Was dieses Handbuch ist
Das Mcello-Handbuch ist die integrierte Hilfe für Betrieb, KDS und Admin. Die Markdown-Dateien im Git-Repository sind die kanonische Quelle. Die Anwendung rendert diese Inhalte lokal und self-hosted; ein externes Wiki ist nicht erforderlich.

## Rollen und Rechte
Navigation und Handbuchanzeige ändern keine Berechtigungen. Backend-Autorisierung, PostgreSQL/RLS und bestehende Page-/API-Grenzen bleiben maßgeblich.

- Staff arbeitet operativ mit Betrieb, KDS, Rush/Pause und Sold-out.
- Admin darf zusätzlich strukturelle Katalog-, Content-, Media-, Label- und Zeitplanänderungen durchführen.
- Zugang zu einer Hilfeseite ist niemals ein Berechtigungsnachweis.

## Shop-Zustände
Mcello leitet den normalen Zustand aus Öffnungszeiten ab und erlaubt klar begrenzte operative Overrides.

- Open: neue Online-Bestellungen sind möglich, sofern weitere Regeln dies zulassen.
- Rush: Online-Bestellungen bleiben offen; neue ASAP-Zeitversprechen erhalten den konfigurierten Puffer.
- Pause: neue Online-Bestellungen werden blockiert.
- Closed/Heute geschlossen: Kunden dürfen weiter stöbern und konfigurieren, aber nicht absenden.

## Bestellwahrheit
Eine verifizierte Kundenbestellung ist zunächst nur empfangen. Sie wird erst durch die KDS-Akzeptanz mit bestätigter Abholzeit bindend. Preise, Verfügbarkeit, Kapazität und zulässige Modifier werden serverseitig revalidiert.

## Messaging V1
Mcello V1 ist WhatsApp-only. Es gibt keinen SMS-Fallback. In Entwicklung wird der lokale DEV-OTP-Provider benutzt; ein bezahlter Produktionsprovider darf nicht ohne ausdrückliche Freigabe aktiviert werden.