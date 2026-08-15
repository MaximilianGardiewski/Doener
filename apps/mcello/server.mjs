import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DevOtpProvider } from "../../packages/notifications/src/dev-otp.ts";
import { LocationScopeError, SingleLocationContext } from "../../packages/core/src/location-context.ts";
import {
  parseOrderAnalyticsContext,
  parsePublicAnalyticsEvent,
} from "../../packages/analytics/src/events.ts";
import { CheckoutError, submitVerifiedPickupOrder } from "../../packages/ordering/src/checkout.ts";
import { SupabaseAnalyticsRecorder } from "../../packages/supabase-adapter/src/analytics.ts";
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
import { SupabasePickupSlotReader } from "../../packages/supabase-adapter/src/slots.ts";
import { SupabaseOrderMaintenance } from "../../packages/supabase-adapter/src/maintenance.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const publicDir = path.join(here, "public");
const port = Number(process.env.PORT || 4173);
const DEFAULT_MCELLO_LOCATION_ID = "00000000-0000-4000-8000-000000000001";

await loadLocalEnv(path.join(repoRoot, ".env.local"));

const locationContext = new SingleLocationContext(
  optionalEnv("MCELLO_LOCATION_ID") || DEFAULT_MCELLO_LOCATION_ID,
);
const LOCATION_ID = locationContext.locationId;

const supabaseUrl = stripQuotes(process.env.SUPABASE_URL || "http://127.0.0.1:54321").replace(/\/$/, "");
const anonKey = optionalEnv("SUPABASE_ANON_KEY");
const serviceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
const devStaffEmail = optionalEnv("MCELLO_DEV_STAFF_EMAIL");
const devStaffPassword = optionalEnv("MCELLO_DEV_STAFF_PASSWORD");
const devAdminEmail = optionalEnv("MCELLO_DEV_ADMIN_EMAIL");
const devAdminPassword = optionalEnv("MCELLO_DEV_ADMIN_PASSWORD");
let staffSession = null;
let adminSession = null;
let maintenanceRunning = false;
const analyticsRateWindows = new Map();
let analyticsGlobalWindow = { count: 0, resetAt: Date.now() + 60_000 };

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

function rpcWithAccessToken(accessToken) {
  if (!anonKey || !accessToken) return null;
  return new SupabaseRestRpcClient({
    baseUrl: supabaseUrl,
    apiKey: anonKey,
    authorizationToken: accessToken,
  });
}

async function staffRpc() {
  return rpcWithAccessToken((await getDevSession("staff"))?.accessToken);
}

async function adminRpc() {
  return rpcWithAccessToken((await getDevSession("admin"))?.accessToken);
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

async function getDevSession(role) {
  const isAdmin = role === "admin";
  const email = isAdmin ? devAdminEmail : devStaffEmail;
  const password = isAdmin ? devAdminPassword : devStaffPassword;
  const cached = isAdmin ? adminSession : staffSession;
  if (!anonKey || !email || !password) return null;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    console.error(`Local ${role} login failed`, data);
    return null;
  }

  const next = {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  };
  if (isAdmin) adminSession = next;
  else staffSession = next;
  return next;
}

