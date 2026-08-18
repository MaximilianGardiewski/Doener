import test from "node:test";
import assert from "node:assert/strict";
import type { OAuthPort } from "../src/oauth.ts";

test("OAuth port is provider-neutral and reports navigation ownership", async () => {
  const calls: unknown[] = [];
  const port: OAuthPort = {
    async signInWithOAuth(request) {
      calls.push(request);
      return { navigation: "external" };
    },
  };

  const result = await port.signInWithOAuth({
    provider: "google",
    redirectTo: "https://example.test/admin",
  });
  assert.equal(result.navigation, "external");
  assert.deepEqual(calls, [{ provider: "google", redirectTo: "https://example.test/admin" }]);
});
