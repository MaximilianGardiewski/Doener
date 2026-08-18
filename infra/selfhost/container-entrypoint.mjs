import http from "node:http";

const internalPort = Number(process.env.MCELLO_INTERNAL_PORT || 4173);
const containerPort = Number(process.env.MCELLO_CONTAINER_PORT || 8080);
const productionRuntime = process.env.NODE_ENV === "production";

process.env.PORT = String(internalPort);
await import("../../apps/mcello/runtime/production.mjs");

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function blockUnsafeProductionMessaging(request, response) {
  if (!productionRuntime) return false;
  const url = new URL(request.url || "/", "http://mcello.internal");

  if (url.pathname.startsWith("/api/dev/")) {
    sendJson(response, 404, { error: "DEVELOPMENT_ENDPOINT_DISABLED" });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/checkout") {
    sendJson(response, 503, {
      error: "PRODUCTION_MESSAGING_NOT_CONFIGURED",
      message: "Online-Bestellungen bleiben gesperrt, bis ein freigegebener WhatsApp/SMS-Transport implementiert ist.",
    });
    return true;
  }

  return false;
}

const proxy = http.createServer((request, response) => {
  if (blockUnsafeProductionMessaging(request, response)) return;

  const upstream = http.request({
    hostname: "127.0.0.1",
    port: internalPort,
    method: request.method,
    path: request.url,
    headers: request.headers,
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstream.on("error", (error) => {
    console.error("Mcello container gateway upstream error", error.message);
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    }
    response.end(JSON.stringify({ error: "MCELLO_UPSTREAM_UNAVAILABLE" }));
  });

  request.pipe(upstream);
});

proxy.listen(containerPort, "0.0.0.0", () => {
  console.log(`Mcello container gateway: 0.0.0.0:${containerPort} -> 127.0.0.1:${internalPort}`);
  if (productionRuntime) {
    console.log("Production messaging gate: development endpoints disabled; checkout fail-closed until approved transport exists.");
  }
});
