// Minimal native browser client for the documented Supabase Realtime protocol.
// No supabase-js/CDN dependency: authenticated JWT + RLS remain the authority.

export function connectPostgresRealtime({
  sessionEndpoint,
  topic,
  changes,
  onChange,
  onStatus = () => {},
  reconciliationMs = 30_000,
}) {
  let stopped = false;
  let socket = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let tokenTimer = null;
  let reconciliationTimer = null;
  let ref = 0;
  let joinRef = null;
  let reconnectAttempt = 0;
  let currentSession = null;

  const nextRef = () => String(++ref);

  async function fetchSession() {
    const response = await fetch(sessionEndpoint, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.websocketUrl || !data.accessToken) {
      throw new Error(data.error || "Realtime session unavailable");
    }
    return data;
  }

  function send(topicName, event, payload, requestRef = nextRef(), requestJoinRef = joinRef) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      topic: topicName,
      event,
      payload,
      ref: requestRef,
      join_ref: requestJoinRef,
    }));
  }

  function stopTimers() {
    clearInterval(heartbeatTimer);
    clearTimeout(tokenTimer);
    heartbeatTimer = null;
    tokenTimer = null;
  }

  function scheduleTokenRefresh() {
    clearTimeout(tokenTimer);
    if (!currentSession?.expiresAt) return;
    const delay = Math.max(30_000, Number(currentSession.expiresAt) - Date.now() - 60_000);
    tokenTimer = setTimeout(async () => {
      try {
        currentSession = await fetchSession();
        send(topic, "access_token", { access_token: currentSession.accessToken });
        scheduleTokenRefresh();
      } catch (error) {
        onStatus("degraded", error);
      }
    }, delay);
  }

  function normalizePostgresChange(message) {
    const wireEvent = String(message.event || "").toLowerCase();

    if (wireEvent === "postgres_changes") {
      const data = message.payload?.data ?? message.payload ?? {};
      return {
        type: String(data.type || data.eventType || data.event || "").toUpperCase() || null,
        schema: data.schema ?? message.payload?.schema ?? null,
        table: data.table ?? message.payload?.table ?? null,
        record: data.record ?? data.new ?? {},
        oldRecord: data.old_record ?? data.old ?? {},
        raw: message.payload,
      };
    }

    if (["insert", "update", "delete"].includes(wireEvent)) {
      const payload = message.payload ?? {};
      return {
        type: wireEvent.toUpperCase(),
        schema: payload.schema ?? null,
        table: payload.table ?? null,
        record: payload.record ?? payload.new ?? {},
        oldRecord: payload.old_record ?? payload.old ?? {},
        raw: payload,
      };
    }

    return null;
  }

  async function connect() {
    if (stopped) return;
    try {
      currentSession = await fetchSession();
      socket = new WebSocket(currentSession.websocketUrl);
      onStatus("connecting");

      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
        joinRef = nextRef();
        const postgresChanges = typeof changes === "function" ? changes(currentSession) : changes;
        send(
          topic,
          "phx_join",
          {
            config: {
              broadcast: { ack: false, self: false, replication_ready: true },
              presence: { enabled: false },
              postgres_changes: postgresChanges,
              private: false,
            },
            access_token: currentSession.accessToken,
          },
          joinRef,
          joinRef,
        );

        stopTimers();
        heartbeatTimer = setInterval(() => {
          send("phoenix", "heartbeat", {}, nextRef(), null);
        }, 20_000);
        scheduleTokenRefresh();
      });

      socket.addEventListener("message", (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }

        if (message.event === "phx_reply" && message.ref === joinRef) {
          if (message.payload?.status !== "ok") {
            onStatus("degraded", new Error(message.payload?.response?.reason || "Realtime join rejected"));
            return;
          }
          const confirmed = message.payload?.response?.postgres_changes;
          onStatus(Array.isArray(confirmed) ? "subscribed" : "connecting");
          return;
        }

        if (message.event === "system") {
          if (message.payload?.status === "ok") onStatus("subscribed");
          else onStatus("degraded", new Error(message.payload?.message || "Realtime subscription degraded"));
          return;
        }

        const change = normalizePostgresChange(message);
        if (change) {
          onStatus("subscribed");
          onChange(change);
          return;
        }

        if (message.event === "phx_error") {
          onStatus("degraded", new Error("Realtime channel error"));
        }
      });

      socket.addEventListener("close", () => {
        stopTimers();
        if (stopped) return;
        onStatus("reconnecting");
        const delays = [1000, 2000, 5000, 10_000];
        const delay = delays[Math.min(reconnectAttempt++, delays.length - 1)];
        reconnectTimer = setTimeout(connect, delay);
      });

      socket.addEventListener("error", () => {
        onStatus("degraded", new Error("Realtime websocket error"));
      });
    } catch (error) {
      if (stopped) return;
      onStatus("reconnecting", error);
      const delays = [1000, 2000, 5000, 10_000];
      const delay = delays[Math.min(reconnectAttempt++, delays.length - 1)];
      reconnectTimer = setTimeout(connect, delay);
    }
  }

  reconciliationTimer = setInterval(() => onChange({ source: "reconciliation" }), reconciliationMs);
  connect();

  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    clearInterval(reconciliationTimer);
    stopTimers();
    if (socket?.readyState === WebSocket.OPEN) {
      send(topic, "phx_leave", {}, nextRef(), joinRef);
    }
    socket?.close();
  };
}
