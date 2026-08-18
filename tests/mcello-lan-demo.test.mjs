import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";

const launcher = await readFile(new URL("../scripts/demo-mcello-lan.ps1", import.meta.url), "utf8");
const firewall = await readFile(new URL("../scripts/configure-mcello-lan-firewall.ps1", import.meta.url), "utf8");
const proxySource = await readFile(new URL("../scripts/mcello-lan-proxy.mjs", import.meta.url), "utf8");
const developmentRuntime = await readFile(new URL("../apps/mcello/runtime/development.mjs", import.meta.url), "utf8");

function requestJson({ port, path, host }) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "GET",
      headers: host ? { host } : undefined,
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, body: raw ? JSON.parse(raw) : {} });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
}

test("LAN proxy preserves the public host and rewrites local Realtime sessions to the hotspot address", async (t) => {
  const upstreamPort = 42831;
  const proxyPort = 42832;
  const lanAddress = "192.168.50.1";
  const publicHost = "mcello.192-168-50-1.sslip.io";

  const upstream = http.createServer((req, res) => {
    if (req.url === "/api/kds/realtime-session") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        websocketUrl: "ws://127.0.0.1:54321/realtime/v1/websocket?apikey=test&vsn=1.0.0",
        accessToken: "local-test-token",
        locationId: "00000000-0000-4000-8000-000000000001",
      }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ host: req.headers.host }));
  });
  upstream.listen(upstreamPort, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => upstream.close());

  const proxy = spawn(process.execPath, ["scripts/mcello-lan-proxy.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      MCELLO_LAN_ADDRESS: lanAddress,
      MCELLO_LAN_PORT: String(proxyPort),
      MCELLO_UPSTREAM_PORT: String(upstreamPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => proxy.kill("SIGTERM"));

  let started = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const health = await requestJson({ port: proxyPort, path: "/__mcello_lan_health" });
      if (health.body.ok) {
        started = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  assert.equal(started, true, "LAN proxy did not start");

  const proxied = await requestJson({ port: proxyPort, path: "/test", host: publicHost });
  assert.equal(proxied.status, 200);
  assert.equal(proxied.body.host, publicHost);

  const realtime = await requestJson({
    port: proxyPort,
    path: "/api/kds/realtime-session",
    host: publicHost,
  });
  assert.equal(realtime.status, 200);
  assert.equal(new URL(realtime.body.websocketUrl).hostname, lanAddress);
  assert.equal(new URL(realtime.body.websocketUrl).port, "54321");
});

test("LAN launcher keeps the application and mutation boundary local while exposing only presentation ingress", () => {
  assert.match(launcher, /ms-settings:network-mobilehotspot/);
  assert.match(launcher, /prepare-mcello-demo\.mjs/);
  assert.match(launcher, /MCELLO_PUBLIC_BASE_URL/);
  assert.match(launcher, /mcello\.\$\(\$Address\.Replace\('\.', '-'\)\)\.sslip\.io/);
  assert.match(launcher, /configure-mcello-lan-firewall\.ps1/);
  assert.match(proxySource, /upstreamHost = "127\.0\.0\.1"/);
  assert.match(proxySource, /server\.listen\(listenPort, "0\.0\.0\.0"/);
  assert.match(developmentRuntime, /MCELLO_PUBLIC_BASE_URL/);
  assert.doesNotMatch(launcher, /ALLOW_PAID_MESSAGING\s*=\s*YES/i);
  assert.doesNotMatch(launcher, /WHATSAPP_PROVIDER\s*=/i);
  assert.doesNotMatch(launcher, /SMS_PROVIDER\s*=/i);
});

test("Windows hotspot discovery does not depend on one Wi-Fi Direct adapter name", () => {
  assert.match(launcher, /Get-PrivateIPv4Candidates/);
  assert.match(launcher, /IPAddress -eq '192\.168\.137\.1'/);
  assert.match(launcher, /Wi-\?Fi Direct\|Mobile Hotspot\|Hosted Network/);
  assert.match(launcher, /Local Area Connection\\\*/);
  assert.match(launcher, /Lokale Verbindung\\\*/);
  assert.match(launcher, /Get-NetRoute/);
  assert.match(launcher, /Show-PrivateIPv4Candidates/);
  assert.match(launcher, /-LanAddress <address>/);
});

test("LAN launcher recovers only a stale Mcello listener on port 4173 and refuses unknown processes", () => {
  assert.match(launcher, /Get-NetTCPConnection -State Listen -LocalPort 4173/);
  assert.match(launcher, /apps\[\\\\\/\]mcello\[\\\\\/\]run\\\.mjs/);
  assert.match(launcher, /Stop-Process -Id \$listener\.OwningProcess -Force/);
  assert.match(launcher, /Found stale Mcello runtime on 127\.0\.0\.1:4173/);
  assert.match(launcher, /Port 4173 is occupied by another process/);
  assert.match(launcher, /Repair-StaleMcelloRuntime/);
});

test("LAN firewall is temporary and restricted to the hotspot address and local subnet", () => {
  assert.match(firewall, /Mcello LAN Demo/);
  assert.match(firewall, /-LocalPort 80/);
  assert.match(firewall, /-LocalPort 54321/);
  assert.match(firewall, /-LocalAddress \$LanAddress/);
  assert.match(firewall, /-RemoteAddress LocalSubnet/);
  assert.match(firewall, /\[switch\]\$Remove/);
  assert.match(firewall, /if \(\$Remove\)/);
  assert.match(firewall, /Remove-NetFirewallRule/);
  assert.doesNotMatch(firewall, /RemoteAddress\s+Any/i);
});
