import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  RcloneS3StorageBackupProvider,
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
  readonly calls: Array<{ file: string; args: readonly string[] }> = [];
  readonly writes = new Map<string, string>();
  readonly removed: string[] = [];
  counter = 0;
  inventory = JSON.stringify([
    { Path: "avatars/a.png", Size: 100, Hashes: { MD5: "aaa" } },
    { Path: "uploads/b.pdf", Size: 200, Hashes: { MD5: "bbb" } },
  ]);

  async exec(file: string, args: readonly string[] = [], _options: HostCommandOptions = {}): Promise<HostCommandResult> {
    this.calls.push({ file, args });
    if (file === "mktemp") {
      this.counter += 1;
      return { stdout: `/dev/shm/sbf-rclone-mirror-app-T${this.counter}\n`, stderr: "" };
    }
    if (file === "rclone" && args.includes("lsjson")) return { stdout: this.inventory, stderr: "" };
    if (file === "rclone") return { stdout: "ok\n", stderr: "" };
    return { stdout: "", stderr: "" };
  }
  async exists(): Promise<boolean> { return true; }
  async mkdir(): Promise<void> {}
  async readText(path: string): Promise<string> { return this.writes.get(path) ?? ""; }
  async writeText(path: string, content: string): Promise<void> { this.writes.set(path, content); }
  async chmod(): Promise<void> {}
  async remove(path: string): Promise<void> { this.removed.push(path); }
}

async function fixture() {
  const secrets = new MemorySecretStore();
  const sourceAccess = await secrets.put("source/access", "source-access-secret");
  const sourceSecret = await secrets.put("source/secret", "source-secret-value");
  const targetAccess = await secrets.put("target/access", "target-access-secret");
  const targetSecret = await secrets.put("target/secret", "target-secret-value");
  const host = new FakeHost();
  const provider = new RcloneS3StorageBackupProvider({
    projectId: "mirror-app",
    host,
    secretStore: secrets,
    source: {
      bucket: "live-storage",
      prefix: "mirror-app",
      region: "eu-central-1",
      endpoint: "https://live.objects.example.invalid",
      accessKeyId: sourceAccess,
      secretAccessKey: sourceSecret,
    },
    target: {
      bucket: "disaster-recovery",
      region: "eu-central-1",
      endpoint: "https://backup.objects.example.invalid",
      accessKeyId: targetAccess,
      secretAccessKey: targetSecret,
    },
  });
  return { secrets, host, provider };
}

test("S3 mirror copies to unique off-host prefix, content-checks it and returns stable inventory", async () => {
  const { host, provider } = await fixture();
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "mirror-app", environment: "production" },
    profile: "webapp",
  });
  const reference = await provider.backup({
    projectId: "mirror-app",
    backupId: "20260826040000",
    manifest,
    placement: { projectId: "mirror-app", hostId: "node-a", projectRoot: "/srv/sbf/mirror-app", apiGatewayPort: 18000 },
  });

  assert.equal(reference.objectCount, 2);
  assert.match(reference.checksum ?? "", /^[0-9a-f]{64}$/);
  assert.match(reference.ref, /^sbf-s3mirror:/);
  const copy = host.calls.find((call) => call.file === "rclone" && call.args.includes("copy"));
  assert.ok(copy);
  assert.ok(copy.args.includes("source:live-storage/mirror-app"));
  assert.ok(copy.args.includes("target:disaster-recovery/supabase-storage-backups/mirror-app/20260826040000"));
  assert.ok(copy.args.includes("--immutable"));
  const check = host.calls.find((call) => call.file === "rclone" && call.args.includes("check"));
  assert.ok(check?.args.includes("--download"));
  assert.equal(await provider.verify(reference), true);
  assert.ok(host.removed.some((path) => path.startsWith("/dev/shm/sbf-rclone-")));
});

test("S3 mirror credentials exist only in ephemeral config, never rclone command arguments", async () => {
  const { host, provider } = await fixture();
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "mirror-app", environment: "production" },
    profile: "webapp",
  });
  await provider.backup({
    projectId: "mirror-app",
    backupId: "20260826040100",
    manifest,
    placement: { projectId: "mirror-app", hostId: "node-a", projectRoot: "/srv/sbf/mirror-app", apiGatewayPort: 18000 },
  });

  const args = JSON.stringify(host.calls.filter((call) => call.file === "rclone").map((call) => call.args));
  for (const secret of ["source-access-secret", "source-secret-value", "target-access-secret", "target-secret-value"]) {
    assert.equal(args.includes(secret), false);
  }
  const configs = [...host.writes.values()].join("\n");
  assert.match(configs, /source-secret-value/);
  assert.match(configs, /target-secret-value/);
  assert.ok(host.removed.length >= 1);
});

test("S3 mirror verification detects changed target inventory", async () => {
  const { host, provider } = await fixture();
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "mirror-app", environment: "production" },
    profile: "webapp",
  });
  const reference = await provider.backup({
    projectId: "mirror-app",
    backupId: "20260826040200",
    manifest,
    placement: { projectId: "mirror-app", hostId: "node-a", projectRoot: "/srv/sbf/mirror-app", apiGatewayPort: 18000 },
  });
  host.inventory = JSON.stringify([{ Path: "avatars/a.png", Size: 101, Hashes: { MD5: "changed" } }]);
  assert.equal(await provider.verify(reference), false);
});
