import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DevOtpProvider } from "../../packages/notifications/src/dev-otp.ts";
import { CheckoutError, submitVerifiedPickupOrder } from "../../packages/ordering/src/checkout.ts";
import { SupabaseRestRpcClient } from "../../packages/supabase-adapter/src/rest-rpc.ts";
import {
  SupabaseCatalogReader,
  SupabaseShopStateReader,
  SupabaseSlotReader,
} from "../../packages/supabase-adapter/src/checkout-readers.ts";
import {
  SupabaseOrderWriter,
  SupabasePublicOrderStatusReader,
} from "../../packages/supabase-adapter/src/order-repository.ts";
import { SupabaseKdsOperations } from "../../packages/supabase-adapter/src/kds.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const publicDir = path.join(here, "public");
const port = Number(process.env.PORT || 4173);
const DEV_LOCATION_ID = "00000000-0000-4000-8000-000000000001";

await loadLocalEnv(path.join(repoRoot, ".env.local"));

const supabaseUrl = (process.env.SUPABASE_URL || "http://127.0.0.1:54321").replace(/\/$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const devStaffEmail = process.env.MCELLO_DEV_STAFF_EMAIL;
const devStaffPassword = process.env.MCELLO_DEV_STAFF_PASSWORD;
let staffSession = null;

const devCodes = new Map();
const otp = new DevOtpProvider({
  onCode(data) {
    devCodes.set(data.challengeId, data.code);
    console.log(`[DEV OTP] ${data.mobile}: ${data.code} (${data.challengeId})`);
  },
});

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function serviceRpc() {
  if (!serviceRoleKey) return null;
  return new SupabaseRestRpcClient({
    baseUrl: supabaseUrl,
    apiKey: serviceRoleKey,
    authorizationToken: serviceRoleKey,
  });
}

function publicRpc() {
  if (!anonKey) return null;
  return new SupabaseRestRpcClient({ baseUrl: supabaseUrl, apiKey: anonKey });
}

async function staffRpc() {
  const token = await getDevStaffAccessToken();
  if (!anonKey || !token) return null;
  return new SupabaseRestRpcClient({
    baseUrl: supabaseUrl,
    apiKey: anonKey,
    authorizationToken: token,
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("request body too large");
  }
  return raw ? JSON.parse(raw) : {};
}

async function getDevStaffAccessToken() {
  if (!anonKey || !devStaffEmail || !devStaffPassword) return null;
  if (staffSession && staffSession.expiresAt > Date.now() + 60_000) return staffSession.accessToken;

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email: devStaffEmail, password: devStaffPassword }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error("Local KDS staff login failed", data);
    return null;
  }
  staffSession = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  return staffSession.accessToken;
}

