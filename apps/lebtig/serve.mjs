import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { buildLebtigSitemap, resolveLebtigLegacyRedirect } from "./src/http-contracts.ts";
import { findLebtigPublicAuthRoute } from "./src/routes/manifest.ts";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.join(appRoot, "dist");
const host = process.env.LEBTIG_HOST || "127.0.0.1";
const port = Number(process.env.LEBTIG_PORT || 4174);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

let privilegedSupabaseClient;

function sendText(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

function sendJson(response, status, payload) {
  sendText(response, status, `${JSON.stringify(payload)}\n`, "application/json; charset=utf-8");
}

function getPrivilegedSupabaseClient() {
  if (privilegedSupabaseClient !== undefined) return privilegedSupabaseClient;
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    privilegedSupabaseClient = null;
    return privilegedSupabaseClient;
  }

  privilegedSupabaseClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return privilegedSupabaseClient;
}

async function bootstrapStatus() {
  const client = getPrivilegedSupabaseClient();
  if (!client) return { configured: false, bootstrapOpen: false };
  const result = await client.rpc("is_bootstrap_open");
  if (result.error) throw new Error("Lebtig bootstrap status could not be loaded");
  return { configured: true, bootstrapOpen: result.data === true };
}

async function serveFile(response, absolutePath, method) {
  try {
    await access(absolutePath);
    const metadata = await stat(absolutePath);
    if (!metadata.isFile()) return false;
    const contentType = mimeTypes.get(path.extname(absolutePath).toLowerCase()) || "application/octet-stream";
    response.writeHead(200, {
      "content-type": contentType,
      "content-length": metadata.size,
    });
    if (method === "HEAD") response.end();
    else createReadStream(absolutePath).pipe(response);
    return true;
  } catch {
    return false;
  }
}

function safeDistPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = path.resolve(distRoot, `.${decoded}`);
  if (candidate === distRoot || candidate.startsWith(`${distRoot}${path.sep}`)) return candidate;
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const method = request.method || "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.setHeader("allow", "GET, HEAD");
      sendText(response, 405, "Method not allowed\n");
      return;
    }

    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
    const { pathname, search } = requestUrl;

    if (pathname === "/api/bootstrap-status") {
      sendJson(response, 200, await bootstrapStatus());
      return;
    }

    const legacyRedirect = resolveLebtigLegacyRedirect(pathname, search);
    if (legacyRedirect) {
      response.writeHead(308, { location: legacyRedirect, "cache-control": "public, max-age=300" });
      response.end();
      return;
    }

    if (pathname === "/sitemap.xml") {
      const origin = process.env.LEBTIG_PUBLIC_ORIGIN || requestUrl.origin;
      sendText(response, 200, buildLebtigSitemap(origin), "application/xml; charset=utf-8");
      return;
    }

    const staticPath = safeDistPath(pathname);
    if (staticPath && pathname !== "/" && (await serveFile(response, staticPath, method))) return;

    const route = findLebtigPublicAuthRoute(pathname);
    if (route?.id === "media") {
      sendText(response, 404, "Media backend is not configured in the portable shell.\n");
      return;
    }

    const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
    if (isAdminPath || (route && (route.shell === "public" || route.shell === "auth"))) {
      const indexPath = path.join(distRoot, "index.html");
      if (await serveFile(response, indexPath, method)) return;
      sendText(response, 503, "Lebtig build missing. Run npm run build:lebtig first.\n");
      return;
    }

    sendText(response, 404, "Not found\n");
  } catch (error) {
    console.error(error);
    sendText(response, 500, "Internal server error\n");
  }
});

server.listen(port, host, () => {
  console.log(`Lebtig portable preview listening on http://${host}:${port}`);
});
