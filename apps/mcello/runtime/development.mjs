import path from "node:path";
import { fileURLToPath } from "node:url";

import { SupabaseRestRpcClient } from "@business-web/supabase-adapter";
import { startLocalNotificationWorker } from "../notification-worker.mjs";
import { loadEnv, optionalEnv } from "./env.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
await loadEnv(path.join(repoRoot, ".env.local"));

const port = Number(process.env.PORT || 4173);
const baseUrl = optionalEnv("SUPABASE_URL")?.replace(/\/$/, "");
const serviceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
const publicBaseUrl = optionalEnv("MCELLO_PUBLIC_BASE_URL")?.replace(/\/$/, "") || `http://127.0.0.1:${port}`;

startLocalNotificationWorker({
  publicBaseUrl,
  rpcFactory() {
    if (!baseUrl || !serviceRoleKey) return null;
    return new SupabaseRestRpcClient({
      baseUrl,
      apiKey: serviceRoleKey,
      authorizationToken: serviceRoleKey,
    });
  },
});

await import("../server.mjs");
