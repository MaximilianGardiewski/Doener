import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { extname, join, relative, resolve } from "node:path";
import process from "node:process";

const root = resolve(new URL("../", import.meta.url).pathname);
const roots = ["apps", "scripts"];
const extensions = new Set([".js", ".mjs", ".cjs"]);
const ignoredDirectories = new Set(["node_modules", "dist", ".git"]);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.isDirectory()) continue;
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collect(absolute));
      continue;
    }
    if (entry.isFile() && extensions.has(extname(entry.name))) files.push(absolute);
  }
  return files;
}

const files = (await Promise.all(roots.map(async (directory) => {
  try {
    return await collect(join(root, directory));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}))).flat().sort();

if (!files.length) {
  console.error("Static check found no JavaScript files under apps/ or scripts/.");
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status === 0) continue;
  failures.push({
    file: relative(root, file),
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  });
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`\n[static-check] ${failure.file}\n${failure.output}`);
  }
  console.error(`\nStatic syntax check failed for ${failures.length} of ${files.length} files.`);
  process.exit(1);
}

console.log(`Static syntax check passed for ${files.length} JavaScript files.`);
