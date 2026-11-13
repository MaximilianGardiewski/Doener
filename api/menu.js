const DEFAULT_LOCATION_ID = "00000000-0000-4000-8000-000000000001";

export function createMenuHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function menuHandler(req, res) {
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(body));
    };

    if (req.method !== "GET") {
      res.setHeader("allow", "GET");
      send(405, { error: "METHOD_NOT_ALLOWED" });
      return;
    }

    const baseUrl = String(env.SUPABASE_URL || "").trim().replace(/\/$/, "");
    const apiKey = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || "").trim();
    if (!baseUrl || !apiKey) {
      send(503, { error: "MENU_BACKEND_UNAVAILABLE", hint: "Supabase public URL/key are not configured." });
      return;
    }

    const requestUrl = new URL(req.url || "/api/menu", "http://localhost");
    const rawAt = requestUrl.searchParams.get("at");
    const at = rawAt ? new Date(rawAt) : new Date();
    if (Number.isNaN(at.getTime())) {
      send(400, { error: "INVALID_MENU_TIME" });
      return;
    }

    const locationId = String(env.MCELLO_LOCATION_ID || DEFAULT_LOCATION_ID).trim();
    const headers = {
      apikey: apiKey,
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    };
    const rpc = async (name, body) => {
      const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Supabase RPC ${name} failed (${response.status}): ${detail.slice(0, 300)}`);
      }
      return response.json();
    };

    try {
      const [menu, crossSells] = await Promise.all([
        rpc("get_public_menu", { _location_id: locationId, _at: at.toISOString() }),
        rpc("get_public_cross_sells", { _location_id: locationId }),
      ]);
      send(200, { ...menu, ...crossSells });
    } catch (error) {
      console.error("Public menu RPC failed:", error);
      send(503, { error: "MENU_BACKEND_UNAVAILABLE" });
    }
  };
}

export default createMenuHandler();
