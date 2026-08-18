import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const sharedOAuth = await readFile(new URL("packages/auth/src/oauth.ts", root), "utf8");
const nativeAdapter = await readFile(new URL("apps/lebtig/src/auth/native-supabase-oauth.ts", root), "utf8");
const lovableAdapter = await readFile(new URL("apps/lebtig/src/auth/lovable-oauth-adapter.ts", root), "utf8");
const selector = await readFile(new URL("apps/lebtig/src/auth/oauth.ts", root), "utf8");

test("shared OAuth contract has no Supabase or Lovable runtime dependency", () => {
  assert.doesNotMatch(sharedOAuth, /supabase|lovable/i);
});

test("native adapter does not depend on the Lovable broker", () => {
  assert.match(nativeAdapter, /createNativeSupabaseOAuthPort/);
  assert.doesNotMatch(nativeAdapter, /@lovable\.dev|cloud-auth|LovableOAuth/);
});

test("legacy Lovable bridge is isolated and imports no Lovable package into the repo", () => {
  assert.match(lovableAdapter, /createLovableOAuthAdapter/);
  assert.doesNotMatch(lovableAdapter, /from ["']@lovable\.dev\//);
});

test("Lebtig selects native Supabase unless legacy mode is explicit", () => {
  assert.match(selector, /if \(adapters\.useLegacyLovableBroker\)/);
  assert.match(selector, /return createNativeSupabaseOAuthPort\(adapters\.supabase\)/);
});
