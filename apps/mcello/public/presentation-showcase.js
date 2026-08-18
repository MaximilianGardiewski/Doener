(() => {
  const params = new URLSearchParams(window.location.search);
  const presentationRequested = params.get("presentation") === "mcello";
  if (!presentationRequested) return;

  const hostname = window.location.hostname;
  const hosted = window.location.protocol === "https:" && hostname.endsWith(".vercel.app");
  const local = window.location.protocol === "http:" && (
    hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    || /\.sslip\.io$/i.test(hostname)
  );
  if (!hosted && !local) return;

  document.documentElement.dataset.presentationShowcase = hosted ? "hosted" : "local";

  const nativeFetch = window.fetch.bind(window);
  let staticCatalogPromise = null;

  function groupFor(productId, group, prefix) {
    return {
      id: `${prefix}-${productId}-${group.key}`,
      name: group.name,
      minSelections: Number(group.minSelections || 0),
      maxSelections: Number(group.maxSelections || 0),
      sort: Number(group.sort || 100),
      options: (group.options || []).map((option) => ({
        id: `${prefix}-${productId}-${option.key}`,
        name: option.name,
        priceDeltaCents: Number(option.priceDeltaCents || 0),
        defaultSelected: Boolean(option.defaultSelected),
        soldOut: false,
        sort: Number(option.sort || 100),
      })),
    };
  }

  function sizeGroup(productId, variants) {
    if (!Array.isArray(variants) || variants.length === 0) return [];
    const basePriceCents = Number(variants[0]?.[1] || 0);
    return [{
      id: `showcase-${productId}-size`,
      name: "Größe",
      minSelections: 1,
      maxSelections: 1,
      sort: 10,
      options: variants.map(([name, priceCents], index) => ({
        id: `showcase-${productId}-size-${index}`,
        name,
        priceDeltaCents: Number(priceCents) - basePriceCents,
        defaultSelected: index === 0,
        soldOut: false,
        sort: (index + 1) * 10,
      })),
    }];
  }

  function buildCatalog(seed, presentation) {
    const categories = (seed.categories || []).map(([slug, name, sort]) => ({
      id: slug,
      slug,
      name,
      sort,
      products: [],
    }));
    const categoryMap = new Map(categories.map((category) => [category.id, category]));
    const sauceIds = new Set(presentation.donerYufka?.productSourceIds || []);

    for (const item of seed.items || []) {
      const [id, categoryId, name, description, basePriceCents, variants, orderableOnline] = item;
      const modifierGroups = sizeGroup(id, variants);

      if (id === presentation.pizza?.productSourceId) {
        for (const group of presentation.pizza.groups || []) {
          modifierGroups.push(groupFor(id, group, "showcase-pizza"));
        }
      }
      if (sauceIds.has(id)) {
        for (const group of presentation.donerYufka.groups || []) {
          modifierGroups.push(groupFor(id, group, "showcase-doner-yufka"));
        }
      }

      const product = {
        id,
        name,
        description,
        basePriceCents: Number(basePriceCents || 0),
        orderableOnline: Boolean(orderableOnline),
        availableNow: Boolean(orderableOnline),
        soldOut: false,
        ownerConfirmed: false,
        bestseller: id === presentation.pizza?.productSourceId,
        modifierGroups,
      };
      categoryMap.get(categoryId)?.products.push(product);
    }

    return {
      locationId: "presentation-showcase",
      categories,
      productCrossSells: [],
      crossSellRules: [],
    };
  }

  async function staticCatalog() {
    if (!staticCatalogPromise) {
      staticCatalogPromise = Promise.all([
        nativeFetch("/menu-seed.provisional.json", { cache: "no-store" }).then((response) => {
          if (!response.ok) throw new Error("presentation menu seed unavailable");
          return response.json();
        }),
        nativeFetch("/presentation-builder-showcase.v1.json", { cache: "no-store" }).then((response) => {
          if (!response.ok) throw new Error("presentation builder data unavailable");
          return response.json();
        }),
      ]).then(([seed, presentation]) => buildCatalog(seed, presentation));
    }
    return staticCatalogPromise;
  }

  window.fetch = async function mcelloPresentationFetch(input, init) {
    const requestUrl = new URL(typeof input === "string" ? input : input.url, window.location.href);
    if (requestUrl.origin !== window.location.origin || requestUrl.pathname !== "/api/menu") {
      return nativeFetch(input, init);
    }

    try {
      const response = await nativeFetch(input, init);
      if (response.ok) return response;
    } catch {
      // Hosted/static showcase falls through to the presentation catalog.
    }

    const body = JSON.stringify(await staticCatalog());
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-mcello-presentation-source": "browser-showcase",
      },
    });
  };
})();
