import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("apps/mcello/public/manifest.webmanifest", root), "utf8"));
const indexHtml = await readFile(new URL("apps/mcello/public/index.html", root), "utf8");
const appJs = await readFile(new URL("apps/mcello/public/app.js", root), "utf8");
const sw = await readFile(new URL("apps/mcello/public/sw.js", root), "utf8");
const icon192 = await readFile(new URL("apps/mcello/public/icons/pwa-192.png", root));
const icon512 = await readFile(new URL("apps/mcello/public/icons/pwa-512.png", root));

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "asset must be a PNG");
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR", "PNG must start with IHDR");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test("D060 manifest meets the installable PWA contract", () => {
  assert.equal(manifest.name, "Mcello — Preview");
  assert.equal(manifest.short_name, "Mcello");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);

  const icons = new Map(manifest.icons.map((icon) => [icon.sizes, icon]));
  assert.equal(icons.get("192x192")?.src, "/icons/pwa-192.png");
  assert.equal(icons.get("512x512")?.src, "/icons/pwa-512.png");
  for (const icon of icons.values()) {
    assert.equal(icon.type, "image/png");
    assert.match(icon.purpose, /\bmaskable\b/);
  }
});

test("D060 raster fallbacks have the declared dimensions", () => {
  assert.deepEqual(pngDimensions(icon192), { width: 192, height: 192 });
  assert.deepEqual(pngDimensions(icon512), { width: 512, height: 512 });
});

test("public page links the manifest and registers the root service worker", () => {
  assert.match(indexHtml, /<link rel="manifest" href="\/manifest\.webmanifest"\s*\/>/);
  assert.match(appJs, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
});

test("offline shell never intercepts mutations or backend data routes", () => {
  assert.match(sw, /request\.method !== "GET"/);
  for (const route of ["/api/", "/rest/", "/auth/", "/storage/"]) {
    assert.equal(sw.includes(`url.pathname.startsWith("${route}")`), true, `service worker must bypass ${route}`);
  }
  assert.equal(sw.includes('"/icons/pwa-192.png"'), true);
  assert.equal(sw.includes('"/icons/pwa-512.png"'), true);
  assert.equal(sw.includes('caches.match("/")'), true, "offline navigation may fall back only to the public shell");
  assert.equal(sw.includes('"/kds.html"'), false, "staff/KDS surfaces must not be part of the public offline shell");
  assert.equal(sw.includes('"/status.html"'), false, "customer status shell must not be pre-cached");
});
