import assert from "node:assert/strict";
import test from "node:test";
import { createMenuHandler } from "../api/menu.js";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = "") { this.body = value; },
    json() { return JSON.parse(this.body); },
  };
}

function request(method = "GET", url = "/api/menu") {
  return { method, url };
}

const configuredEnv = {
  SUPABASE_URL: "https://example.supabase.co/",
  SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  MCELLO_LOCATION_ID: "00000000-0000-4000-8000-000000000001",
};

test("public menu endpoint calls both public RPCs and merges the snapshot", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const payload = url.endsWith("/get_public_menu")
      ? { locationId: configuredEnv.MCELLO_LOCATION_ID, categories: [{ slug: "warm" }] }
      : { productCrossSells: [], crossSellRules: [] };
    return { ok: true, json: async () => payload };
  };
  const res = responseRecorder();
  await createMenuHandler({ env: configuredEnv, fetchImpl })(request("GET", "/api/menu?at=2026-11-13T12%3A00%3A00Z"), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.deepEqual(res.json(), {
    locationId: configuredEnv.MCELLO_LOCATION_ID,
    categories: [{ slug: "warm" }],
    productCrossSells: [],
    crossSellRules: [],
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/rpc/get_public_menu");
  assert.equal(calls[0].body._location_id, configuredEnv.MCELLO_LOCATION_ID);
  assert.equal(calls[0].body._at, "2026-11-13T12:00:00.000Z");
  assert.equal(calls[1].url, "https://example.supabase.co/rest/v1/rpc/get_public_cross_sells");
  assert.equal(calls[0].options.headers.apikey, "public-test-key");
  assert.equal(calls[0].options.headers.authorization, "Bearer public-test-key");
});

test("public menu endpoint accepts the legacy anon key and default location", async () => {
  const res = responseRecorder();
  await createMenuHandler({
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key" },
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  })(request(), res);
  assert.equal(res.statusCode, 200);
});

test("public menu endpoint rejects invalid timestamps", async () => {
  let called = false;
  const res = responseRecorder();
  await createMenuHandler({ env: configuredEnv, fetchImpl: async () => { called = true; } })(request("GET", "/api/menu?at=not-a-date"), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "INVALID_MENU_TIME");
  assert.equal(called, false);
});

test("public menu endpoint reports missing Supabase configuration without leaking secrets", async () => {
  const res = responseRecorder();
  await createMenuHandler({ env: {}, fetchImpl: async () => { throw new Error("must not run"); } })(request(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.json().error, "MENU_BACKEND_UNAVAILABLE");
  assert.equal(res.body.includes("must not run"), false);
});

test("public menu endpoint handles failed Supabase RPCs safely", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = responseRecorder();
    await createMenuHandler({
      env: configuredEnv,
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "private database detail" }),
    })(request(), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().error, "MENU_BACKEND_UNAVAILABLE");
    assert.equal(res.body.includes("private database detail"), false);
  } finally {
    console.error = originalError;
  }
});

test("public menu endpoint only allows GET", async () => {
  const res = responseRecorder();
  await createMenuHandler({ env: configuredEnv })(request("POST"), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "GET");
});
