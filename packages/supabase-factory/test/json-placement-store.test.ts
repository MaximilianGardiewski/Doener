import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JsonFilePlacementStore } from "../src/index.ts";

async function store() {
  const root = await mkdtemp(join(tmpdir(), "sbf-placement-"));
  const path = join(root, "placements.json");
  return { path, store: new JsonFilePlacementStore(path) };
}

test("JSON placement store persists restart-safe project placement with mode 0600", async () => {
  const { path, store: first } = await store();
  await first.put({
    projectId: "alpha-app",
    hostId: "factory-node",
    projectRoot: "/srv/supabase-factory/alpha-app",
    apiGatewayPort: 18001,
  });

  const restarted = new JsonFilePlacementStore(path);
  assert.deepEqual(await restarted.get("alpha-app"), {
    projectId: "alpha-app",
    hostId: "factory-node",
    projectRoot: "/srv/supabase-factory/alpha-app",
    apiGatewayPort: 18001,
  });
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const raw = JSON.parse(await readFile(path, "utf8")) as { version: number; placements: unknown[] };
  assert.equal(raw.version, 1);
  assert.equal(raw.placements.length, 1);
});

test("JSON placement store refuses two projects on the same host gateway port", async () => {
  const { store } = await store();
  await store.put({ projectId: "alpha-app", hostId: "node-a", projectRoot: "/srv/alpha", apiGatewayPort: 18001 });
  await assert.rejects(
    () => store.put({ projectId: "beta-app", hostId: "node-a", projectRoot: "/srv/beta", apiGatewayPort: 18001 }),
    /already assigned to alpha-app/,
  );
  assert.equal((await store.list()).length, 1);
});

test("concurrent placement writes are serialized without losing unrelated projects", async () => {
  const { store } = await store();
  await Promise.all([
    store.put({ projectId: "alpha-app", hostId: "node-a", projectRoot: "/srv/alpha", apiGatewayPort: 18001 }),
    store.put({ projectId: "beta-app", hostId: "node-a", projectRoot: "/srv/beta", apiGatewayPort: 18002 }),
    store.put({ projectId: "gamma-app", hostId: "node-a", projectRoot: "/srv/gamma", apiGatewayPort: 18003 }),
  ]);
  assert.deepEqual((await store.list()).map((item) => item.projectId), ["alpha-app", "beta-app", "gamma-app"]);
});

test("placement deletion persists across a new store instance", async () => {
  const { path, store: first } = await store();
  await first.put({ projectId: "alpha-app", hostId: "node-a", projectRoot: "/srv/alpha", apiGatewayPort: 18001 });
  await first.delete("alpha-app");
  assert.deepEqual(await new JsonFilePlacementStore(path).list(), []);
});
