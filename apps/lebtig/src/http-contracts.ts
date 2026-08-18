import { LEBTIG_PUBLIC_AUTH_ROUTES } from "./routes/manifest.ts";

const LEGACY_PAGE_TARGETS = new Map<string, string>([
  ["/startseite", "/"],
  ["/ueber-uns", "/ueber-uns"],
  ["/ueber-uns/f-markenbetrieb", "/ueber-uns"],
  ["/ueber-uns/produktion", "/ueber-uns"],
  ["/ueber-uns/galerie", "/ueber-uns"],
  ["/unser-sortiment", "/sortiment"],
  ["/partyservice", "/partyservice"],
  ["/mittagstisch", "/mittagstisch"],
  ["/wochenangebot", "/wochenangebote"],
  ["/rezepte", "/rezepte"],
  ["/kontakt", "/kontakt"],
  ["/kontakt/oeffnungszeiten", "/kontakt"],
  ["/kontakt/anfahrt", "/kontakt"],
  ["/impressum", "/impressum"],
]);

export const LEBTIG_LEGACY_RECIPE_SLUGS = [
  "Angebratenes-Tatar-Steak",
  "Apfel-Rindfleisch",
  "Boeuf-bourguignon",
  "Bunter-Rindfleisch-Eintopf",
  "Chili-con-Carne",
  "Doppelte-Kraftbruehe",
  "Gepoekelte-Rinderbrust",
  "Hackfleisch-Suppe",
  "Klare-Rindfleischbruehe",
  "Ochsenschwanz-Ragout",
  "Pfeffer-Steaks",
  "Pichelsteiner-Eintopf",
  "Polnischer-Rindfleischsalat",
  "Rheinischer-Sauerbraten",
  "Rindegeschnetzeltes-mit-Champignons",
  "Rindfleisch-Pfanne",
  "Rindsrouladen",
  "Salat-mit-Rinderfiletspitzen",
  "Schlemmergulasch",
  "Ungarisches-Kesselgulasch",
  "Wiener-Tafelspitz",
] as const;

const LEGACY_RECIPE_LOOKUP = new Set(LEBTIG_LEGACY_RECIPE_SLUGS.map((slug) => slug.toLowerCase()));

function withoutTrailingSlash(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

/**
 * Preserve the verified old Lebtig URL surface without turning the donor app
 * into a runtime dependency. Case and trailing-slash variants redirect to one
 * app-owned canonical URL. Query strings are preserved.
 */
export function resolveLebtigLegacyRedirect(pathname: string, search = ""): string | null {
  const normalized = withoutTrailingSlash(pathname);
  const lookup = normalized.toLowerCase();
  const pageTarget = LEGACY_PAGE_TARGETS.get(lookup);

  if (pageTarget && pathname !== pageTarget) {
    return `${pageTarget}${search}`;
  }

  const recipePrefix = "/rezepte/";
  if (lookup.startsWith(recipePrefix)) {
    const slug = lookup.slice(recipePrefix.length);
    if (LEGACY_RECIPE_LOOKUP.has(slug)) return `/rezepte${search}`;
  }

  return null;
}

export function buildLebtigSitemap(origin: string): string {
  const normalizedOrigin = origin.replace(/\/+$/, "");
  const paths = LEBTIG_PUBLIC_AUTH_ROUTES
    .filter((route) => route.indexable && !route.pathTemplate.includes(":"))
    .map((route) => route.pathTemplate);

  const body = paths
    .map((pathname) => `  <url><loc>${normalizedOrigin}${pathname}</loc></url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
