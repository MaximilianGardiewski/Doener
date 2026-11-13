import assert from "node:assert/strict";
import test from "node:test";
import { FetchPublicEndpointVerifier } from "../src/index.ts";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

function withMockFetch(
  responder: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { calls: RecordedRequest[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: RecordedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return responder(url, init);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("public verifier requires Auth health, REST secret-key access and 401 enforcement", async () => {
  const mock = withMockFetch((url, init) => {
    const headers = new Headers(init?.headers);
    if (url.endsWith("/auth/v1/health")) {
      assert.equal(headers.get("apikey"), "sb_publishable_test");
      return Response.json({ version: "v2.182.1", name: "GoTrue" }, { status: 200 });
    }
    if (url.endsWith("/rest/v1/") && headers.get("apikey") === "sb_secret_test") {
      return Response.json({ paths: {} }, { status: 200 });
    }
    if (url.endsWith("/rest/v1/") && !headers.has("apikey")) {
      return Response.json({ message: "No API key found" }, { status: 401 });
    }
    return new Response(null, { status: 500 });
  });

  try {
    const report = await new FetchPublicEndpointVerifier().verify({
      publicUrl: "https://api.example.test",
      publishableKey: "sb_publishable_test",
      secretKey: "sb_secret_test",
    });
    assert.equal(report.healthy, true);
    assert.deepEqual(report.checks, {
      httpsBoundary: true,
      authHealth: true,
      restWithSecretKey: true,
      apiKeyEnforcement: true,
    });
    assert.equal(report.authVersion, "v2.182.1");
    assert.equal(mock.calls.length, 3);
    assert.ok(mock.calls.every((call) => call.init?.redirect === "manual"));
  } finally {
    mock.restore();
  }
});

test("public verifier marks gateway degraded when missing-key request is not rejected", async () => {
  const mock = withMockFetch((url, init) => {
    const headers = new Headers(init?.headers);
    if (url.endsWith("/auth/v1/health")) return Response.json({ version: "v1", name: "GoTrue" });
    if (headers.has("apikey")) return Response.json({}, { status: 200 });
    return Response.json({}, { status: 200 });
  });

  try {
    const report = await new FetchPublicEndpointVerifier().verify({
      publicUrl: "https://api.example.test",
      publishableKey: "sb_publishable_test",
      secretKey: "sb_secret_test",
    });
    assert.equal(report.healthy, false);
    assert.equal(report.checks.apiKeyEnforcement, false);
  } finally {
    mock.restore();
  }
});

test("public verifier rejects HTTP by default before sending any key", async () => {
  const mock = withMockFetch(() => new Response(null, { status: 200 }));
  try {
    await assert.rejects(() => new FetchPublicEndpointVerifier().verify({
      publicUrl: "http://api.example.test",
      publishableKey: "sb_publishable_test",
      secretKey: "sb_secret_test",
    }), /must use HTTPS/);
    assert.equal(mock.calls.length, 0);
  } finally {
    mock.restore();
  }
});

test("public verifier never follows redirects with privileged API keys", async () => {
  const mock = withMockFetch((_url, init) => {
    assert.equal(init?.redirect, "manual");
    return new Response(null, { status: 302, headers: { location: "https://attacker.invalid/" } });
  });

  try {
    const report = await new FetchPublicEndpointVerifier().verify({
      publicUrl: "https://api.example.test",
      publishableKey: "sb_publishable_test",
      secretKey: "sb_secret_test",
    });
    assert.equal(report.healthy, false);
    assert.equal(mock.calls.length, 3);
    assert.ok(mock.calls.every((call) => !call.url.includes("attacker.invalid")));
  } finally {
    mock.restore();
  }
});
