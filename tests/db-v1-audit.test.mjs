import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDatabaseMigrations, formatDatabaseAudit } from "../scripts/audit-db-v1.mjs";

const report = await analyzeDatabaseMigrations();

test("V1 migration history uses unique timestamped filenames", () => {
  assert.ok(report.migrationCount > 0);
  assert.deepEqual(report.malformedNames, []);
  assert.deepEqual(report.duplicateTimestamps, []);
  assert.match(report.firstMigration, /^\d{14}_.+\.sql$/);
  assert.match(report.lastMigration, /^\d{14}_.+\.sql$/);
});

test("V1 audit exposes historical function replacement instead of hiding it", () => {
  assert.ok(report.functionCount > 0);
  assert.ok(report.functionDefinitionCount >= report.functionCount);
  assert.ok(Array.isArray(report.redefinedFunctions));
  for (const item of report.redefinedFunctions) {
    assert.ok(item.count > 1);
    assert.equal(item.files.length, item.count);
  }
});

test("security-definer inventory stays visible to the separate strict privilege guards", () => {
  assert.ok(report.securityDefinerOccurrences > 0);
  assert.ok(report.securityDefinerFiles.length > 0);
});

test("human-readable audit includes baseline-relevant migration metrics", () => {
  const text = formatDatabaseAudit(report);
  for (const marker of [
    "migrations:",
    "history size:",
    "functions redefined later:",
    "SECURITY DEFINER occurrences:",
    "duplicate migration timestamps: 0",
  ]) assert.match(text, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
