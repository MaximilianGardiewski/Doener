import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const baseUrl = process.env.LEBTIG_PREVIEW_URL || "http://127.0.0.1:4174";
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(supabaseUrl, "SUPABASE_URL is required");
assert.ok(anonKey, "SUPABASE_ANON_KEY is required");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};
const service = createClient(supabaseUrl, serviceRoleKey, { auth: authOptions });
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const email = `lunch-browser-${suffix}@example.invalid`;
const password = `T-${randomBytes(24).toString("base64url")}aA1!`;
const dishes = [
  `CI Montag ${suffix}`,
  `CI Dienstag ${suffix}`,
  `CI Mittwoch ${suffix}`,
  `CI Donnerstag ${suffix}`,
  `CI Freitag ${suffix}`,
];
let userId = null;

function assertNoError(error, context) {
  assert.equal(error, null, `${context}: ${error?.message ?? "unexpected error"}`);
}

const browser = await chromium.launch({ headless: true });
const editorContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
const editor = await editorContext.newPage();
const publicPage = await publicContext.newPage();
const consoleErrors = [];

for (const page of [editor, publicPage]) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
}

try {
  const bootstrapBefore = await fetch(`${baseUrl}/api/bootstrap-status`, { cache: "no-store" });
  assert.equal(bootstrapBefore.status, 200);
  assert.deepEqual(await bootstrapBefore.json(), { configured: true, bootstrapOpen: true });

  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "CI Lunch Browser Admin" },
  });
  assertNoError(created.error, "create ephemeral browser admin");
  assert.ok(created.data.user?.id, "ephemeral browser admin id missing");
  userId = created.data.user.id;

  const roles = await service.from("user_roles").select("role").eq("user_id", userId);
  assertNoError(roles.error, "read ephemeral browser admin role");
  assert.deepEqual(roles.data, [{ role: "admin" }], "first browser fixture account must be admin");

  const bootstrapAfter = await fetch(`${baseUrl}/api/bootstrap-status`, { cache: "no-store" });
  assert.deepEqual(await bootstrapAfter.json(), { configured: true, bootstrapOpen: false });

  await editor.goto(`${baseUrl}/auth`, { waitUntil: "networkidle" });
  await editor.getByLabel("E-Mail").fill(email);
  await editor.getByLabel("Passwort").fill(password);
  await editor.getByRole("button", { name: "Anmelden", exact: true }).click();
  await editor.waitForURL(`${baseUrl}/admin`);
  await editor.getByRole("heading", { name: "Mittagstisch-Redaktion" }).waitFor();

  await editor.getByRole("button", { name: "Neue Woche" }).click();
  await editor.getByText("Neue Entwurfswoche angelegt.").waitFor();

  const dayNames = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
  for (let index = 0; index < dayNames.length; index += 1) {
    const fieldset = editor.locator("fieldset.editor-day-card").filter({ hasText: dayNames[index] });
    await fieldset.getByLabel("Gericht").fill(dishes[index]);
    await fieldset.getByLabel("Beschreibung").fill(`CI Beschreibung ${index + 1}`);
    await fieldset.getByLabel("Preis").fill(String(9 + index / 10).replace(".", ","));
    if (index === 1) await fieldset.getByLabel("Allergene").fill("CI-A");
  }

  await editor.locator("[data-testid='lunch-preview']").getByText(dishes[0]).waitFor();
  await editor.getByRole("button", { name: "Speichern", exact: true }).click();
  await editor.getByText("Entwurf gespeichert.").waitFor();

  await publicPage.goto(`${baseUrl}/mittagstisch`, { waitUntil: "networkidle" });
  assert.equal(await publicPage.getByText(dishes[0]).count(), 0, "saved draft must remain invisible to anonymous public UI");

  await editor.getByRole("button", { name: "Veröffentlichen", exact: true }).click();
  await editor.getByText(/Wochenkarte veröffentlicht/).waitFor();
  await editor.getByText("Veröffentlicht", { exact: true }).first().waitFor();

  await publicPage.reload({ waitUntil: "networkidle" });
  await publicPage.getByText(dishes[0]).waitFor();
  await publicPage.getByText(dishes[4]).waitFor();
  assert.equal(await publicPage.locator("h1").count(), 1, "published mobile public page keeps one h1");
  const mobileOverflow = await publicPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(mobileOverflow <= 1, `published mobile lunch page should not overflow (delta ${mobileOverflow})`);

  await editor.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
  await editor.getByRole("heading", { name: "Mittagstisch-Redaktion" }).waitFor();
  await editor.getByRole("button", { name: "Folgewoche kopieren", exact: true }).click();
  await editor.getByText("Folgewoche als Entwurf kopiert.").waitFor();
  assert.equal(await editor.locator(".week-list-button").count(), 2, "copy should create a second editorial week");

  const publishedButton = editor.locator(".week-list-button").filter({ hasText: "Veröffentlicht" });
  assert.equal(await publishedButton.count(), 1, "exactly one source week should remain published before archive");
  await publishedButton.click();
  await editor.getByRole("button", { name: "Archivieren", exact: true }).click();
  await editor.getByText(/Woche archiviert/).waitFor();

  await publicPage.reload({ waitUntil: "networkidle" });
  assert.equal(await publicPage.getByText(dishes[0]).count(), 0, "archived source must disappear from anonymous public UI");
  await publicPage.getByText(/keine Wochenkarte veröffentlicht/i).waitFor();

  const persisted = await service
    .from("lunch_weeks")
    .select("id,status,week_start,lunch_items(dish,weekday)")
    .order("week_start", { ascending: true });
  assertNoError(persisted.error, "read browser lifecycle persistence state");
  assert.equal(persisted.data?.length, 2, "browser lifecycle should leave archived source and draft copy");
  assert.deepEqual((persisted.data ?? []).map((week) => week.status), ["archived", "draft"]);
  assert.ok(
    (persisted.data ?? []).every((week) => Array.isArray(week.lunch_items) && week.lunch_items.length === 5),
    "both source and copied week must retain five persisted weekdays",
  );

  assert.deepEqual(consoleErrors, [], `browser console/page errors: ${consoleErrors.join(" | ")}`);
  console.log("Lebtig lunch CMS browser lifecycle passed");
} finally {
  await editorContext.close();
  await publicContext.close();
  await browser.close();
  if (userId) await service.auth.admin.deleteUser(userId);
}
