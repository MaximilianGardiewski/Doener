import { LEBTIG_PUBLIC_AUTH_ROUTES } from "../routes/manifest.ts";

export type LebtigPublicRouteId = Extract<
  (typeof LEBTIG_PUBLIC_AUTH_ROUTES)[number],
  { shell: "public" }
>["id"];

export interface LebtigPublicPageCopy {
  eyebrow: string;
  title: string;
  summary: string;
}

/**
 * Deliberately low-claim copy for the portable render shell.
 * Detailed business facts remain in the CMS/donor migration until their
 * provenance has been reviewed for production use.
 */
export const LEBTIG_PUBLIC_PAGE_COPY = {
  home: {
    eyebrow: "Metzgerei Lebtig",
    title: "Willkommen",
    summary: "Der portable Public-Shell ist aktiv. Dynamische Inhalte werden schrittweise über die app-eigenen CMS-Grenzen angebunden.",
  },
  lunch: {
    eyebrow: "Aktuell",
    title: "Mittagstisch",
    summary: "Der Wocheninhalt bleibt ein strukturierter CMS-Baustein und wird im folgenden Editorial-Slice angebunden.",
  },
  offers: {
    eyebrow: "Aktuell",
    title: "Wochenangebote",
    summary: "Angebote bleiben strukturierte, redaktionell veröffentlichte Inhalte und werden nicht als statische Business-Wahrheit dupliziert.",
  },
  "party-service": {
    eyebrow: "Service",
    title: "Partyservice",
    summary: "Diese Route ist aus dem verifizierten Donor-Snapshot übernommen. Formular- und Inhaltsdaten folgen über den kontrollierten CMS-Port.",
  },
  contact: {
    eyebrow: "Kontakt",
    title: "Kontakt & Anfahrt",
    summary: "Veröffentlichte Kontakt- und Standortdaten werden erst aus dem geprüften CMS-/Settings-Pfad ausgespielt.",
  },
  assortment: {
    eyebrow: "Sortiment",
    title: "Sortiment",
    summary: "Der Route-Shell steht. Konkrete Produkt- und Leistungsangaben bleiben bis zur Content-Integrity-Prüfung in der redaktionellen Datenquelle.",
  },
  about: {
    eyebrow: "Über uns",
    title: "Über die Metzgerei",
    summary: "Historie, Team und weitere Unternehmensangaben werden nicht aus UI-Code erfunden, sondern aus bestätigten redaktionellen Quellen übernommen.",
  },
  "news-index": {
    eyebrow: "Aktuelles",
    title: "Aktuelles",
    summary: "Veröffentlichte Beiträge werden im CMS-Slice über Publication-Status und Zeitfenster angebunden.",
  },
  "news-detail": {
    eyebrow: "Aktuelles",
    title: "Beitrag",
    summary: "Die dynamische Slug-Route ist portiert; der veröffentlichte Beitrag wird im CMS-Slice geladen.",
  },
  "recipes-index": {
    eyebrow: "Rezepte",
    title: "Rezepte",
    summary: "Die Rezeptübersicht ist Teil der verifizierten Public-Routen und erhält ihre Inhalte aus der Lebtig-Domain.",
  },
  "recipe-detail": {
    eyebrow: "Rezepte",
    title: "Rezept",
    summary: "Die dynamische Slug-Route ist portiert; konkrete Rezeptinhalte bleiben redaktionell verwaltet.",
  },
  "cms-page": {
    eyebrow: "Seite",
    title: "Inhaltsseite",
    summary: "Freie CMS-Seiten bleiben über stabile app-eigene Slugs adressierbar und werden im CMS-Slice gerendert.",
  },
  privacy: {
    eyebrow: "Rechtliches",
    title: "Datenschutz",
    summary: "Rechtstexte werden nicht neu formuliert. Der bestätigte Inhalt wird im Content-Migrationsschritt übernommen.",
  },
  imprint: {
    eyebrow: "Rechtliches",
    title: "Impressum",
    summary: "Rechtstexte und Betreiberangaben werden nicht aus dem Donor-UI abgeleitet, sondern separat geprüft übernommen.",
  },
} as const satisfies Record<LebtigPublicRouteId, LebtigPublicPageCopy>;
