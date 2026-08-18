import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routeManifestPath = new URL("../apps/lebtig/src/routes/manifest.ts", import.meta.url);
const authControllerPath = new URL("../apps/lebtig/src/auth/route-controller.ts", import.meta.url);

async function source(url) {
  return readFile(url, "utf8");
}

test("Lebtig Public/Auth port does not reintroduce Lovable or Supabase into route logic", async () => {
  const combined = `${await source(routeManifestPath)}\n${await source(authControllerPath)}`;

  for (const forbidden of [
    "@lovable.dev/",
    "integrations/lovable",
    "@supabase/supabase-js",
    "integrations/supabase",
  ]) {
    assert.equal(combined.includes(forbidden), false, `portable route layer must not contain ${forbidden}`);
  }

  assert.match(combined, /OAuthPort/);
  assert.match(combined, /LebtigCredentialAuthPort/);
});

test("Lebtig route manifest keeps the donor snapshot explicit instead of relying on hidden builder state", async () => {
  const manifest = await source(routeManifestPath);
  assert.match(manifest, /abb54c73f42b784d7c66cd1e1d468b532a67f065/);
  assert.match(manifest, /src\/routes\/auth\.tsx/);
  assert.match(manifest, /src\/routes\/sitemap\[\.\]xml\.ts/);
});
