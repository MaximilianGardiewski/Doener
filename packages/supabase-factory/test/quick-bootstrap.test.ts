import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bootstrapQuickService } from "../src/index.ts";

async function paths() {
  const root = await mkdtemp(join(tmpdir(), "sbf-bootstrap-"));
  return {
    root,
    configDir: join(root, "etc"),
    dataDir: join(root, "data"),
    projectRoot: join(root, "projects"),
  };
}

test("quick bootstrap creates strong mode-0600 secrets and does not return their values", async () => {
  const input = await paths();
  const result = await bootstrapQuickService(input);
  assert.equal(result.createdMasterKey, true);
  assert.equal(result.createdMcpToken, true);
  const master = (await readFile(result.masterKeyFile, "utf8")).trim();
  const token = (await readFile(result.mcpTokenFile, "utf8")).trim();
  assert.match(master, /^[0-9a-f]{64}$/);
  assert.match(token, /^sbf_[A-Za-z0-9_-]{60,}$/);
  assert.equal((await stat(result.masterKeyFile)).mode & 0o777, 0o600);
  assert.equal((await stat(result.mcpTokenFile)).mode & 0o777, 0o600);
  assert.equal(JSON.stringify(result).includes(master), false);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("quick bootstrap is idempotent and never overwrites existing key/token", async () => {
  const input = await paths();
  const first = await bootstrapQuickService(input);
  const masterBefore = await readFile(first.masterKeyFile, "utf8");
  const tokenBefore = await readFile(first.mcpTokenFile, "utf8");
  const second = await bootstrapQuickService(input);
  assert.equal(second.createdMasterKey, false);
  assert.equal(second.createdMcpToken, false);
  assert.equal(await readFile(first.masterKeyFile, "utf8"), masterBefore);
  assert.equal(await readFile(first.mcpTokenFile, "utf8"), tokenBefore);
});

test("quick bootstrap refuses to invent a new master key when encrypted state already exists", async () => {
  const input = await paths();
  await mkdir(input.dataDir, { recursive: true });
  await writeFile(join(input.dataDir, "secrets.enc.json"), "existing encrypted state\n");
  await assert.rejects(
    () => bootstrapQuickService(input),
    /restore the original master key/,
  );
});
