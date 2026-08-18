import test from "node:test";
import assert from "node:assert/strict";
import { createNativeSupabaseCredentialAuthPort } from "../src/auth/native-supabase-credentials.ts";

test("native credential adapter forwards sign-in without leaking provider types into the route", async () => {
  const calls: unknown[] = [];
  const port = createNativeSupabaseCredentialAuthPort({
    auth: {
      async signInWithPassword(input) {
        calls.push({ kind: "signin", input });
        return { data: { session: { access_token: "opaque-test-value" } }, error: null };
      },
      async signUp(input) {
        calls.push({ kind: "signup", input });
        return { data: { session: null }, error: null };
      },
    },
  });

  const result = await port.signInWithPassword({
    email: "editor@example.test",
    password: "password123",
  });

  assert.deepEqual(calls, [{
    kind: "signin",
    input: { email: "editor@example.test", password: "password123" },
  }]);
  assert.deepEqual(result, { session: true });
});

test("native credential adapter maps signup redirect and pending session semantics", async () => {
  const calls: unknown[] = [];
  const port = createNativeSupabaseCredentialAuthPort({
    auth: {
      async signInWithPassword() {
        return { data: { session: null }, error: null };
      },
      async signUp(input) {
        calls.push(input);
        return { data: { session: null }, error: null };
      },
    },
  });

  const result = await port.signUp({
    email: "editor@example.test",
    password: "password123",
    emailRedirectTo: "https://lebtig.test/admin",
  });

  assert.deepEqual(calls, [{
    email: "editor@example.test",
    password: "password123",
    options: { emailRedirectTo: "https://lebtig.test/admin" },
  }]);
  assert.deepEqual(result, { session: false });
});

test("native credential adapter normalizes provider errors", async () => {
  const port = createNativeSupabaseCredentialAuthPort({
    auth: {
      async signInWithPassword() {
        return { data: { session: null }, error: { message: "invalid credentials" } };
      },
      async signUp() {
        return { data: { session: null }, error: { message: "signup disabled" } };
      },
    },
  });

  const signIn = await port.signInWithPassword({
    email: "editor@example.test",
    password: "password123",
  });
  assert.equal(signIn.session, false);
  assert.equal(signIn.error?.message, "invalid credentials");

  const signUp = await port.signUp({
    email: "editor@example.test",
    password: "password123",
    emailRedirectTo: "https://lebtig.test/admin",
  });
  assert.equal(signUp.session, false);
  assert.equal(signUp.error?.message, "signup disabled");
});
