import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const gateway = await readFile(new URL("infra/selfhost/container-entrypoint.mjs", root), "utf8");
const dockerfile = await readFile(new URL("infra/selfhost/Dockerfile", root), "utf8");
const preflight = await readFile(new URL("infra/selfhost/preflight.sh", root), "utf8");
const envExample = await readFile(new URL("infra/selfhost/app.env.example", root), "utf8");
const server = await readFile(new URL("apps/mcello/server.mjs", root), "utf8");
const preflightPath = fileURLToPath(new URL("infra/selfhost/preflight.sh", root));

function includesAll(source, markers) {
  for (const marker of markers) assert.equal(source.includes(marker), true, `missing: ${marker}`);
}

async function runPreflight(extraLines = []) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "mcello-d064-"));
  const bin = path.join(temp, "bin");
  await mkdir(bin);
  const docker = path.join(bin, "docker");
  await writeFile(docker, "#!/usr/bin/env bash\nexit 0\n");
  await chmod(docker, 0o755);

  const envFile = path.join(temp, "app.env");
  await writeFile(envFile, [
    "NODE_ENV=production",
    "PUBLIC_SITE_URL=https://mcello.test.invalid-domain.example",
    "SUPABASE_URL=https://supabase.test.invalid-domain.example",
    "SUPABASE_ANON_KEY=anon-000000000000000000000000000000000000000000000000",
    "SUPABASE_SERVICE_ROLE_KEY=service-0000000000000000000000000000000000000000000000",
    "MCELLO_LOCATION_ID=00000000-0000-4000-8000-000000000001",
    ...extraLines,
    "",
  ].join("\n"));

  return spawnSync("bash", [preflightPath, envFile], {
    cwd: temp,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: "utf8",
  });
}

test("D003/D064 keep local OTP development-only and Mcello V1 WhatsApp-only", () => {
  includesAll(server, [
    "new DevOtpProvider",
    'preferredChannel: "whatsapp"',
    'url.pathname === "/api/dev/otp/start"',
    "devCode: devCodes.get(challenge.challengeId)",
  ]);
  assert.doesNotMatch(server, /fallbackChannel:\s*["']sms["']/);
  assert.match(dockerfile, /ENV NODE_ENV=production/);
});

test("production gateway cannot expose development endpoints or create orders through local OTP", () => {
  includesAll(gateway, [
    'const productionRuntime = process.env.NODE_ENV === "production"',
    'url.pathname.startsWith("/api/dev/")',
    'error: "DEVELOPMENT_ENDPOINT_DISABLED"',
    'request.method === "POST" && url.pathname === "/api/checkout"',
    'error: "PRODUCTION_MESSAGING_NOT_CONFIGURED"',
    "blockUnsafeProductionMessaging(request, response)",
  ]);
});

test("production preflight allows only explicitly approved WhatsApp messaging", async () => {
  const noProvider = await runPreflight();
  assert.equal(noProvider.status, 0, noProvider.stderr || noProvider.stdout);

  const whatsappWithoutApproval = await runPreflight(["WHATSAPP_PROVIDER=example-provider"]);
  assert.notEqual(whatsappWithoutApproval.status, 0);
  assert.match(whatsappWithoutApproval.stderr, /WhatsApp provider configured without ALLOW_PAID_MESSAGING=YES/);

  const smsEvenWithApproval = await runPreflight([
    "SMS_PROVIDER=example-provider",
    "ALLOW_PAID_MESSAGING=YES",
  ]);
  assert.notEqual(smsEvenWithApproval.status, 0, "SMS must remain outside Mcello V1 even with spend approval");
  assert.match(smsEvenWithApproval.stderr, /SMS messaging is outside Mcello V1/);

  const approved = await runPreflight([
    "WHATSAPP_PROVIDER=example-provider",
    "ALLOW_PAID_MESSAGING=YES",
  ]);
  assert.equal(approved.status, 0, approved.stderr || approved.stdout);
});

test("Mcello V1 environment surface is WhatsApp-only", () => {
  assert.match(envExample, /WHATSAPP_PROVIDER/);
  assert.doesNotMatch(envExample, /^SMS_(?:PROVIDER|API_TOKEN|SENDER_ID)=/m);
  assert.match(preflight, /SMS messaging is outside Mcello V1/);
});

test("D064 guard does not pretend D003 or D016 production delivery exists", () => {
  assert.doesNotMatch(gateway, /Twilio|MessageBird|Vonage|Meta Cloud API|WhatsApp Cloud/i);
  assert.match(preflight, /WHATSAPP_PROVIDER/);
  assert.match(preflight, /ALLOW_PAID_MESSAGING/);
});
