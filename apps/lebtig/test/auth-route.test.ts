import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveLebtigAuthMode,
  startLebtigGoogleOAuth,
  submitLebtigCredentialAuth,
  validateLebtigCredentials,
  type LebtigCredentialAuthPort,
} from "../src/auth/route-controller.ts";

test("closed bootstrap forces signup UI back to signin", () => {
  assert.equal(resolveLebtigAuthMode("signup", false), "signin");
  assert.equal(resolveLebtigAuthMode("signup", true), "signup");
  assert.equal(resolveLebtigAuthMode("signin", false), "signin");
});

test("credential validation keeps the donor limits and normalizes email whitespace", () => {
  assert.deepEqual(validateLebtigCredentials({ email: "  chef@example.test ", password: "12345678" }), {
    ok: true,
    credentials: { email: "chef@example.test", password: "12345678" },
  });
  assert.equal(validateLebtigCredentials({ email: "invalid", password: "12345678" }).ok, false);
  assert.equal(validateLebtigCredentials({ email: "chef@example.test", password: "short" }).ok, false);
  assert.equal(validateLebtigCredentials({ email: "chef@example.test", password: "x".repeat(73) }).ok, false);
});

test("signin delegates to the credential port and navigates to admin", async () => {
  const calls: unknown[] = [];
  const credentialAuth: LebtigCredentialAuthPort = {
    async signInWithPassword(credentials) {
      calls.push({ kind: "signin", credentials });
      return { session: true };
    },
    async signUp(input) {
      calls.push({ kind: "signup", input });
      return { session: true };
    },
  };

  const result = await submitLebtigCredentialAuth({
    mode: "signin",
    bootstrapOpen: false,
    origin: "https://lebtig.test",
    credentials: { email: "  editor@example.test ", password: "password123" },
    credentialAuth,
  });

  assert.deepEqual(calls, [{
    kind: "signin",
    credentials: { email: "editor@example.test", password: "password123" },
  }]);
  assert.deepEqual(result, { kind: "navigate", to: "/admin" });
});

test("signup fails closed when bootstrap is not open", async () => {
  let called = false;
  const credentialAuth: LebtigCredentialAuthPort = {
    async signInWithPassword() {
      called = true;
      return { session: true };
    },
    async signUp() {
      called = true;
      return { session: true };
    },
  };

  const result = await submitLebtigCredentialAuth({
    mode: "signup",
    bootstrapOpen: false,
    origin: "https://lebtig.test",
    credentials: { email: "editor@example.test", password: "password123" },
    credentialAuth,
  });

  assert.equal(called, false);
  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.match(result.error.message, /bootstrap is closed/);
});

test("signup uses /admin verification redirect and preserves pending-verification semantics", async () => {
  const calls: unknown[] = [];
  const credentialAuth: LebtigCredentialAuthPort = {
    async signInWithPassword() {
      return { session: true };
    },
    async signUp(input) {
      calls.push(input);
      return { session: false };
    },
  };

  const result = await submitLebtigCredentialAuth({
    mode: "signup",
    bootstrapOpen: true,
    origin: "https://lebtig.test/some/path",
    credentials: { email: "editor@example.test", password: "password123" },
    credentialAuth,
  });

  assert.deepEqual(calls, [{
    email: "editor@example.test",
    password: "password123",
    emailRedirectTo: "https://lebtig.test/admin",
  }]);
  assert.deepEqual(result, { kind: "pending-verification" });
});

test("provider errors are returned without pretending login succeeded", async () => {
  const providerError = new Error("login disabled");
  const credentialAuth: LebtigCredentialAuthPort = {
    async signInWithPassword() {
      return { session: false, error: providerError };
    },
    async signUp() {
      return { session: false, error: providerError };
    },
  };

  const result = await submitLebtigCredentialAuth({
    mode: "signin",
    bootstrapOpen: false,
    origin: "https://lebtig.test",
    credentials: { email: "editor@example.test", password: "password123" },
    credentialAuth,
  });

  assert.deepEqual(result, { kind: "error", error: providerError });
});

test("Google login uses the shared OAuthPort instead of the Lovable broker", async () => {
  const calls: unknown[] = [];
  const external = await startLebtigGoogleOAuth({
    origin: "https://lebtig.test/current",
    oauth: {
      async signInWithOAuth(request) {
        calls.push(request);
        return { navigation: "external" };
      },
    },
  });

  assert.deepEqual(calls, [{ provider: "google", redirectTo: "https://lebtig.test/admin" }]);
  assert.deepEqual(external, { kind: "external-navigation" });

  const completed = await startLebtigGoogleOAuth({
    origin: "https://lebtig.test",
    oauth: {
      async signInWithOAuth() {
        return { navigation: "complete" };
      },
    },
  });
  assert.deepEqual(completed, { kind: "navigate", to: "/admin" });
});
