import http from "node:http";

const internalPort = Number(process.env.MCELLO_INTERNAL_PORT || 4173);
const containerPort = Number(process.env.MCELLO_CONTAINER_PORT || 8080);

process.env.PORT = String(internalPort);
await import("../../apps/mcello/run.mjs");

const proxy = http.createServer((request, response) => {
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
});
