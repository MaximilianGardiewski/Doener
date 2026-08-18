import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import {
  LEBTIG_PUBLIC_AUTH_ROUTES,
  type LebtigRouteDescriptor,
} from "../routes/manifest.ts";
import {
  resolveLebtigAuthMode,
  startLebtigGoogleOAuth,
  submitLebtigCredentialAuth,
  type LebtigAuthMode,
  type LebtigAuthRouteResult,
} from "../auth/route-controller.ts";
import { createLebtigBrowserAuthRuntime } from "./auth-runtime.ts";
import {
  LEBTIG_PUBLIC_PAGE_COPY,
  type LebtigPublicRouteId,
} from "./route-copy.ts";

const PRIMARY_NAV = [
  ["/", "Start"],
  ["/mittagstisch", "Mittagstisch"],
  ["/wochenangebote", "Wochenangebote"],
  ["/sortiment", "Sortiment"],
  ["/partyservice", "Partyservice"],
  ["/kontakt", "Kontakt"],
] as const;

const SECONDARY_NAV = [
  ["/ueber-uns", "Über uns"],
  ["/aktuelles", "Aktuelles"],
  ["/rezepte", "Rezepte"],
] as const;

export const LEBTIG_RENDERED_PUBLIC_ROUTE_IDS = [
  "home",
  "lunch",
  "offers",
  "party-service",
  "contact",
  "assortment",
  "about",
  "news-index",
  "news-detail",
  "recipes-index",
  "recipe-detail",
  "cms-page",
  "privacy",
  "imprint",
] as const satisfies readonly LebtigPublicRouteId[];

function routeDescriptor(id: LebtigPublicRouteId): LebtigRouteDescriptor {
  const descriptor = LEBTIG_PUBLIC_AUTH_ROUTES.find((route) => route.id === id);
  if (!descriptor) throw new Error(`Missing Lebtig route descriptor: ${id}`);
  return descriptor;
}

function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-row">
        <Link to="/" className="brand" aria-label="Zur Startseite">
          <span className="brand-medallion" aria-hidden="true">
            <span className="brand-kicker">Metzgerei</span>
            <span className="brand-word">Lebtig</span>
          </span>
          <span className="brand-name">Metzgerei Lebtig</span>
        </Link>

        <nav className="desktop-nav" aria-label="Hauptnavigation">
          {PRIMARY_NAV.map(([to, label]) => (
            <Link key={to} to={to} activeProps={{ className: "nav-link active" }} className="nav-link">
              {label}
            </Link>
          ))}
          <details className="more-menu">
            <summary className="nav-link">Mehr</summary>
            <div className="more-panel">
              {SECONDARY_NAV.map(([to, label]) => (
                <Link key={to} to={to} className="more-link">
                  {label}
                </Link>
              ))}
            </div>
          </details>
        </nav>

        <details className="mobile-menu">
          <summary aria-label="Navigation öffnen">Menü</summary>
          <nav aria-label="Mobile Navigation" className="mobile-panel">
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map(([to, label]) => (
              <Link key={to} to={to} className="mobile-link">
                {label}
              </Link>
            ))}
            <Link to="/auth" className="mobile-link secondary-link">
              Redaktion
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <p className="footer-brand">Metzgerei Lebtig</p>
          <p className="muted">Portabler BusinessWebFactory-Consumer · Preview ohne Production-Freigabe.</p>
        </div>
        <nav aria-label="Fußnavigation" className="footer-links">
          <Link to="/impressum">Impressum</Link>
          <Link to="/datenschutz">Datenschutz</Link>
          <Link to="/auth">Redaktion</Link>
        </nav>
      </div>
    </footer>
  );
}

function RootLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const backendShell = pathname.startsWith("/auth") || pathname.startsWith("/admin");

  return backendShell ? (
    <Outlet />
  ) : (
    <div className="app-shell">
      <SiteHeader />
      <main className="page-main">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

function PublicPage({ id }: { id: LebtigPublicRouteId }) {
  const descriptor = routeDescriptor(id);
  const copy = LEBTIG_PUBLIC_PAGE_COPY[id];

  useEffect(() => {
    document.title = `${copy.title} · Metzgerei Lebtig`;
  }, [copy.title]);

  return (
    <>
      <section className="hero-section">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="hero-summary">{copy.summary}</p>
            <div className="hero-actions">
              <Link to="/mittagstisch" className="button primary-button">
                Zum Mittagstisch
              </Link>
              <Link to="/kontakt" className="button secondary-button">
                Kontakt
              </Link>
            </div>
          </div>
          <aside className="route-card" aria-label="Portierungsstatus">
            <span className="status-dot" aria-hidden="true" />
            <div>
              <p className="route-card-title">Public-Shell aktiv</p>
              <p className="muted">
                Stabile Route <code>{descriptor.pathTemplate}</code>. CMS-Daten folgen über die app-eigene Boundary.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className="content-section">
        <div className="container content-grid">
          <article className="content-card">
            <p className="eyebrow">Portabilität</p>
            <h2>Route und Darstellung liegen jetzt im Git-Repo</h2>
            <p>
              Dieser Slice übernimmt bewusst zuerst die echte Browser-, Navigations- und Auth-Shell. Dynamische Inhalte,
              Rechtstexte und Business-Fakten werden nicht aus dem Builder kopiert, bevor ihre Quelle geprüft ist.
            </p>
          </article>
          <article className="content-card accent-card">
            <p className="eyebrow">Nächster Datenpfad</p>
            <h2>CMS statt statischer Doppelpflege</h2>
            <p>
              Mittagstisch, Angebote, News, Rezepte und freie Seiten bleiben strukturierte Lebtig-Domain und werden im
              folgenden Vertical-Slice mit Persistenz und Backend-Autorisierung verbunden.
            </p>
          </article>
        </div>
      </section>
    </>
  );
}

function AuthPage() {
  const runtime = useMemo(() => createLebtigBrowserAuthRuntime(), []);
  const bootstrapOpen = false;
  const [mode, setMode] = useState<LebtigAuthMode>("signin");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Redaktion – Anmeldung · Metzgerei Lebtig";
  }, []);

  useEffect(() => {
    setMode((current) => resolveLebtigAuthMode(current, bootstrapOpen));
  }, [bootstrapOpen]);

  function applyResult(result: LebtigAuthRouteResult) {
    if (result.kind === "navigate") {
      window.location.assign(result.to);
      return;
    }
    if (result.kind === "external-navigation") return;
    if (result.kind === "pending-verification") {
      setMessage("Bitte bestätigen Sie die E-Mail. Die weitere Freischaltung erfolgt anschließend über den vorgesehenen Admin-Prozess.");
      return;
    }
    if (result.kind === "validation-error") {
      setMessage(result.message);
      return;
    }
    setMessage(result.error.message);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    setPending(true);
    const result = await submitLebtigCredentialAuth({
      mode,
      bootstrapOpen,
      origin: window.location.origin,
      credentials: {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      },
      credentialAuth: runtime.credentialAuth,
    });
    setPending(false);
    applyResult(result);
  }

  async function onGoogle() {
    setPending(true);
    setMessage(null);
    const result = await startLebtigGoogleOAuth({
      origin: window.location.origin,
      oauth: runtime.oauth,
    });
    setPending(false);
    applyResult(result);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link to="/" className="auth-brand">
          Metzgerei Lebtig
        </Link>
        <p className="eyebrow">Redaktion</p>
        <h1>Anmeldung</h1>
        <p className="muted">Melden Sie sich an, um den redaktionellen Bereich zu öffnen.</p>

        <p data-testid="invite-only-hint" className="auth-hint">
          Die Ersteinrichtung wird in diesem portablen Shell-Build fail-closed behandelt. Ein serverseitig bestätigter
          Bootstrap-Status wird erst mit dem Schema-/RLS-Slice freigeschaltet.
        </p>

        {!runtime.configured ? (
          <p className="auth-warning" role="status">
            Lokales Preview ohne Auth-Backend. Es werden keine Testkonten oder externen Provider automatisch angelegt.
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="auth-form" noValidate>
          <label>
            <span>E-Mail</span>
            <input name="email" type="email" autoComplete="email" maxLength={255} required />
          </label>
          <label>
            <span>Passwort</span>
            <input name="password" type="password" autoComplete="current-password" minLength={8} maxLength={72} required />
          </label>
          <button className="button primary-button" type="submit" disabled={pending}>
            {pending ? "Bitte warten…" : "Anmelden"}
          </button>
        </form>

        <button className="button secondary-button full-button" type="button" onClick={onGoogle} disabled={pending}>
          Mit Google anmelden
        </button>

        {message ? (
          <p className="auth-message" role="alert">
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}

function NotFoundPage() {
  useEffect(() => {
    document.title = "Seite nicht gefunden · Metzgerei Lebtig";
  }, []);

  return (
    <section className="not-found">
      <p className="eyebrow">404</p>
      <h1>Seite nicht gefunden</h1>
      <p className="muted">Diese Route gehört nicht zur aktuell portierten Public/Auth-Oberfläche.</p>
      <Link to="/" className="button primary-button">
        Zur Startseite
      </Link>
    </section>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

function publicRoute(path: string, id: LebtigPublicRouteId) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <PublicPage id={id} />,
  });
}

const routeTree = rootRoute.addChildren([
  publicRoute("/", "home"),
  publicRoute("/mittagstisch", "lunch"),
  publicRoute("/wochenangebote", "offers"),
  publicRoute("/partyservice", "party-service"),
  publicRoute("/kontakt", "contact"),
  publicRoute("/sortiment", "assortment"),
  publicRoute("/ueber-uns", "about"),
  publicRoute("/aktuelles", "news-index"),
  publicRoute("/aktuelles/$slug", "news-detail"),
  publicRoute("/rezepte", "recipes-index"),
  publicRoute("/rezepte/$slug", "recipe-detail"),
  publicRoute("/seite/$slug", "cms-page"),
  publicRoute("/datenschutz", "privacy"),
  publicRoute("/impressum", "imprint"),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/auth",
    component: AuthPage,
  }),
]);

export const lebtigRouter = createRouter({ routeTree });

export function LebtigApp() {
  return <RouterProvider router={lebtigRouter} />;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof lebtigRouter;
  }
}