async function staffRestGet(pathname) {
  const session = await getDevSession("staff");
  if (!session || !anonKey) throw new Error("local staff is not configured");
  const response = await fetch(`${supabaseUrl}${pathname}`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${session.accessToken}`,
      accept: "application/json",
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`staff REST failed ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function buildRealtimeWebsocketUrl() {
  if (!anonKey) return null;
  const parsed = new URL(supabaseUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  parsed.pathname = "/realtime/v1/websocket";
  parsed.search = new URLSearchParams({ apikey: anonKey, vsn: "1.0.0" }).toString();
  return parsed.toString();
}

async function realtimeSession(role) {
  const session = await getDevSession(role);
  const websocketUrl = buildRealtimeWebsocketUrl();
  if (!session || !websocketUrl) return null;
  return {
    websocketUrl,
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    locationId: LOCATION_ID,
    role,
  };
}

async function runMaintenance() {
  if (maintenanceRunning) return;
  const rpc = serviceRpc();
  if (!rpc) return;
  maintenanceRunning = true;
  try {
    const result = await new SupabaseOrderMaintenance(rpc).run();
    const changes = result.warnings.length + result.rejected.length + result.activated.length;
    if (changes > 0) {
      console.log("[ORDER MAINTENANCE]", {
        warnings: result.warnings.length,
        rejected: result.rejected.length,
        activated: result.activated.length,
      });
    }
  } catch (error) {
    console.error("Order maintenance failed", error);
  } finally {
    maintenanceRunning = false;
  }
}

function validSnoozeUntil(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null;
  if (date.getTime() > Date.now() + 7 * 24 * 60 * 60_000) return null;
  return date.toISOString();
}

function publicMenuAt(url) {
  const raw = url.searchParams.get("at");
  if (!raw) return new Date().toISOString();
  const epoch = Date.parse(raw);
  const now = Date.now();
  if (!Number.isFinite(epoch)) return null;
  if (epoch < now - 5 * 60_000 || epoch > now + 14 * 24 * 60 * 60_000) return null;
  return new Date(epoch).toISOString();
}

function publicMediaId(pathname) {
  const match = pathname.match(/^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i);
  return match?.[1] ?? null;
}

function storageObjectPath(bucketId, objectPath) {
  const encoded = [bucketId, ...objectPath.split("/")]
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `/storage/v1/object/authenticated/${encoded}`;
}

function consumeAnalyticsQuota(sessionId, now = Date.now()) {
  if (analyticsGlobalWindow.resetAt <= now) {
    analyticsGlobalWindow = { count: 0, resetAt: now + 60_000 };
    for (const [key, value] of analyticsRateWindows) {
      if (value.resetAt <= now) analyticsRateWindows.delete(key);
    }
  } else if (analyticsGlobalWindow.count >= 3_000) {
    return false;
  }

  const current = analyticsRateWindows.get(sessionId);
  if (!current || current.resetAt <= now) {
    analyticsRateWindows.set(sessionId, { count: 1, resetAt: now + 60_000 });
  } else if (current.count >= 60) {
    return false;
  } else {
    current.count += 1;
  }
  analyticsGlobalWindow.count += 1;
  return true;
}

async function mutateSnooze(rpc, body, undo = false) {
  const type = String(body.type ?? "");
  const id = String(body.id ?? "");
  if (!id || !new Set(["product", "modifier"]).has(type)) throw new Error("invalid snooze target");

  if (undo) {
    return rpc.rpc(type === "product" ? "staff_unsnooze_product" : "staff_unsnooze_modifier_option", {
      [type === "product" ? "_product_id" : "_option_id"]: id,
    });
  }

  const untilAt = validSnoozeUntil(body.untilAt);
  if (!untilAt) throw new Error("invalid snooze end");
  return rpc.rpc(type === "product" ? "staff_snooze_product" : "staff_snooze_modifier_option", {
    [type === "product" ? "_product_id" : "_option_id"]: id,
    _until_at: untilAt,
    _reason: body.reason ? String(body.reason) : "Heute ausverkauft",
  });
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      backend: serviceRoleKey && anonKey ? "local-supabase-ready" : "static-only",
      localKdsStaff: Boolean(devStaffEmail && devStaffPassword),
      localAdmin: Boolean(devAdminEmail && devAdminPassword),
      maintenanceWorker: Boolean(serviceRoleKey),
      realtime: Boolean(anonKey),
      locationId: LOCATION_ID,
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/analytics/events") {
    const rpc = serviceRpc();
    if (!rpc) return sendUnavailable(res), true;
    try {
      const event = parsePublicAnalyticsEvent(await readJson(req));
      if (event.locationId !== LOCATION_ID) {
        sendJson(res, 400, { error: "INVALID_ANALYTICS_LOCATION" });
        return true;
      }
      if (!consumeAnalyticsQuota(event.anonymousSessionId)) {
        sendJson(res, 429, { error: "ANALYTICS_RATE_LIMITED" });
        return true;
      }
      await new SupabaseAnalyticsRecorder(rpc).record(event);
      sendJson(res, 202, { accepted: true });
    } catch (error) {
      console.warn("Analytics event rejected", error instanceof Error ? error.message : "invalid event");
      sendJson(res, 400, { error: "INVALID_ANALYTICS_EVENT" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/media/")) {
    const mediaId = publicMediaId(url.pathname);
    const rpc = serviceRpc();
    if (!mediaId) {
      sendJson(res, 400, { error: "INVALID_MEDIA_ID" });
      return true;
    }
    if (!rpc || !serviceRoleKey) return sendUnavailable(res), true;

    try {
      const descriptor = await rpc.rpc("get_public_media_descriptor", { _media_id: mediaId });
      if (!descriptor?.bucketId || !descriptor?.objectPath) {
        sendJson(res, 404, { error: "MEDIA_NOT_FOUND" });
        return true;
      }

      const response = await fetch(
        `${supabaseUrl}${storageObjectPath(descriptor.bucketId, descriptor.objectPath)}`,
        {
          headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
            accept: descriptor.mimeType || "image/*",
          },
        },
      );
      if (!response.ok) {
        sendJson(res, response.status === 404 ? 404 : 502, { error: "MEDIA_STORAGE_UNAVAILABLE" });
        return true;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 10 * 1024 * 1024) {
        sendJson(res, 502, { error: "MEDIA_SIZE_INVALID" });
        return true;
      }
      res.writeHead(200, {
        "content-type": descriptor.mimeType || response.headers.get("content-type") || "application/octet-stream",
        "content-length": String(bytes.length),
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
        "x-content-type-options": "nosniff",
      });
      res.end(bytes);
    } catch (error) {
      console.error(error);
      sendJson(res, 404, { error: "MEDIA_NOT_FOUND" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/menu") {
    const rpc = publicRpc();
    if (!rpc) return sendUnavailable(res), true;
    const at = publicMenuAt(url);
    if (!at) {
      sendJson(res, 400, { error: "INVALID_MENU_TIME" });
      return true;
    }
    try {
      const [menu, crossSells] = await Promise.all([
        rpc.rpc("get_public_menu", {
          _location_id: LOCATION_ID,
          _at: at,
        }),
        rpc.rpc("get_public_cross_sells", {
          _location_id: LOCATION_ID,
        }),
      ]);
      sendJson(res, 200, { ...menu, ...crossSells });
    } catch (error) {
      console.error(error);
      sendJson(res, 503, { error: "MENU_BACKEND_UNAVAILABLE" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/slots") {
    const rpc = publicRpc();
    if (!rpc) return sendUnavailable(res), true;
    const days = Math.max(1, Math.min(Number(url.searchParams.get("days") || 7), 14));
    try {
      const snapshot = await new SupabasePickupSlotReader(rpc).getAvailable(
        LOCATION_ID,
        new Date().toISOString(),
        days,
      );
      sendJson(res, 200, snapshot);
    } catch (error) {
      console.error(error);
      sendJson(res, 503, { error: "SLOTS_BACKEND_UNAVAILABLE" });
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
      mobile: normalizeMobile(mobile),
      preferredChannel: "whatsapp",
      fallbackChannel: "sms",
    });
    sendJson(res, 200, {
      ...challenge,
      devCode: devCodes.get(challenge.challengeId),
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/checkout") {
    const rpc = serviceRpc();
    if (!rpc) return sendUnavailable(res), true;
    const body = await readJson(req);
    let checkoutLocationId;
    try {
      checkoutLocationId = locationContext.resolve(body.locationId);
    } catch (error) {
      if (error instanceof LocationScopeError) {
        sendJson(res, 400, { error: error.code });
        return true;
      }
      throw error;
    }
    let analyticsContext = null;
    if (body.analytics != null) {
      try {
        analyticsContext = parseOrderAnalyticsContext(body.analytics);
      } catch {
        // Analytics is best-effort and must never block a valid order.
      }
    }
    try {
      const order = await submitVerifiedPickupOrder({ ...body, locationId: checkoutLocationId }, {
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
      if (analyticsContext) {
        await new SupabaseAnalyticsRecorder(rpc)
          .recordOrderSubmitted(LOCATION_ID, order.id, analyticsContext)
          .catch((error) => console.warn(
            "Order analytics event was not recorded",
            error instanceof Error ? error.message : "unknown error",
          ));
      }
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
    if (!rpc) return sendUnavailable(res), true;
    const token = url.searchParams.get("token");
    if (!token) {
      sendJson(res, 400, { error: "TOKEN_REQUIRED" });
      return true;
    }
    try {
      const status = await new SupabasePublicOrderStatusReader(rpc).get(token);
      if (!status) sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
      else sendJson(res, 200, status);
    } catch {
      sendJson(res, 404, { error: "ORDER_NOT_FOUND" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/order-status/cancel") {
    const rpc = publicRpc();
    if (!rpc) return sendUnavailable(res), true;
    const body = await readJson(req);
    try {
      const status = await new SupabasePublicOrderStatusReader(rpc).cancelPending(String(body.token ?? ""));
      sendJson(res, 200, status);
    } catch {
      sendJson(res, 409, { error: "ORDER_NOT_CANCELLABLE" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/kds/realtime-session") {
    const session = await realtimeSession("staff");
    if (!session) sendJson(res, 503, { error: "LOCAL_KDS_NOT_READY" });
    else sendJson(res, 200, session);
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
      const query = `/rest/v1/orders?location_id=eq.${LOCATION_ID}&state=in.(waiting_for_acceptance,scheduled,preparing,ready)&select=${encodeURIComponent(select)}&order=submitted_at.asc`;
      sendJson(res, 200, await staffRestGet(query));
    } catch (error) {
      console.error(error);
      sendJson(res, 503, { error: "LOCAL_KDS_NOT_READY" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/kds/shop-state") {
    const rpc = serviceRpc();
    if (!rpc) return sendUnavailable(res), true;
    try {
      sendJson(
        res,
        200,
        await new SupabaseShopStateReader(rpc).getShopState(LOCATION_ID, new Date().toISOString()),
      );
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
      } else if (action === "accept-slot") {
        order = await kds.acceptRequestedSlot(orderId);
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
    if (!new Set(["auto", "force_closed", "pause", "today_closed"]).has(override)) {
      sendJson(res, 400, { error: "INVALID_OVERRIDE" });
      return true;
    }
    try {
      sendJson(
        res,
        200,
        await new SupabaseKdsOperations(rpc).setShopOverride(
          LOCATION_ID,
          override,
          body.operatorMessage ? String(body.operatorMessage) : undefined,
        ),
      );
    } catch (error) {
      console.error(error);
      sendJson(res, 409, { error: "SHOP_OVERRIDE_REJECTED" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/ops/realtime-session") {
    const session = await realtimeSession("staff");
    if (!session) sendJson(res, 503, { error: "LOCAL_STAFF_NOT_READY" });
    else sendJson(res, 200, session);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/ops/catalog") {
    const rpc = await staffRpc();
    if (!rpc) return sendJson(res, 503, { error: "LOCAL_STAFF_NOT_READY" }), true;
    try {
      sendJson(res, 200, await rpc.rpc("staff_get_operational_catalog", { _location_id: LOCATION_ID }));
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: "OPS_CATALOG_FAILED" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ops/snooze") {
    const rpc = await staffRpc();
    if (!rpc) return sendJson(res, 503, { error: "LOCAL_STAFF_NOT_READY" }), true;
    try {
      sendJson(res, 200, await mutateSnooze(rpc, await readJson(req), false));
    } catch (error) {
      console.error(error);
      sendJson(res, 409, { error: "SNOOZE_REJECTED" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ops/unsnooze") {
    const rpc = await staffRpc();
    if (!rpc) return sendJson(res, 503, { error: "LOCAL_STAFF_NOT_READY" }), true;
    try {
      sendJson(res, 200, await mutateSnooze(rpc, await readJson(req), true));
    } catch (error) {
      console.error(error);
      sendJson(res, 409, { error: "UNSNOOZE_REJECTED" });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/realtime-session") {
    const session = await realtimeSession("admin");
    if (!session) sendJson(res, 503, { error: "LOCAL_ADMIN_NOT_READY" });
    else sendJson(res, 200, session);
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/admin/catalog") {
    const rpc = await adminRpc();
    if (!rpc) return sendJson(res, 503, { error: "LOCAL_ADMIN_NOT_READY" }), true;
    try {
      sendJson(res, 200, await rpc.rpc("admin_get_catalog", { _location_id: LOCATION_ID }));
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: "ADMIN_CATALOG_FAILED" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/category/save") {
    const rpc = await adminRpc();
    if (!rpc) return sendJson(res, 503, { error: "LOCAL_ADMIN_NOT_READY" }), true;
    const body = await readJson(req);
    try {
      const saved = await rpc.rpc("admin_save_menu_category", {
        _id: body.id || null,
        _location_id: LOCATION_ID,
        _slug: String(body.slug ?? ""),
        _name: String(body.name ?? ""),
        _description: String(body.description ?? ""),
        _sort: Number(body.sort ?? 100),
        _status: String(body.status ?? "draft"),
        _visible: Boolean(body.visible),
      });
      sendJson(res, 200, saved);
    } catch (error) {
      console.error(error);
      sendJson(res, 409, { error: "CATEGORY_SAVE_REJECTED" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/product/save") {
    const rpc = await adminRpc();
    if (!rpc) return sendJson(res, 503, { error: "LOCAL_ADMIN_NOT_READY" }), true;
    const body = await readJson(req);
    try {
      const saved = await rpc.rpc("admin_save_menu_product", {
        _id: body.id || null,
        _location_id: LOCATION_ID,
        _category_id: String(body.categoryId ?? ""),
        _slug: String(body.slug ?? ""),
        _name: String(body.name ?? ""),
        _description: String(body.description ?? ""),
        _base_price_cents: Number(body.basePriceCents),
        _sort: Number(body.sort ?? 100),
        _status: String(body.status ?? "draft"),
        _bestseller: Boolean(body.bestseller),
        _orderable_online: Boolean(body.orderableOnline),
        _owner_confirmed: Boolean(body.ownerConfirmed),
      });
      sendJson(res, 200, saved);
    } catch (error) {
      console.error(error);
      sendJson(res, 409, { error: "PRODUCT_SAVE_REJECTED" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/snooze") {
    const rpc = await adminRpc();
    if (!rpc) return sendJson(res, 503, { error: "LOCAL_ADMIN_NOT_READY" }), true;
    try {
      sendJson(res, 200, await mutateSnooze(rpc, await readJson(req), false));
    } catch (error) {
      console.error(error);
      sendJson(res, 409, { error: "SNOOZE_REJECTED" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/admin/unsnooze") {
    const rpc = await adminRpc();
    if (!rpc) return sendJson(res, 503, { error: "LOCAL_ADMIN_NOT_READY" }), true;
    try {
      sendJson(res, 200, await mutateSnooze(rpc, await readJson(req), true));
    } catch (error) {
      console.error(error);
      sendJson(res, 409, { error: "UNSNOOZE_REJECTED" });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/dev/maintenance") {
    await runMaintenance();
    sendJson(res, 202, { ok: true });
    return true;
  }

  return false;
}

function sendUnavailable(res) {
  sendJson(res, 503, {
    error: "LOCAL_SUPABASE_NOT_CONFIGURED",
    hint: "Run the zero-cost local Supabase setup script first.",
  });
}

const server = http.createServer(async (req, res) => {
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
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mcello local runtime: http://127.0.0.1:${port}`);
  console.log(`Backend: ${serviceRoleKey && anonKey ? "local Supabase connected" : "static-only"}`);
  console.log(`KDS: ${devStaffEmail && devStaffPassword ? "local staff session enabled" : "not configured"}`);
  console.log(`Admin: ${devAdminEmail && devAdminPassword ? "local admin session enabled" : "not configured"}`);
});

const maintenanceTimer = setInterval(runMaintenance, 10_000);
maintenanceTimer.unref?.();
setTimeout(runMaintenance, 1_500).unref?.();

async function loadLocalEnv(file) {
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
    // .env.local is optional; static preview remains available without it.
  }
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return value ? stripQuotes(value.trim()) : undefined;
}

function normalizeMobile(value) {
  return String(value).replace(/[\s()-]/g, "").trim();
}
