import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SupabaseRestRpcClient } from "../../packages/supabase-adapter/src/rest-rpc.ts";
import { startLocalNotificationWorker } from "./notification-worker.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
await loadEnv(path.join(repoRoot, ".env.local"));

const port = Number(process.env.PORT || 4173);
const baseUrl = optionalEnv("SUPABASE_URL")?.replace(/\/$/, "");
const serviceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");

startLocalNotificationWorker({
  publicBaseUrl: `http://127.0.0.1:${port}`,
  rpcFactory() {
    if (!baseUrl || !serviceRoleKey) return null;
    return new SupabaseRestRpcClient({
      baseUrl,
      apiKey: serviceRoleKey,
      authorizationToken: serviceRoleKey,
    });
  },
});

await import("./server.mjs");

async function loadEnv(file) {
  try {
    const raw = await readFile(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = stripQuotes(trimmed.slice(index + 1).trim());
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Static-only preview remains usable without .env.local.
  }
}

function optionalEnv(name) {
  const value = process.env[name];
  return value ? stripQuotes(value.trim()) : undefined;
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}
