import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.MCELLO_PREVIEW_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });

function alphaFromComputedColor(value) {
  const slashAlpha = value.match(/\/\s*([0-9]*\.?[0-9]+)\s*\)$/);
  if (slashAlpha) return Number(slashAlpha[1]);
  const rgbaAlpha = value.match(/^rgba\([^)]*,\s*([0-9]*\.?[0-9]+)\s*\)$/i);
  if (rgbaAlpha) return Number(rgbaAlpha[1]);
  return 1;
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name) => style.getPropertyValue(name).trim();
    return {
      bg: read("--bg"),
      text: read("--text"),
      gold: read("--gold"),
      gold2: read("--gold-2"),
      green: read("--green"),
      radius: read("--radius"),
    };
  });

  assert.equal(tokens.bg, "#10110f", "D001 anthracite base must be active");
  assert.equal(tokens.text, "#f7f0e3", "warm off-white text token must be active");
  assert.equal(tokens.gold, "#d79a2f", "amber must be the primary accent token");
  assert.equal(tokens.gold2, "#f1ca75", "light warm accent must be active");
  assert.equal(tokens.green, "#8db85d", "heritage green token must remain available selectively");
  assert.equal(tokens.radius, "28px", "shared premium radius must resolve");

  const visualContract = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const header = getComputedStyle(document.querySelector(".site-header"));
    const heading = getComputedStyle(document.querySelector("h1"));
    const primary = getComputedStyle(document.querySelector(".hero .primary"));
    const commercePrimary = getComputedStyle(document.querySelector(".sticky-order .primary"));
    const heroPhoto = getComputedStyle(document.querySelector(".hero-photo"));
    const story = getComputedStyle(document.querySelector(".contact-stage .story-card"));
    const tag = getComputedStyle(document.querySelector(".tag"));
    return {
      bodyBackground: body.backgroundImage,
      headerBackground: header.backgroundColor,
      headingFamily: heading.fontFamily,
      primaryBackground: primary.backgroundImage,
      primaryRadius: primary.borderRadius,
      primaryColor: primary.backgroundColor,
      primaryShadow: primary.boxShadow,
      primaryTransform: primary.textTransform,
      commercePrimaryColor: commercePrimary.backgroundColor,
      commercePrimaryRadius: commercePrimary.borderRadius,
      commercePrimaryBackground: commercePrimary.backgroundImage,
      heroRadius: heroPhoto.borderRadius,
      storyRadius: story.borderRadius,
      tagColor: tag.color,
    };
  });

  assert.match(visualContract.bodyBackground, /radial-gradient/i, "warm ambient background must render");
  assert.match(visualContract.headerBackground, /^(?:rgba?\(|color\(srgb\b)/i, "header must render as a resolved anthracite color");
  const headerAlpha = alphaFromComputedColor(visualContract.headerBackground);
  assert.ok(headerAlpha > 0 && headerAlpha < 1, "header glass surface must retain real translucency");
  assert.match(visualContract.headingFamily, /Iowan Old Style|Palatino|Book Antiqua|Georgia/i, "display typography must use the premium serif stack");
  /*
   * Theke art direction. ART_DIRECTION.md rules out "generisches Schwarz-Gold-Luxury"
   * and USER_REFERENCE_SYNTHESIS.md releases the V2 foundation as a "technische
   * Zwischenstufe", so the primary CTA is a flat printed copper block rather than a
   * gradient capsule. Owner Visual Gate B still has to confirm this.
   *
   * These assertions are stricter than the ones they replace: they pin the flat
   * treatment AND newly require that the public and commerce halves of the same page
   * render the same component identically, which nothing checked before.
   */
  assert.equal(visualContract.primaryBackground, "none", "primary CTA must not reintroduce a gradient");
  assert.equal(visualContract.primaryShadow, "none", "primary CTA must not reintroduce a glow");
  assert.equal(visualContract.primaryTransform, "uppercase", "primary CTA keeps the counter type");
  assert.equal(visualContract.primaryRadius, "2px", "primary CTA must keep the printed edge");
  assert.equal(visualContract.primaryColor, "rgb(173, 109, 25)", "primary CTA must render flat copper");
  assert.equal(visualContract.commercePrimaryBackground, "none", "commerce primary must not reintroduce a gradient");
  assert.equal(visualContract.commercePrimaryColor, visualContract.primaryColor, "public and commerce must share one button colour");
  assert.equal(visualContract.commercePrimaryRadius, visualContract.primaryRadius, "public and commerce must share one button geometry");
  assert.equal(visualContract.heroRadius, "42px", "hero media must use the large premium radius");
  assert.equal(visualContract.storyRadius, "30px", "rounded editorial panels must retain the premium surface radius where the V2 layout calls for them");
  assert.equal(visualContract.tagColor, "rgb(141, 184, 93)", "green must be used selectively for small semantic labels");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  assert.equal(await mobile.locator("h1").isVisible(), true, "brand hierarchy must remain visible on mobile");
  assert.equal(await mobile.locator(".header-order-cta").isVisible(), true, "premium order CTA must remain available on mobile");
  assert.equal(
    await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    "D001 styling must not introduce mobile horizontal overflow",
  );

  console.log("D001 Chromium modern-warm-premium design smoke passed.");
} finally {
  await browser.close();
}
