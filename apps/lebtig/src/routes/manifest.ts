export const LEBTIG_DONOR_SNAPSHOT = "abb54c73f42b784d7c66cd1e1d468b532a67f065" as const;

export type LebtigRouteShell = "public" | "auth" | "none";
export type LebtigRouteDataSource = "static" | "cms" | "media" | "auth";

export interface LebtigRouteDescriptor {
  id: string;
  pathTemplate: string;
  sourceFile: string;
  shell: LebtigRouteShell;
  dataSource: LebtigRouteDataSource;
  indexable: boolean;
}

/**
 * Framework-neutral inventory of the Public/Auth route surface verified in the
 * connected Lebtig Lovable snapshot. The route renderer may change during the
 * portability migration; these app-owned URLs must not silently disappear.
 *
 * Admin routes are deliberately excluded from this slice. They move only after
 * the Supabase schema/RLS comparison has been completed.
 */
export const LEBTIG_PUBLIC_AUTH_ROUTES = [
  {
    id: "home",
    pathTemplate: "/",
    sourceFile: "src/routes/index.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "lunch",
    pathTemplate: "/mittagstisch",
    sourceFile: "src/routes/mittagstisch.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "offers",
    pathTemplate: "/wochenangebote",
    sourceFile: "src/routes/wochenangebote.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "party-service",
    pathTemplate: "/partyservice",
    sourceFile: "src/routes/partyservice.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "contact",
    pathTemplate: "/kontakt",
    sourceFile: "src/routes/kontakt.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "assortment",
    pathTemplate: "/sortiment",
    sourceFile: "src/routes/sortiment.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "about",
    pathTemplate: "/ueber-uns",
    sourceFile: "src/routes/ueber-uns.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "news-index",
    pathTemplate: "/aktuelles",
    sourceFile: "src/routes/aktuelles.index.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "news-detail",
    pathTemplate: "/aktuelles/:slug",
    sourceFile: "src/routes/aktuelles.$slug.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "recipes-index",
    pathTemplate: "/rezepte",
    sourceFile: "src/routes/rezepte.index.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "recipe-detail",
    pathTemplate: "/rezepte/:slug",
    sourceFile: "src/routes/rezepte.$slug.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "cms-page",
    pathTemplate: "/seite/:slug",
    sourceFile: "src/routes/seite.$slug.tsx",
    shell: "public",
    dataSource: "cms",
    indexable: true,
  },
  {
    id: "privacy",
    pathTemplate: "/datenschutz",
    sourceFile: "src/routes/datenschutz.tsx",
    shell: "public",
    dataSource: "static",
    indexable: true,
  },
  {
    id: "imprint",
    pathTemplate: "/impressum",
    sourceFile: "src/routes/impressum.tsx",
    shell: "public",
    dataSource: "static",
    indexable: true,
  },
  {
    id: "media",
    pathTemplate: "/media/:id",
    sourceFile: "src/routes/media.$id.ts",
    shell: "none",
    dataSource: "media",
    indexable: false,
  },
  {
    id: "sitemap",
    pathTemplate: "/sitemap.xml",
    sourceFile: "src/routes/sitemap[.]xml.ts",
    shell: "none",
    dataSource: "cms",
    indexable: false,
  },
  {
    id: "auth",
    pathTemplate: "/auth",
    sourceFile: "src/routes/auth.tsx",
    shell: "auth",
    dataSource: "auth",
    indexable: false,
  },
] as const satisfies readonly LebtigRouteDescriptor[];

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] ?? "/";
  if (withoutQuery === "/") return "/";
  return withoutQuery.replace(/\/+$/, "") || "/";
}

function routeMatches(pathTemplate: string, pathname: string): boolean {
  const templateSegments = normalizePathname(pathTemplate).split("/").filter(Boolean);
  const pathSegments = normalizePathname(pathname).split("/").filter(Boolean);
  if (templateSegments.length !== pathSegments.length) return false;

  return templateSegments.every((segment, index) => {
    if (segment.startsWith(":")) return pathSegments[index]?.length > 0;
    return segment === pathSegments[index];
  });
}

export function findLebtigPublicAuthRoute(pathname: string): LebtigRouteDescriptor | undefined {
  return LEBTIG_PUBLIC_AUTH_ROUTES.find((route) => routeMatches(route.pathTemplate, pathname));
}
