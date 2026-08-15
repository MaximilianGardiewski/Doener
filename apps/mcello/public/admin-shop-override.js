const form = document.querySelector("#shopOverrideForm");
const status = document.querySelector("#shopOverrideStatus");
let sessionCache = null;

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

function applySettings(settings = {}) {
  if (!form) return;
  form.elements.override.value = settings.override || "auto";
  form.elements.operatorMessage.value = settings.operatorMessage || "";
  status.textContent = `Aktueller Modus: ${form.elements.override.selectedOptions[0]?.textContent || settings.override || "auto"}`;
}

async function loadOverride() {
  if (!form) return;
  try {
    const session = await getSession();
    const schedule = await rpc("admin_get_ordering_schedule", { _location_id: session.locationId });
    applySettings(schedule.orderingSettings || {});
  } catch (error) {
    status.textContent = error.message;
  }
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const session = await getSession();
    const result = await rpc("admin_set_shop_override", {
      _location_id: session.locationId,
      _override: form.elements.override.value,
      _operator_message: form.elements.operatorMessage.value.trim() || null,
    });
    applySettings(result || {});
    status.textContent = "Shop-Modus gespeichert. Die Bestellbarkeit wird serverseitig sofort neu bewertet.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

loadOverride();
