import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  EncryptedJsonSecretStore,
  FACTORY_API_VERSION,
  MemoryPlacementStore,
  ProjectScheduler,
  SUPABASE_BASELINE,
  parseComposeVersion,
  parseEnvFile,
  patchEnvFile,
  resolveManifest,
  versionAtLeast,
} from "../src/index.ts";

test("encrypted secret store never writes plaintext and rejects a wrong master key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sbf-secrets-"));
  const path = join(directory, "secrets.json");
  const masterKey = Buffer.alloc(32, 7);
  const store = new EncryptedJsonSecretStore(path, masterKey);
  const ref = await store.put("projects/customer-one/supabase/POSTGRES_PASSWORD", "plain-secret-value");

  assert.equal(await store.get(ref), "plain-secret-value");
  const raw = await readFile(path, "utf8");
  assert.equal(raw.includes("plain-secret-value"), false);
  assert.match(raw, /"algorithm":"aes-256-gcm"/);

  const wrong = new EncryptedJsonSecretStore(path, Buffer.alloc(32, 8));
  await assert.rejects(() => wrong.get(ref));
});

test("project scheduler is idempotent and never reuses a gateway port on the same host", async () => {
  const store = new MemoryPlacementStore();
  const scheduler = new ProjectScheduler([
    {
      id: "node-a",
      enabled: true,
      projectRoot: "/srv/supabase-factory/projects",
      gatewayPortStart: 18000,
      gatewayPortEnd: 18002,
      maxProjects: 3,
      labels: { region: "eu-central" },
    },
  ], store);

  const first = await scheduler.allocate("customer-one", { region: "eu-central" });
  const same = await scheduler.allocate("customer-one", { region: "eu-central" });
  const second = await scheduler.allocate("customer-two", { region: "eu-central" });

  assert.deepEqual(first, same);
  assert.equal(first.apiGatewayPort, 18000);
  assert.equal(second.apiGatewayPort, 18001);
  assert.notEqual(first.apiGatewayPort, second.apiGatewayPort);
  assert.equal((await scheduler.get("customer-one"))?.hostId, "node-a");
});

test("scheduler fails closed when host capacity is exhausted", async () => {
  const scheduler = new ProjectScheduler([
    {
      id: "node-a",
      enabled: true,
      projectRoot: "/srv/sbf",
      gatewayPortStart: 19000,
      gatewayPortEnd: 19000,
      maxProjects: 1,
    },
  ], new MemoryPlacementStore());

  await scheduler.allocate("first-app");
  await assert.rejects(() => scheduler.allocate("second-app"), /no Factory host capacity/);
});

test("environment patching replaces existing values and appends missing managed values deterministically", () => {
  const source = "# upstream\nA=old\nB=keep\n";
  const patched = patchEnvFile(source, { A: "new", C: "added" });
  const parsed = parseEnvFile(patched);

  assert.equal(parsed.get("A"), "new");
  assert.equal(parsed.get("B"), "keep");
  assert.equal(parsed.get("C"), "added");
  assert.equal((patched.match(/^A=/gm) ?? []).length, 1);
});

test("Docker Compose version gate accepts 2.24.4+ and rejects older versions", () => {
  assert.deepEqual(parseComposeVersion("Docker Compose version v2.24.4"), [2, 24, 4]);
  assert.equal(versionAtLeast([2, 24, 4], [2, 24, 4]), true);
  assert.equal(versionAtLeast([2, 30, 0], [2, 24, 4]), true);
  assert.equal(versionAtLeast([2, 23, 9], [2, 24, 4]), false);
});

test("baseline release carries the reviewed exact upstream commit", () => {
  const resolved = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "baseline-app", environment: "staging" },
    profile: "minimal",
  });
  assert.equal(resolved.supabase.release, SUPABASE_BASELINE.release);
  assert.equal(resolved.supabase.upstreamCommit, SUPABASE_BASELINE.upstreamCommit);
});

test("non-baseline releases require an explicit verified commit pin", () => {
  assert.throws(() => resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "future-app", environment: "staging" },
    profile: "minimal",
    supabase: { release: "self-hosted/v0.9.0" },
  }), /upstreamCommit is required/);

  const resolved = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "future-app", environment: "staging" },
    profile: "minimal",
    supabase: {
      release: "self-hosted/v0.9.0",
      upstreamCommit: "0123456789abcdef0123456789abcdef01234567",
    },
  });
  assert.equal(resolved.supabase.upstreamCommit, "0123456789abcdef0123456789abcdef01234567");
});

test("Storage cannot be enabled without REST and Analytics fails closed in Docker V1", () => {
  assert.throws(() => resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "broken-storage", environment: "staging" },
    profile: "webapp",
    features: { rest: false },
  }), /Storage requires REST/);

  assert.throws(() => resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "logs-app", environment: "staging" },
    profile: "minimal",
    features: { analytics: true },
  }), /Analytics is not enabled/);
});
