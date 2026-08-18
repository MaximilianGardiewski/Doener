import test from "node:test";
import assert from "node:assert/strict";
import {
  findLebtigPublicAuthRoute,
  LEBTIG_DONOR_SNAPSHOT,
  LEBTIG_PUBLIC_AUTH_ROUTES,
} from "../src/routes/manifest.ts";

test("Lebtig public/auth manifest is pinned to the verified donor snapshot", () => {
  assert.equal(LEBTIG_DONOR_SNAPSHOT, "abb54c73f42b784d7c66cd1e1d468b532a67f065");
  assert.equal(LEBTIG_PUBLIC_AUTH_ROUTES.length, 17);
});

test("Lebtig route contract preserves the verified public/auth URL surface without admin routes", () => {
  assert.deepEqual(
    LEBTIG_PUBLIC_AUTH_ROUTES.map((route) => route.pathTemplate),
    [
      "/",
      "/mittagstisch",
      "/wochenangebote",
      "/partyservice",
      "/kontakt",
      "/sortiment",
      "/ueber-uns",
      "/aktuelles",
      "/aktuelles/:slug",
      "/rezepte",
      "/rezepte/:slug",
      "/seite/:slug",
      "/datenschutz",
      "/impressum",
      "/media/:id",
      "/sitemap.xml",
      "/auth",
    ],
  );
  assert.equal(LEBTIG_PUBLIC_AUTH_ROUTES.some((route) => route.pathTemplate.startsWith("/admin")), false);
});

test("route descriptors retain their exact donor source files", () => {
  const byId = new Map(LEBTIG_PUBLIC_AUTH_ROUTES.map((route) => [route.id, route]));
  assert.equal(byId.get("news-detail")?.sourceFile, "src/routes/aktuelles.$slug.tsx");
  assert.equal(byId.get("recipe-detail")?.sourceFile, "src/routes/rezepte.$slug.tsx");
  assert.equal(byId.get("media")?.sourceFile, "src/routes/media.$id.ts");
  assert.equal(byId.get("sitemap")?.sourceFile, "src/routes/sitemap[.]xml.ts");
  assert.equal(byId.get("auth")?.sourceFile, "src/routes/auth.tsx");
});

test("framework-neutral matching supports exact and one-segment dynamic routes", () => {
  assert.equal(findLebtigPublicAuthRoute("/mittagstisch")?.id, "lunch");
  assert.equal(findLebtigPublicAuthRoute("/aktuelles/sommerfest")?.id, "news-detail");
  assert.equal(findLebtigPublicAuthRoute("/media/abc-123?download=1")?.id, "media");
  assert.equal(findLebtigPublicAuthRoute("/kontakt/")?.id, "contact");
  assert.equal(findLebtigPublicAuthRoute("/admin")?.id, undefined);
  assert.equal(findLebtigPublicAuthRoute("/aktuelles/zu/viele")?.id, undefined);
});

test("auth and machine routes cannot be accidentally marked indexable public pages", () => {
  const auth = LEBTIG_PUBLIC_AUTH_ROUTES.find((route) => route.id === "auth");
  const media = LEBTIG_PUBLIC_AUTH_ROUTES.find((route) => route.id === "media");
  const sitemap = LEBTIG_PUBLIC_AUTH_ROUTES.find((route) => route.id === "sitemap");
  assert.deepEqual(
    [auth?.shell, auth?.indexable, media?.shell, media?.indexable, sitemap?.shell, sitemap?.indexable],
    ["auth", false, "none", false, "none", false],
  );
});
