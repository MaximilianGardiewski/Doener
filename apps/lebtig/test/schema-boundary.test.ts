import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const DONOR_MIGRATION_IDS = [
  "5c43e9c9-5dd0-4fe7-a035-eeafe3d6b3ce",
  "1921d91f-276e-4f4c-9d53-4c32f8969935",
  "0882d243-3af3-43da-8924-fc7df8592e15",
  "0450d729-558e-42b3-8148-206be98380b1",
  "086a7468-c091-48e2-a715-c40a04270c72",
  "fa6d902a-5a45-4f03-a2dc-97b562265f86",
  "e041ff64-179a-4fa7-b1f0-4d702c55d564",
  "528831fc-e986-4127-98ce-2f70d7647e3a",
  "ae39424b-5726-42f8-aa30-fd6ebf4d6387",
];

test("historical Lebtig donor migrations are not copied into the Mcello root chain", async () => {
  const filenames = await readdir(path.join(repoRoot, "supabase", "migrations"));
  for (const donorId of DONOR_MIGRATION_IDS) {
    assert.equal(
      filenames.some((filename) => filename.includes(donorId)),
      false,
      `donor migration ${donorId} must not be copied into root supabase/migrations`,
    );
  }
});

test("Lebtig has an explicit app-owned database boundary before schema import", async () => {
  const boundary = await readFile(path.join(repoRoot, "apps", "lebtig", "supabase", "README.md"), "utf8");
  assert.match(boundary, /Clean-Install-Baseline/);
  assert.match(boundary, /admin \| moderator/);
  assert.match(boundary, /Business-\/Seed-Inhalte werden nicht Teil/);
});
