import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const server = await readFile(new URL("../scripts/preview-mcello-laptop.mjs", import.meta.url), "utf8");
const cmdLauncher = await readFile(new URL("../Mcello-Laptop-Preview.cmd", import.meta.url), "utf8");
const psLauncher = await readFile(new URL("../Mcello-Laptop-Preview.ps1", import.meta.url), "utf8");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

test("laptop preview is one-click and PowerShell owns launcher behavior", () => {
  assert.equal(pkg.scripts["preview:mcello:laptop"], "node scripts/preview-mcello-laptop.mjs");
  assert.match(cmdLauncher, /Mcello-Laptop-Preview\.ps1/);
  assert.match(cmdLauncher, /pwsh/);
  assert.doesNotMatch(cmdLauncher, /npm run preview:mcello:laptop/);

  assert.match(psLauncher, /npm['"]?\s*,?\s*['"]run['"]?\s*,?\s*['"]preview:mcello:laptop['"]/);
  assert.match(psLauncher, /node_modules\\gsap\\package\.json/);
  assert.match(psLauncher, /Node\.js 22/);
  assert.match(psLauncher, /\[switch\]\$NoBrowser/);
  assert.match(psLauncher, /\[int\]\$Port = 4173/);
  assert.match(psLauncher, /--ignore-scripts/);
  assert.match(psLauncher, /--package-lock=false/);
});

test("laptop PowerShell launcher preserves caller environment after preview exits", () => {
  assert.match(psLauncher, /\$previousPort = \$env:PORT/);
  assert.match(psLauncher, /\$previousNoBrowser = \$env:MCELLO_NO_BROWSER/);
  assert.match(psLauncher, /Remove-Item Env:PORT/);
  assert.match(psLauncher, /Remove-Item Env:MCELLO_NO_BROWSER/);
});

test("laptop preview serves the real generated builder menu but stays read-only", () => {
  assert.match(server, /build-cloudflare-preview\.mjs/);
  assert.match(server, /\/api\/menu/);
  assert.match(server, /preview["'], "menu\.json/);
  assert.match(server, /laptop-preview-read-only/);
  assert.match(server, /MCELLO_LAPTOP_PREVIEW_READ_ONLY/);
  assert.doesNotMatch(server, /\/api\/health[^\n]*200|\/api\/checkout[^\n]*200|\/api\/dev\/otp[^\n]*200/i);
});

test("laptop preview opens the real configurator device lab and keeps GSAP local", () => {
  assert.match(server, /configurator-preview\.html\?presentation=mcello/);
  assert.match(server, /GSAP 3\.15\.0/);
  assert.match(server, /ScrollTrigger/);
  assert.match(server, /Flip/);
  assert.match(server, /Döner\/Yufka\/Pizza Presentation-Modifier/);
  assert.match(server, /FoodStage/);
  assert.doesNotMatch(server, /https:\/\/(?:cdn|cdnjs|unpkg|jsdelivr)/i);
});
