import http from "node:http";

const lanAddress = required("MCELLO_LAN_ADDRESS");
const listenPort = Number(process.env.MCELLO_LAN_PORT || 80);
const upstreamHost = "127.0.0.1";
const upstreamPort = Number(process.env.MCELLO_UPSTREAM_PORT || 4173);
const realtimeSessionPaths = new Set([
  "/api/kds/realtime-session",
  "/api/ops/realtime-session",
  "/api/admin/realtime-session",
]);

validateLanAddress(lanAddress);
if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
  throw new Error("MCELLO_LAN_PORT must be a valid TCP port");
}

const server = http.createServer((req, res) => {
  const incomingUrl = new URL(req.url || "/", `http://${req.headers.host || lanAddress}`);

  if (req.method === "GET" && incomingUrl.pathname === "/__mcello_lan_health") {
    sendJson(res, 200, {
      ok: true,
      mode: "mcello-lan-demo",
      lanAddress,
      upstream: `${upstreamHost}:${upstreamPort}`,
    });
    return;
  }

  const headers = { ...req.headers };
  headers["x-forwarded-host"] = req.headers.host || lanAddress;
  headers["x-forwarded-proto"] = "http";
  delete headers["proxy-connection"];

  const upstream = http.request({
    hostname: upstreamHost,
    port: upstreamPort,
    method: req.method,
    path: req.url,
    headers,
  }, (upstreamRes) => {
    if (realtimeSessionPaths.has(incomingUrl.pathname)) {
      collectJson(upstreamRes)
        .then((payload) => {
          if (payload?.websocketUrl) {
            const websocketUrl = new URL(payload.websocketUrl);
            websocketUrl.hostname = lanAddress;
            payload.websocketUrl = websocketUrl.toString();
          }
          const responseHeaders = copyHeaders(upstreamRes.headers);
          delete responseHeaders["content-length"];
          responseHeaders["cache-control"] = "no-store";
          res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
          res.end(JSON.stringify(payload));
        })
        .catch((error) => {
          console.error("LAN realtime-session rewrite failed", error);
          if (!res.headersSent) sendJson(res, 502, { error: "LAN_PROXY_REWRITE_FAILED" });
          else res.end();
        });
      return;
    }

    res.writeHead(upstreamRes.statusCode || 502, copyHeaders(upstreamRes.headers));
    upstreamRes.pipe(res);
  });

  upstream.on("error", (error) => {
    console.error("LAN upstream unavailable", error.message);
    if (!res.headersSent) sendJson(res, 502, { error: "MCELLO_UPSTREAM_UNAVAILABLE" });
    else res.end();
  });

  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`Mcello LAN proxy: http://${lanAddress}${listenPort === 80 ? "" : `:${listenPort}`}`);
  console.log(`Upstream stays loopback-only: http://${upstreamHost}:${upstreamPort}`);
  console.log("LAN demo only. Do not use this proxy as a production ingress.");
});

function collectJson(response) {
  return new Promise((resolve, reject) => {
    let raw = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("realtime session response too large"));
        response.destroy();
      }
    });
    response.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    response.on("error", reject);
  });
}

function copyHeaders(headers) {
  const copy = { ...headers };
  delete copy.connection;
  delete copy["keep-alive"];
  delete copy["transfer-encoding"];
  return copy;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function validateLanAddress(value) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    throw new Error("MCELLO_LAN_ADDRESS must be an IPv4 address");
  }
  const [a, b] = parts.map(Number);
  const privateAddress = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  if (!privateAddress) throw new Error("MCELLO_LAN_ADDRESS must be an RFC1918 private IPv4 address");
}
