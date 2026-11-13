import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  patchEnvoyRealtimeConfig,
  renderFactoryComposeOverride,
  renderFactoryRuntimeEnv,
  resolveDockerRuntimeLayout,
  resolveManifest,
  type SupabaseFactoryManifest,
} from "../src/index.ts";

function manifest(
  projectId = "customer-one",
  profile: SupabaseFactoryManifest["profile"] = "webapp",
) {
  return resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: projectId, environment: "production" },
    profile,
  });
}

test("two projects receive unique Compose and Realtime identities", () => {
  const first = resolveDockerRuntimeLayout(manifest("customer-one"), { hostId: "node-a", apiGatewayPort: 18001 });
  const second = resolveDockerRuntimeLayout(manifest("customer-two"), { hostId: "node-a", apiGatewayPort: 18002 });

  assert.notEqual(first.composeProjectName, second.composeProjectName);
  assert.notEqual(first.realtimeTenantName, second.realtimeTenantName);
  assert.notEqual(first.apiGatewayPort, second.apiGatewayPort);
  assert.equal(first.realtimeDnsName, `${first.realtimeTenantName}.supabase-realtime`);
});

test("Factory override removes fixed container names and closes database host ports", () => {
  const rendered = renderFactoryComposeOverride(manifest(), { hostId: "node-a", apiGatewayPort: 18001 });

  for (const service of ["studio", "api-gw", "auth", "rest", "storage", "db", "supavisor"]) {
    assert.match(rendered, new RegExp(`  ${service}:\\n    container_name: !reset null`));
  }

  assert.match(rendered, /supavisor:[\s\S]*ports: !reset \[\]/);
  assert.match(rendered, /127\.0\.0\.1:18001:8000\/tcp/);
  assert.equal(rendered.includes("0.0.0.0:18001"), false);
});

test("minimal profile actually disables optional Compose services and removes Envoy Studio dependency", () => {
  const resolved = manifest("minimal-project", "minimal");
  const rendered = renderFactoryComposeOverride(resolved, { hostId: "node-a", apiGatewayPort: 18101 });
  const layout = resolveDockerRuntimeLayout(resolved, { hostId: "node-a", apiGatewayPort: 18101 });

  for (const disabled of ["studio", "realtime", "storage", "imgproxy", "meta", "functions"]) {
    assert.ok(layout.disabledComposeServices.includes(disabled));
    const block = rendered.slice(rendered.indexOf(`  ${disabled}:`));
    assert.match(block, /profiles: !override\n      - factory-disabled/);
  }
  assert.match(rendered, /api-gw:[\s\S]*depends_on: !reset \{\}/);
});

test("production Storage override uses project-scoped S3 contract without embedding credentials", () => {
  const rendered = renderFactoryComposeOverride(manifest(), { hostId: "node-a", apiGatewayPort: 18001 });
  assert.match(rendered, /STORAGE_BACKEND: s3/);
  assert.match(rendered, /GLOBAL_S3_BUCKET: "customer-one"/);
  assert.match(rendered, /AWS_ACCESS_KEY_ID: \$\{FACTORY_S3_ACCESS_KEY_ID:\?FACTORY_S3_ACCESS_KEY_ID is required\}/);
  assert.match(rendered, /AWS_SECRET_ACCESS_KEY: \$\{FACTORY_S3_SECRET_ACCESS_KEY:\?FACTORY_S3_SECRET_ACCESS_KEY is required\}/);
  assert.equal(rendered.includes("sb_secret_"), false);
});

test("runtime env selects generated layer and does not contain secrets", () => {
  const rendered = renderFactoryRuntimeEnv(manifest(), { hostId: "node-a", apiGatewayPort: 18001 });
  assert.match(rendered, /^COMPOSE_PROJECT_NAME=sbf-customer-one$/m);
  assert.match(rendered, /^COMPOSE_FILE=docker-compose\.yml:docker-compose\.factory\.yml$/m);
  assert.match(rendered, /^FACTORY_HOST_ID=node-a$/m);
  assert.equal(rendered.includes("PASSWORD="), false);
  assert.equal(rendered.includes("SECRET_KEY="), false);
});

test("Envoy patch replaces every official single-project Realtime host marker and fails closed after upstream drift", () => {
  const source = [
    "address: realtime-dev.supabase-realtime",
    "host_rewrite_literal: realtime-dev.supabase-realtime",
    "host_rewrite_literal: realtime-dev.supabase-realtime",
  ].join("\n");
  const patched = patchEnvoyRealtimeConfig(source, "sbf-customer-one.supabase-realtime");

  assert.equal(patched.includes("realtime-dev.supabase-realtime"), false);
  assert.equal((patched.match(/sbf-customer-one\.supabase-realtime/g) ?? []).length, 3);
  assert.throws(() => patchEnvoyRealtimeConfig("upstream changed", "sbf-x.supabase-realtime"), /review upstream/);
});
