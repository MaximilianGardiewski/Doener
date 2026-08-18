import test from "node:test";
import assert from "node:assert/strict";
import { createLovableOAuthAdapter } from "../src/auth/lovable-oauth-adapter.ts";
import { createNativeSupabaseOAuthPort } from "../src/auth/native-supabase-oauth.ts";
import { createLebtigOAuthPort } from "../src/auth/oauth.ts";

test("native Supabase OAuth adapter forwards provider and redirectTo", async () => {
  const calls: unknown[] = [];
  const port = createNativeSupabaseOAuthPort({
    auth: {
      async signInWithOAuth(input) {
        calls.push(input);
        return { error: null };
      },
    },
  });

  const result = await port.signInWithOAuth({
    provider: "google",
    redirectTo: "https://lebtig.test/admin",
    scopes: "openid email",
  });

  assert.deepEqual(calls, [{
    provider: "google",
    options: {
      redirectTo: "https://lebtig.test/admin",
      scopes: "openid email",
    },
  }]);
  assert.deepEqual(result, { navigation: "external" });
});

test("native Supabase OAuth adapter normalizes provider errors", async () => {
  const port = createNativeSupabaseOAuthPort({
    auth: {
      async signInWithOAuth() {
        return { error: { message: "provider disabled" } };
      },
    },
  });

  const result = await port.signInWithOAuth({ provider: "google" });
  assert.equal(result.navigation, "complete");
  assert.equal(result.error?.message, "provider disabled");
});

test("Lovable OAuth bridge maps current broker semantics behind the same port", async () => {
  const calls: unknown[] = [];
  const port = createLovableOAuthAdapter({
    async signInWithOAuth(provider, options) {
      calls.push({ provider, options });
      return { redirected: true };
    },
  });

  const result = await port.signInWithOAuth({
    provider: "google",
    redirectTo: "https://lebtig.test",
  });
  assert.deepEqual(calls, [{
    provider: "google",
    options: { redirect_uri: "https://lebtig.test" },
  }]);
  assert.deepEqual(result, { navigation: "external" });
});

test("Lebtig chooses native Supabase OAuth unless the legacy broker is explicitly requested", async () => {
  let nativeCalls = 0;
  let lovableCalls = 0;
  const supabase = {
    auth: {
      async signInWithOAuth() {
        nativeCalls += 1;
        return { error: null };
      },
    },
  };
  const lovableBroker = {
    async signInWithOAuth() {
      lovableCalls += 1;
      return { redirected: false };
    },
  };

  await createLebtigOAuthPort({ supabase, lovableBroker }).signInWithOAuth({ provider: "google" });
  assert.equal(nativeCalls, 1);
  assert.equal(lovableCalls, 0);

  const legacy = createLebtigOAuthPort({
    supabase,
    lovableBroker,
    useLegacyLovableBroker: true,
  });
  const result = await legacy.signInWithOAuth({ provider: "google" });
  assert.equal(nativeCalls, 1);
  assert.equal(lovableCalls, 1);
  assert.equal(result.navigation, "complete");
});

test("requesting the legacy broker without supplying it fails closed", () => {
  const supabase = {
    auth: {
      async signInWithOAuth() {
        return { error: null };
      },
    },
  };
  assert.throws(
    () => createLebtigOAuthPort({ supabase, useLegacyLovableBroker: true }),
    /requested but not provided/,
  );
});
