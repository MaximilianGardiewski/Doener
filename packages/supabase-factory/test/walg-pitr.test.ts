import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  WalGPitrProvider,
  resolveManifest,
  type FactoryHostExecutor,
  type HostCommandOptions,
  type HostCommandResult,
  type SecretRef,
  type SecretStore,
} from "../src/index.ts";

class MemorySecretStore implements SecretStore {
  readonly name = "memory";
  readonly values = new Map<string, string>();
  async put(key: string, value: string): Promise<SecretRef> { this.values.set(key, value); return { store: this.name, key }; }
  async get(ref: SecretRef): Promise<string> {
    const value = this.values.get(ref.key);
    if (value === undefined) throw new Error(`missing secret ${ref.key}`);
    return value;
  }
  async has(key: string): Promise<boolean> { return this.values.has(key); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

class FakeHost implements FactoryHostExecutor {
  readonly id = "node-a";
  readonly calls: Array<{ file: string; args: readonly string[]; env?: Readonly<Record<string, string>> }> = [];
  walShow = "Timeline 1: OK\n";
  async exec(file: string, args: readonly string[] = [], options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.calls.push({ file, args, env: options.env });
    if (file === "docker" && args.includes("ps")) return { stdout: "db-container\n", stderr: "" };
    if (file === "docker" && args[0] === "inspect") return { stdout: "172.30.0.8 \n", stderr: "" };
    if (file === "psql") return { stdout: "0/1600010\n0/1600088\n0/16000A0\n", stderr: "" };
    if (file === "wal-g" && args[0] === "backup-list") {
      return { stdout: JSON.stringify([{ backup_name: "base_000000010000000000000016", time: "2026-08-26T03:00:00Z" }]), stderr: "" };
    }
    if (file === "wal-g" && args[0] === "wal-show") return { stdout: this.walShow, stderr: "" };
    if (file === "wal-g") return { stdout: "ok\n", stderr: "" };
    return { stdout: "", stderr: "" };
  }
  async exists(): Promise<boolean> { return true; }
  async mkdir(): Promise<void> {}
  async readText(): Promise<string> { return ""; }
  async writeText(): Promise<void> {}
  async chmod(): Promise<void> {}
  async remove(): Promise<void> {}
}

async function fixture() {
  const secrets = new MemorySecretStore();
  await secrets.put("projects/pitr-app/supabase/POSTGRES_PASSWORD", "db-secret-password");
  const access = await secrets.put("pitr/access", "pitr-access-key");
  const secret = await secrets.put("pitr/secret", "pitr-secret-key");
  const host = new FakeHost();
  const provider = new WalGPitrProvider({
    projectId: "pitr-app",
    host,
    secretStore: secrets,
    storage: {
      prefix: "s3://wal-archive/pitr-app",
      region: "eu-central-1",
      endpoint: "https://wal.objects.example.invalid",
      forcePathStyle: true,
      accessKeyId: access,
      secretAccessKey: secret,
    },
  });
  return { host, provider };
}

test("WAL-G PITR checkpoint creates restore point, switches WAL and verifies gap-free archive", async () => {
  const { host, provider } = await fixture();
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "pitr-app", environment: "production" },
    profile: "production-critical",
  });
  const checkpoint = await provider.checkpoint({
    projectId: "pitr-app",
    backupId: "20260826040500",
    manifest,
    placement: { projectId: "pitr-app", hostId: "node-a", projectRoot: "/srv/sbf/pitr-app", apiGatewayPort: 18000 },
  });

  assert.equal(checkpoint.provider, "wal-g");
  assert.equal(checkpoint.recoverable, true);
  assert.match(checkpoint.checkpoint, /^sbf_pitr_app_20260826040500@0\/16000A0#base_/);
  const psql = host.calls.find((call) => call.file === "psql");
  assert.ok(psql?.args.join(" ").includes("pg_create_restore_point"));
  assert.ok(psql?.args.join(" ").includes("pg_switch_wal"));
  const push = host.calls.find((call) => call.file === "wal-g" && call.args[0] === "backup-push");
  assert.ok(push?.args.includes("--verify"));
  assert.ok(host.calls.some((call) => call.file === "wal-g" && call.args[0] === "wal-show"));
});

test("WAL-G credentials and database password stay out of command arguments", async () => {
  const { host, provider } = await fixture();
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "pitr-app", environment: "production" },
    profile: "production-critical",
  });
  await provider.checkpoint({
    projectId: "pitr-app",
    backupId: "20260826040600",
    manifest,
    placement: { projectId: "pitr-app", hostId: "node-a", projectRoot: "/srv/sbf/pitr-app", apiGatewayPort: 18000 },
  });
  const args = JSON.stringify(host.calls.map((call) => call.args));
  for (const secret of ["db-secret-password", "pitr-access-key", "pitr-secret-key"]) assert.equal(args.includes(secret), false);
  const walg = host.calls.find((call) => call.file === "wal-g" && call.args[0] === "backup-push");
  assert.equal(walg?.env?.PGPASSWORD, "db-secret-password");
  assert.equal(walg?.env?.AWS_ACCESS_KEY_ID, "pitr-access-key");
  assert.equal(walg?.env?.AWS_SECRET_ACCESS_KEY, "pitr-secret-key");
});

test("WAL-G PITR fails closed when wal-show reports a gap", async () => {
  const { host, provider } = await fixture();
  host.walShow = "Timeline 1: missing segment; status ERROR\n";
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "pitr-app", environment: "production" },
    profile: "production-critical",
  });
  await assert.rejects(() => provider.checkpoint({
    projectId: "pitr-app",
    backupId: "20260826040700",
    manifest,
    placement: { projectId: "pitr-app", hostId: "node-a", projectRoot: "/srv/sbf/pitr-app", apiGatewayPort: 18000 },
  }), /not gap-free/);
});
