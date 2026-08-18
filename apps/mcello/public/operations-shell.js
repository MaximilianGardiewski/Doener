const body = document.body;
const area = body.dataset.operationsArea;
const role = body.dataset.operationsRole;

if (area && role) {
  const main = body.querySelector("main");

  if (main) {
    const allLinks = [
      { key: "admin", href: "/admin.html", mark: "SP", label: "Speisekarte", meta: "Produkte & Preise", roles: ["admin"] },
      { key: "content", href: "/content.html", mark: "IN", label: "Inhalte", meta: "Homepage & Redaktion", roles: ["admin"] },
      { key: "media", href: "/product-media.html", mark: "BI", label: "Produktbilder", meta: "Media-Verwaltung", roles: ["admin"] },
      { key: "labels", href: "/labels.html", mark: "AT", label: "Allergene & Tags", meta: "Kennzeichnung", roles: ["admin"] },
      { key: "schedule", href: "/schedule.html", mark: "ZE", label: "Zeiten", meta: "Öffnung & Bestellbetrieb", roles: ["admin"] },
      { key: "ops", href: "/ops.html", mark: "BE", label: "Betrieb", meta: "Rush, Pause, Verfügbarkeit", roles: ["admin", "staff"] },
      { key: "kds", href: "/kds.html", mark: "KD", label: "KDS", meta: "Bestellungen steuern", roles: ["admin", "staff"] },
    ];

    // Navigation is presentation/IA only. Backend authorization, RLS and page guards remain authoritative.
    const allowedLinks = allLinks.filter((link) => link.roles.includes(role));
    const layout = document.createElement("div");
    layout.className = "mc-operations-layout";

    const nav = document.createElement("aside");
    nav.className = "mc-ops-nav";
    nav.setAttribute("aria-label", "Mcello Operations");

    const brand = document.createElement("header");
    brand.className = "mc-ops-brand";
    const brandName = document.createElement("strong");
    brandName.textContent = "Mcello";
    const brandContext = document.createElement("span");
    brandContext.textContent = "Operations";
    const scope = document.createElement("span");
    scope.className = "mc-ops-scope";
    scope.textContent = role === "admin" ? "Admin · Struktur + Betrieb" : "Staff · Betrieb";
    brand.append(brandName, brandContext, scope);

    const navList = document.createElement("nav");
    navList.className = "mc-ops-nav-list";

    for (const item of allowedLinks) {
      const link = document.createElement("a");
      link.className = "mc-ops-nav-link";
      link.href = item.href;
      link.title = item.label;
      if (item.key === area) link.setAttribute("aria-current", "page");

      const mark = document.createElement("span");
      mark.className = "mc-ops-nav-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = item.mark;

      const copy = document.createElement("span");
      copy.className = "mc-ops-nav-label";
      copy.textContent = item.label;
      const meta = document.createElement("span");
      meta.className = "mc-ops-nav-meta";
      meta.textContent = item.meta;
      copy.append(meta);
      link.append(mark, copy);
      navList.append(link);
    }

    const footer = document.createElement("footer");
    footer.className = "mc-ops-nav-footer";
    const publicLink = document.createElement("a");
    publicLink.className = "mc-ops-public-link";
    publicLink.href = "/";
    publicLink.textContent = "Zur Public Preview";
    const boundary = document.createElement("span");
    boundary.textContent = "Navigation ändert keine Rollen oder Rechte.";
    footer.append(publicLink, boundary);

    nav.append(brand, navList, footer);

    const toggle = document.createElement("button");
    toggle.className = "mc-ops-menu-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", "mcOperationsNavigation");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Menü";
    nav.id = "mcOperationsNavigation";

    const backdrop = document.createElement("button");
    backdrop.className = "mc-ops-backdrop";
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "Operations-Menü schließen");
    backdrop.tabIndex = -1;

    const closeMenu = () => {
      body.classList.remove("mc-ops-menu-open");
      toggle.setAttribute("aria-expanded", "false");
    };

    const openMenu = () => {
      body.classList.add("mc-ops-menu-open");
      toggle.setAttribute("aria-expanded", "true");
    };

    toggle.addEventListener("click", () => {
      if (body.classList.contains("mc-ops-menu-open")) closeMenu();
      else openMenu();
    });
    backdrop.addEventListener("click", closeMenu);
    navList.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a")) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
    window.matchMedia("(min-width: 761px)").addEventListener("change", (event) => {
      if (event.matches) closeMenu();
    });

    main.parentNode.insertBefore(layout, main);
    layout.append(nav, main);
    body.append(toggle, backdrop);
  }
}
