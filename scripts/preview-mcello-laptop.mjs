import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const port = Number(process.env.PORT || 4173);
const host = "127.0.0.1";
const deviceLabUrl = `http://${host}:${port}/configurator-preview.html?presentation=mcello`;
const resetBrowserState = process.env.MCELLO_RESET_BROWSER_STATE === "1";

await runNodeScript(path.join(root, "scripts", "build-cloudflare-preview.mjs"));
await relabelPreviewFixture();
if (resetBrowserState) await prepareFreshDeviceLab();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);

    if (url.pathname === "/api/menu") {
      return serveFile(path.join(dist, "preview", "menu.json"), response, "application/json; charset=utf-8");
    }

    // The laptop preview must remain read-only. Deliberately do not emulate backend health,
    // checkout or OTP endpoints; app.js will keep checkout controls disabled.
    if (url.pathname.startsWith("/api/")) {
      response.writeHead(404, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: "MCELLO_LAPTOP_PREVIEW_READ_ONLY" }));
      return;
    }

    let relative = decodeURIComponent(url.pathname);
    if (relative === "/") relative = "/index.html";
    const target = path.resolve(dist, `.${relative}`);
    if (!target.startsWith(`${dist}${path.sep}`) && target !== path.join(dist, "index.html")) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      await access(target);
      return serveFile(target, response, contentType(target));
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : String(error));
  }
});

server.listen(port, host, () => {
  console.log("\n===============================================");
  console.log("  MCELLO LAPTOP PREVIEW");
  console.log("===============================================");
  console.log(`Device Lab: ${deviceLabUrl}`);
  console.log(`Direkt:     http://${host}:${port}/?presentation=mcello#bestellen`);
  console.log("\nEnthalten:");
  console.log("- echter Mcello-Client");
  console.log("- Döner/Yufka/Pizza Presentation-Modifier");
  console.log("- FoodStage");
  console.log("- GSAP 3.15.0 / ScrollTrigger / Flip");
  console.log("- Desktop / Tablet / Phone Device Lab");
  if (resetBrowserState) console.log("- Clean Start: alter lokaler Mcello-Warenkorb + Session-State werden beim ersten Laden gelöscht");
  console.log("\nRead-only: Checkout, OTP und Backend bleiben deaktiviert.");
  console.log("Zum Beenden dieses Fenster schließen oder Strg+C drücken.\n");
  openBrowser(deviceLabUrl);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

async function relabelPreviewFixture() {
  const menuPath = path.join(dist, "preview", "menu.json");
  const menu = JSON.parse(await readFile(menuPath, "utf8"));
  menu.locationId = "laptop-preview-read-only";
  menu.provenance = "generated from provisional menu seed + presentation-only builder fixture for local laptop preview; never production catalog truth";
  await writeFile(menuPath, `${JSON.stringify(menu)}\n`, "utf8");
}

async function prepareFreshDeviceLab() {
  const file = path.join(dist, "configurator-preview.html");
  let source = await readFile(file, "utf8");
  const before = 'src="/?presentation=mcello#bestellen"';
  const after = 'src="/?presentation=mcello&reset=1#bestellen"';
  if (!source.includes(before)) {
    throw new Error("Mcello Laptop Preview clean-start anchor missing in configurator-preview.html");
  }
  source = source.replace(before, after);
  await writeFile(file, source, "utf8");
}

async function runNodeScript(scriptPath) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Build failed with exit ${code}`)));
  });
}

function openBrowser(target) {
  if (process.env.MCELLO_NO_BROWSER === "1") return;
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [target], { detached: true, stdio: "ignore" }).unref();
  }
}

function serveFile(file, response, type) {
  response.writeHead(200, {
    "content-type": type,
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow, noarchive",
  });
  createReadStream(file).pipe(response);
}

function contentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".webp": return "image/webp";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webmanifest": return "application/manifest+json; charset=utf-8";
    default: return "application/octet-stream";
  }
}
