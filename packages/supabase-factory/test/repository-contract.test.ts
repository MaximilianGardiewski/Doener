import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  FACTORY_REPOSITORY_LOCK_PATH,
  FACTORY_REPOSITORY_MANIFEST_PATH,
  SUPABASE_BASELINE,
  buildFactoryRepositoryLock,
  parseFactoryRepositoryManifest,
  renderFactoryRepositoryLock,
  renderFactoryRepositoryManifest,
  type SupabaseFactoryManifest,
} from "../src/index.ts";

function manifest(): SupabaseFactoryManifest {
  return {
    apiVersion: FACTORY_API_VERSION,
    project: { id: "github-app", environment: "development", displayName: "GitHub App" },
    profile: "realtime",
    features: { realtime: true },
    auth: { email: { enabled: true, autoConfirm: true } },
  };
}

test("repository manifest has stable canonical paths and roundtrips without deployment data", () => {
  assert.equal(FACTORY_REPOSITORY_MANIFEST_PATH, ".supabase-factory/project.json");
  assert.equal(FACTORY_REPOSITORY_LOCK_PATH, ".supabase-factory/lock.json");

  const rendered = renderFactoryRepositoryManifest(manifest());
  const parsed = parseFactoryRepositoryManifest(rendered);
  assert.deepEqual(parsed, manifest());
  assert.equal(rendered.includes("Ubuntu"), false);
  assert.equal(rendered.includes("Cloudflare"), false);
  assert.equal(rendered.includes("systemd"), false);
  assert.equal(rendered.includes("server"), false);
});

test("repository lock resolves exact Supabase baseline and remains explicitly deployment-neutral", () => {
  const lock = buildFactoryRepositoryLock(manifest());
  assert.equal(lock.version, 1);
  assert.equal(lock.sourcePath, FACTORY_REPOSITORY_MANIFEST_PATH);
  assert.match(lock.manifestSha256, /^[0-9a-f]{64}$/);
  assert.equal(lock.resolved.supabase.release, SUPABASE_BASELINE.release);
  assert.equal(lock.resolved.supabase.upstreamCommit, SUPABASE_BASELINE.upstreamCommit);
  assert.equal(lock.containsSecretValues, false);
  assert.equal(lock.deploymentTargetSelected, false);

  const serialized = renderFactoryRepositoryLock(manifest());
  assert.equal(serialized.includes("SUPABASE_ACCESS_TOKEN"), false);
  assert.equal(serialized.includes("sbp_"), false);
});

test("repository manifest refuses secret-like fields so GitHub never becomes the secret store", () => {
  const candidate = JSON.stringify({
    ...manifest(),
    databasePassword: "do-not-commit-this",
  });
  assert.throws(
    () => parseFactoryRepositoryManifest(candidate),
    /must not contain secret-like field/,
  );
});

test("repository manifest refuses Supabase Cloud management material", () => {
  const candidate = JSON.stringify({
    ...manifest(),
    notes: "run supabase login with SUPABASE_ACCESS_TOKEN",
  });
  assert.throws(
    () => parseFactoryRepositoryManifest(candidate),
    /forbidden Cloud-management content/,
  );
});

test("repository lock hash changes when declarative project state changes", () => {
  const first = buildFactoryRepositoryLock(manifest());
  const second = buildFactoryRepositoryLock({ ...manifest(), profile: "full" });
  assert.notEqual(first.manifestSha256, second.manifestSha256);
});
