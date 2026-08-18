import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { LEBTIG_PUBLIC_AUTH_ROUTES } from "../src/routes/manifest.ts";
import { LEBTIG_PUBLIC_PAGE_COPY } from "../src/ui/route-copy.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(appRoot, relativePath), "utf8");
}

test("render copy covers every public route contract and nothing else", () => {
  const publicIds = LEBTIG_PUBLIC_AUTH_ROUTES.filter((route) => route.shell === "public")
    .map((route) => route.id)
    .sort();
  const copyIds = Object.keys(LEBTIG_PUBLIC_PAGE_COPY).sort();
  assert.deepEqual(copyIds, publicIds);
});

test("portable render shell consumes app-owned route and auth contracts", async () => {
  const app = await source("src/ui/app.tsx");
  assert.match(app, /LEBTIG_PUBLIC_AUTH_ROUTES/);
  assert.match(app, /submitLebtigCredentialAuth/);
  assert.match(app, /startLebtigGoogleOAuth/);
  assert.match(app, /LebtigCredentialAuthPort|credentialAuth/);
  assert.doesNotMatch(app, /@lovable\.dev/);
  assert.doesNotMatch(app, /integrations\/lovable/);
});

test("browser composition keeps Supabase at the adapter edge and service role out", async () => {
  const runtime = await source("src/ui/auth-runtime.ts");
  const env = await source(".env.example");
  assert.match(runtime, /createNativeSupabaseCredentialAuthPort/);
  assert.match(runtime, /createNativeSupabaseOAuthPort/);
  assert.match(env, /VITE_SUPABASE_URL/);
  assert.match(env, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(runtime + env, /service_role|SERVICE_ROLE/);
  assert.doesNotMatch(runtime, /@lovable\.dev/);
});

test("portable Vite config does not use the Lovable preset", async () => {
  const config = await source("vite.config.ts");
  const packageJson = JSON.parse(await source("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  assert.match(config, /@vitejs\/plugin-react/);
  assert.doesNotMatch(config, /@lovable\.dev/);
  assert.equal(packageJson.dependencies?.["@lovable.dev/cloud-auth-js"], undefined);
  assert.equal(packageJson.devDependencies?.["@lovable.dev/vite-tanstack-config"], undefined);
  assert.equal(packageJson.scripts?.build, "vite build");
});
