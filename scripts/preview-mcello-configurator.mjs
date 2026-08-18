import { spawn } from "node:child_process";
import process from "node:process";

const port = Number(process.env.PORT || 4173);
const url = `http://127.0.0.1:${port}/configurator-preview.html?presentation=mcello`;
const child = spawn(
  process.execPath,
  ["--experimental-strip-types", "apps/mcello/run.mjs"],
  { cwd: process.cwd(), env: process.env, stdio: "inherit" },
);

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  if (!child.killed) child.kill(signal);
}

async function waitForPreview() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Mcello Preview-Prozess wurde mit Exit ${child.exitCode} beendet.`);
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Mcello Configurator Preview wurde unter ${url} nicht erreichbar.`);
}

function openBrowser(target) {
  const platform = process.platform;
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (platform === "darwin") {
    spawn("open", [target], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [target], { detached: true, stdio: "ignore" }).unref();
}

try {
  await waitForPreview();
  console.log(`\nMcello Configurator Device Lab: ${url}`);
  console.log("Ohne lokalen Supabase-Stack läuft die Read-only-Fallback-Preview. Für volle Presentation-Fixtures den bestehenden Demo-Stack verwenden.\n");
  openBrowser(url);
} catch (error) {
  console.error(error.message);
  stop();
  process.exitCode = 1;
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => {
  if (!stopping && code !== 0) process.exitCode = code || 1;
  if (signal) console.log(`Mcello Preview beendet (${signal}).`);
});
