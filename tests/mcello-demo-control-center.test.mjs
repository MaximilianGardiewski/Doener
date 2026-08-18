import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const bootstrap = await readFile(new URL("Mcello-Demo.ps1", root), "utf8");
const control = await readFile(new URL("scripts/demo-mcello-control-center.ps1", root), "utf8");
const docs = await readFile(new URL("docs/projects/mcello/DEMO_CONTROL_CENTER_V1.md", root), "utf8");
const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

const combined = `${bootstrap}\n${control}`;

test("standalone bootstrap can create the default workspace and clone the canonical repository", () => {
  assert.match(bootstrap, /C:\\AI\\Doener/);
  assert.match(bootstrap, /https:\/\/github\.com\/MaximilianGardiewski\/Doener\.git/);
  assert.match(bootstrap, /New-Item -ItemType Directory/);
  assert.match(bootstrap, /git clone/);
  assert.match(bootstrap, /Git\.Git/);
  assert.match(bootstrap, /Microsoft\.PowerShell/);
});

test("control center installs and validates the Mcello runtime prerequisites", () => {
  assert.match(control, /OpenJS\.NodeJS\.LTS/);
  assert.match(control, /Docker\.DockerDesktop/);
  assert.match(control, /Node\.js 22/);
  assert.match(control, /docker info/);
  assert.match(control, /winget install/);
});

test("full preparation exposes visible seven-stage progress and warms dependencies before demo start", () => {
  assert.match(control, /Start-ProgressPlan 7/);
  assert.match(control, /Write-Progress/);
  assert.match(control, /npm ci/);
  assert.match(control, /supabase@latest --version/);
  assert.match(control, /supabase@latest start/);
  assert.match(control, /supabase@latest stop --no-backup/);
  assert.match(control, /npm run check/);
});

test("menu exposes full preparation desktop LAN maintenance status and cleanup paths", () => {
  for (const label of [
    "Voll vorbereiten + DESKTOP Demo starten",
    "Voll vorbereiten + LAN Demo",
    "Nur komplett VORBEREITEN",
    "System- und Repository-Status",
    "Repository aktualisieren + npm ci",
    "Supabase/Docker Toolchain vorwärmen",
    "Demo stoppen"
  ]) assert.match(control, new RegExp(label.replace(/[+]/g, "\\+"), "i"));
});

test("orchestration delegates to the already-tested presentation launchers instead of duplicating commerce logic", () => {
  assert.match(control, /demo-mcello\.ps1/);
  assert.match(control, /demo-mcello-presentation-lan\.ps1/);
  assert.doesNotMatch(control, /submitOrder|configuredPrice|configurationValid/);
  assert.match(docs, /dupliziert aber keine Shop-\/Checkout-\/KDS-Logik/);
});

test("automatic git update is fail-safe around local modifications", () => {
  assert.match(control, /git status --porcelain/);
  assert.match(control, /git pull --ff-only origin main/);
  assert.match(control, /Lokale Änderungen erkannt/);
  assert.doesNotMatch(control, /git reset --hard|git clean -f/);
});

test("control center never contains a production deployment path", () => {
  assert.match(combined, /kein Production Deployment|kein Production Deployment/i);
  assert.doesNotMatch(combined, /vercel deploy|supabase link|supabase db push|production deploy/i);
  assert.match(docs, /kein Production Deployment/i);
});

test("package scripts expose the interactive entry point and prepare-only mode", () => {
  assert.equal(packageJson.scripts["demo:mcello"], "pwsh -NoProfile -ExecutionPolicy Bypass -File Mcello-Demo.ps1");
  assert.match(packageJson.scripts["demo:mcello:prepare"], /Mcello-Demo\.ps1 -Mode Prepare/);
});
