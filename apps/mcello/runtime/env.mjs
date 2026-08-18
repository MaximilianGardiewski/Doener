import { readFile } from "node:fs/promises";

export async function loadEnv(file) {
  try {
    const raw = await readFile(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = stripQuotes(trimmed.slice(index + 1).trim());
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Static-only preview remains usable without a local environment file.
  }
}

export function optionalEnv(name) {
  const value = process.env[name];
  return value ? stripQuotes(value.trim()) : undefined;
}

export function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}
