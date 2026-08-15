import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const dockerfile = await readFile(new URL("infra/selfhost/Dockerfile", root), "utf8");
const compose = await readFile(new URL("infra/selfhost/compose.app.yml", root), "utf8");
const preflight = await readFile(new URL("infra/selfhost/preflight.sh", root), "utf8");
const migrations = await readFile(new URL("infra/selfhost/apply-migrations.sh", root), "utf8");
const backup = await readFile(new URL("infra/selfhost/backup-db.sh", root), "utf8");
const restore = await readFile(new URL("infra/selfhost/restore-drill.sh", root), "utf8");
const health = await readFile(new URL("infra/selfhost/healthcheck.sh", root), "utf8");

function includesAll(source, values) {
  for (const value of values) assert.equal(source.includes(value), true, `missing: ${value}`);
}

test("app image runs non-root with a liveness probe", () => {
  includesAll(dockerfile, ["USER node", "HEALTHCHECK", "/api/health", "NODE_ENV=production"]);
  assert.doesNotMatch(dockerfile, /COPY\s+\.\s+\./, "image should not indiscriminately copy the repository");
});

test("production compose keeps the app behind localhost and strips container privileges", () => {
  includesAll(compose, [
    '127.0.0.1:${MCELLO_APP_HOST_PORT:-4173}:4173',
    "read_only: true",
    "cap_drop:",
    "- ALL",
    "no-new-privileges:true",
    "restart: unless-stopped",
  ]);
  assert.doesNotMatch(compose, /0\.0\.0\.0:/);
});

test("production preflight requires HTTPS real values and explicit paid messaging approval", () => {
  includesAll(preflight, [
    "require_https PUBLIC_SITE_URL",
    "require_https SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ALLOW_PAID_MESSAGING",
    "tracked Git working tree is dirty",
  ]);
});

test("release migrations are previewed before explicit application", () => {
  includesAll(migrations, [
    'supabase db push --db-url "$DATABASE_URL" --dry-run',
    'APPLY_MIGRATIONS:-NO',
    'supabase db push --db-url "$DATABASE_URL"',
    'supabase migration list --db-url "$DATABASE_URL"',
  ]);
});

test("backup artifacts are private, checksummed and explicit about non-database assets", () => {
  includesAll(backup, [
    "umask 077",
    "pg_dump",
    "pg_dumpall",
    "sha256sum database.dump globals.sql",
    "does NOT contain Supabase Storage object bytes",
    "off-host",
  ]);
});

test("restore drill is destructive only with an explicit disposable target", () => {
  includesAll(restore, [
    "ALLOW_DESTRUCTIVE_RESTORE_TEST",
    "restore*|*drill*|*staging*",
    "Restore target must not equal the source database",
    "pg_restore --list",
    "--exit-on-error",
    "to_regclass('public.orders')",
  ]);
});

test("external health probe covers app gateway and disk headroom", () => {
  includesAll(health, [
    "MCELLO_PUBLIC_URL",
    "SUPABASE_PUBLIC_URL",
    "/api/health",
    "/auth/v1/",
    "MIN_FREE_PERCENT",
    "df -P",
  ]);
});
