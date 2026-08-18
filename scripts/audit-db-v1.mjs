import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const migrationNamePattern = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const functionPattern = /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi;
const tablePattern = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\b/gi;
const typePattern = /\bcreate\s+type\s+(?:public\.)?([a-z_][a-z0-9_]*)\b/gi;

function collectMatches(source, pattern) {
  const values = [];
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) values.push(match[1]);
  return values;
}

export async function analyzeDatabaseMigrations(repoRoot = defaultRoot) {
  const migrationsDir = path.join(repoRoot, "supabase", "migrations");
  const entries = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  const malformedNames = entries.filter((name) => !migrationNamePattern.test(name));
  const timestamps = new Map();
  const functions = new Map();
  const tables = new Set();
  const types = new Set();
  const securityDefinerFiles = [];
  let totalBytes = 0;
  let securityDefinerOccurrences = 0;

  for (const name of entries) {
    const match = name.match(migrationNamePattern);
    if (match) {
      const files = timestamps.get(match[1]) || [];
      files.push(name);
      timestamps.set(match[1], files);
    }

    const absolute = path.join(migrationsDir, name);
    totalBytes += (await stat(absolute)).size;
    const sql = await readFile(absolute, "utf8");

    for (const functionName of collectMatches(sql, functionPattern)) {
      const definitions = functions.get(functionName) || [];
      definitions.push(name);
      functions.set(functionName, definitions);
    }
    for (const tableName of collectMatches(sql, tablePattern)) tables.add(tableName);
    for (const typeName of collectMatches(sql, typePattern)) types.add(typeName);

    const securityMatches = sql.match(/\bsecurity\s+definer\b/gi) || [];
    if (securityMatches.length) {
      securityDefinerOccurrences += securityMatches.length;
      securityDefinerFiles.push({ file: name, count: securityMatches.length });
    }
  }

  const duplicateTimestamps = [...timestamps.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([timestamp, files]) => ({ timestamp, files }));

  const redefinedFunctions = [...functions.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => ({ name, count: files.length, files }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    migrationCount: entries.length,
    totalBytes,
    firstMigration: entries[0] || null,
    lastMigration: entries.at(-1) || null,
    malformedNames,
    duplicateTimestamps,
    functionCount: functions.size,
    functionDefinitionCount: [...functions.values()].reduce((sum, files) => sum + files.length, 0),
    redefinedFunctions,
    tableCount: tables.size,
    typeCount: types.size,
    securityDefinerOccurrences,
    securityDefinerFiles,
  };
}

export function formatDatabaseAudit(report) {
  const lines = [
    "Mcello V1 database migration audit",
    `migrations: ${report.migrationCount}`,
    `history size: ${report.totalBytes} bytes`,
    `range: ${report.firstMigration ?? "n/a"} -> ${report.lastMigration ?? "n/a"}`,
    `tables created in history: ${report.tableCount}`,
    `types created in history: ${report.typeCount}`,
    `distinct functions defined: ${report.functionCount}`,
    `function definitions in history: ${report.functionDefinitionCount}`,
    `functions redefined later: ${report.redefinedFunctions.length}`,
    `SECURITY DEFINER occurrences: ${report.securityDefinerOccurrences}`,
    `malformed migration names: ${report.malformedNames.length}`,
    `duplicate migration timestamps: ${report.duplicateTimestamps.length}`,
  ];

  if (report.redefinedFunctions.length) {
    lines.push("", "Functions with multiple historical definitions:");
    for (const item of report.redefinedFunctions) {
      lines.push(`- ${item.name}: ${item.count} definitions (${item.files.join(", ")})`);
    }
  }
  return `${lines.join("\n")}\n`;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  const report = await analyzeDatabaseMigrations();
  process.stdout.write(formatDatabaseAudit(report));
  if (report.malformedNames.length || report.duplicateTimestamps.length) process.exitCode = 1;
}
