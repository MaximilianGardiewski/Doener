import { connectPostgresRealtime } from "./realtime-client.js";

const form = document.querySelector("#rushSettingsForm");
const message = document.querySelector("#rushSettingsMessage");
let sessionCache = null;
let loading = false;

async function getSession({ force = false } = {}) {
  if (!force && sessionCache && sessionCache.expiresAt > Date.now() + 60_000) return sessionCache;
  const response = await fetch("/api/admin/realtime-session", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.websocketUrl || !data.accessToken || !data.locationId) {
    throw new Error(data.error || "Admin-Session nicht verfügbar");
  }
  const websocket = new URL(data.websocketUrl);
  const apiKey = websocket.searchParams.get("apikey");
  if (!apiKey) throw new Error("Öffentlicher Supabase-API-Key fehlt in der Session");
  sessionCache = {
    restBase: `${websocket.protocol === "wss:" ? "https:" : "http:"}//${websocket.host}`,
    apiKey,
    accessToken: data.accessToken,
    expiresAt: Number(data.expiresAt || Date.now() + 5 * 60_000),
    locationId: data.locationId,
  };
  return sessionCache;
}

async function rpc(name, args, retry = true) {
  const session = await getSession();
  const response = await fetch(`${session.restBase}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: session.apiKey,
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    if (response.status === 401 && retry) {
      sessionCache = null;
      await getSession({ force: true });
      return rpc(name, args, false);
    }
    throw new Error(data?.message || data?.error || `${name} wurde abgelehnt`);
  }
  return data;
}

async function loadRushSettings() {
  if (loading) return;
  loading = true;
  try {
    const session = await getSession();
    const data = await rpc("admin_get_rush_settings", { _location_id: session.locationId });
    form.elements.rushExtraMinutes.value = Number(data.rushExtraMinutes || 10);
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    loading = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  const minutes = Number(form.elements.rushExtraMinutes.value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) {
    message.textContent = "Rush-Puffer muss zwischen 5 und 60 Minuten liegen.";
    return;
  }
  button.disabled = true;
  try {
    const session = await getSession();
    await rpc("admin_set_rush_extra_minutes", {
      _location_id: session.locationId,
      _minutes: minutes,
    });
    message.textContent = `Rush-Puffer gespeichert: +${minutes} Minuten.`;
    await loadRushSettings();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

await loadRushSettings();
connectPostgresRealtime({
  sessionEndpoint: "/api/admin/realtime-session",
  topic: "realtime:mcello-rush-settings",
  changes: (session) => [
    { event: "*", schema: "public", table: "ordering_settings", filter: `location_id=eq.${session.locationId}` },
  ],
  onChange: () => loadRushSettings(),
  onStatus: () => {},
  reconciliationMs: 30_000,
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadRushSettings();
});