async function staffRestGet(pathname) {
  const token = await getDevStaffAccessToken();
  if (!token || !anonKey) throw new Error("local staff is not configured");
  const response = await fetch(`${supabaseUrl}${pathname}`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`staff REST failed ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      backend: serviceRoleKey && anonKey ? "local-supabase-ready" : "static-only",
      localKdsStaff: Boolean(devStaffEmail && devStaffPassword),
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/menu") {
    const rpc = publicRpc();
    if (!rpc) {
      sendJson(res, 503, { error: "LOCAL_SUPABASE_NOT_CONFIGURED" });
      return true;
    }
    try {
      const menu = await rpc.rpc("get_public_menu", {
        _location_id: DEV_LOCATION_ID,
        _at: new Date().toISOString(),
      });
      sendJson(res, 200, menu);
    } catch (error) {
      console.error(error);
      sendJson(res, 503, { error: "MENU_BACKEND_UNAVAILABLE" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/dev/otp/start") {
    const body = await readJson(req);
    const mobile = String(body.mobile ?? "").trim();
    if (!/^\+?[0-9\s()\-]{7,24}$/.test(mobile)) {
      sendJson(res, 400, { error: "INVALID_MOBILE" });
      return true;
    }
    const challenge = await otp.sendOtp({
      mobile,
      preferredChannel: "whatsapp",
      fallbackChannel: "sms",
    });
    sendJson(res, 200, {
      ...challenge,
      // Development-only endpoint; server itself binds to 127.0.0.1.
      devCode: devCodes.get(challenge.challengeId),
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/checkout") {
    const rpc = serviceRpc();
    if (!rpc) {
      sendJson(res, 503, { error: "LOCAL_SUPABASE_NOT_CONFIGURED", hint: "Run scripts/dev-supabase first." });
      return true;
    }
    const body = await readJson(req);
    try {
      const order = await submitVerifiedPickupOrder(body, {
        otp,
        catalog: new SupabaseCatalogReader(rpc),
        shop: new SupabaseShopStateReader(rpc),
        slots: new SupabaseSlotReader(rpc),
        orders: new SupabaseOrderWriter(rpc),
        statusUrlFor(created) {
          if (!created.publicToken) throw new Error("Persisted order is missing public token");
          return `${url.origin}/status.html?token=${encodeURIComponent(created.publicToken)}`;
        },
      });
      sendJson(res, 201, {
        id: order.id,
        publicToken: order.publicToken,
        orderNumber: order.orderNumber,
        state: order.state,
        totalCents: order.totalCents,
        statusUrl: order.publicToken
          ? `/status.html?token=${encodeURIComponent(order.publicToken)}`
          : null,
      });
    } catch (error) {
      if (error instanceof CheckoutError) {
        sendJson(res, 400, { error: error.code, message: error.message });
      } else {
        console.error(error);
        sendJson(res, 500, { error: "CHECKOUT_FAILED" });
      }
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/order-status") {
    const rpc = publicRpc();
    if (!rpc) {
      sendJson(res, 503, { error: "LOCAL_SUPABASE_NOT_CONFIGURED" });
      return true;
    }
    const token = url.searchParams.get("token");
    if (!token) {
      sendJson(res, 400, { error: "TOKEN_REQUIRED" });
      return true;
    }
    try {
      const status = await new SupabasePublicOrderStatusReader(rpc).get(token);
      if (!status) sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
      else sendJson(res, 200, status);
    } catch (error) {
      console.error(error);
      sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/order-status/cancel") {
    const rpc = publicRpc();
    if (!rpc) {
      sendJson(res, 503, { error: "LOCAL_SUPABASE_NOT_CONFIGURED" });
      return true;
    }
    const body = await readJson(req);
    const token = String(body.token ?? "");
    try {
      const status = await new SupabasePublicOrderStatusReader(rpc).cancelPending(token);
      sendJson(res, 200, status);
    } catch {
      sendJson(res, 409, { error: "ORDER_NOT_CANCELLABLE" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/kds/orders") {
    try {
      const select = [
        "id",
        "order_number",
        "state",
        "customer_first_name",
        "comment",
        "requested_pickup_at",
        "accepted_pickup_at",
        "total_cents",
        "submitted_at",
        "order_items(product_name_snapshot,quantity,comment,order_item_options(group_name_snapshot,option_name_snapshot,price_delta_cents_snapshot))",
      ].join(",");
      const query = `/rest/v1/orders?location_id=eq.${DEV_LOCATION_ID}&state=in.(waiting_for_acceptance,scheduled,preparing,ready)&select=${encodeURIComponent(select)}&order=submitted_at.asc`;
      const orders = await staffRestGet(query);
      sendJson(res, 200, orders);
    } catch (error) {
      console.error(error);
      sendJson(res, 503, { error: "LOCAL_KDS_NOT_READY", hint: "Run the local Supabase setup script first." });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/kds/shop-state") {
    const rpc = serviceRpc();
    if (!rpc) {
      sendJson(res, 503, { error: "LOCAL_SUPABASE_NOT_CONFIGURED" });
      return true;
    }
    try {
      const state = await new SupabaseShopStateReader(rpc).getShopState(DEV_LOCATION_ID, new Date().toISOString());
      sendJson(res, 200, state);
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: "SHOP_STATE_FAILED" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/kds/action") {
    const rpc = await staffRpc();
    if (!rpc) {
      sendJson(res, 503, { error: "LOCAL_KDS_NOT_READY" });
      return true;
    }
    const body = await readJson(req);
    const orderId = String(body.orderId ?? "");
    const action = String(body.action ?? "");
    const kds = new SupabaseKdsOperations(rpc);
    try {
      let order;
      if (action === "accept") {
        const minutes = Number(body.minutes);
        if (![15, 20, 30].includes(minutes)) throw new Error("invalid acceptance time");
        order = await kds.accept(orderId, new Date(Date.now() + minutes * 60_000).toISOString());
      } else if (action === "activate") {
        order = await kds.activateScheduled(orderId);
      } else if (action === "ready") {
        order = await kds.markReady(orderId);
      } else if (action === "complete") {
        order = await kds.complete(orderId);
      } else if (action === "delay") {
        const minutes = Number(body.minutes);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) throw new Error("invalid delay");
        order = await kds.delay(orderId, minutes);
      } else if (action === "reject") {
        const allowedReasons = new Set(["Zu viel los", "Artikel/Zutat ausverkauft", "Küche schließt"]);
        const reason = String(body.reason ?? "");
        if (!allowedReasons.has(reason)) throw new Error("invalid rejection reason");
        order = await kds.reject(orderId, reason);
      } else {
        throw new Error("unknown KDS action");
      }
      sendJson(res, 200, order);
    } catch (error) {
      console.error(error);
      sendJson(res, 409, { error: "KDS_TRANSITION_REJECTED" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/kds/shop-override") {
    const rpc = await staffRpc();
    if (!rpc) {
      sendJson(res, 503, { error: "LOCAL_KDS_NOT_READY" });
      return true;
    }
    const body = await readJson(req);
    const override = String(body.override ?? "");
    if (!new Set(["auto", "force_open", "force_closed", "pause", "today_closed"]).has(override)) {
      sendJson(res, 400, { error: "INVALID_OVERRIDE" });
      return true;
    }
    try {
      const result = await new SupabaseKdsOperations(rpc).setShopOverride(
        DEV_LOCATION_ID,
        override,
        body.operatorMessage ? String(body.operatorMessage) : undefined,
      );
      sendJson(res, 200, result);
    } catch (error) {
      console.error(error);
      sendJson(res, 409, { error: "SHOP_OVERRIDE_REJECTED" });
    }
    return true;
  }

  return false;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/") && await handleApi(req, res, url)) return;

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    let file = path.join(publicDir, pathname.replace(/^\/+/, ""));
    if (!file.startsWith(publicDir)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": mime[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (error) {
    if (url.pathname.startsWith("/api/")) {
      console.error(error);
      sendJson(res, 500, { error: "INTERNAL_ERROR" });
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Mcello prototype: http://127.0.0.1:${port}`);
  console.log(`Backend: ${serviceRoleKey && anonKey ? "local Supabase connected" : "static-only (run dev-supabase script)"}`);
  console.log(`KDS: ${devStaffEmail && devStaffPassword ? "local staff session enabled" : "not configured"}`);
});

async function loadLocalEnv(file) {
  try {
    const raw = await readFile(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env.local is optional; static preview remains available without it.
  }
}
