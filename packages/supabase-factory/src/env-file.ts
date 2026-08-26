export function parseEnvFile(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    values.set(key, line.slice(separator + 1));
  }
  return values;
}

export function patchEnvFile(source: string, replacements: Readonly<Record<string, string>>): string {
  const pending = new Map(Object.entries(replacements));
  const output: string[] = [];

  for (const rawLine of source.replace(/\r\n/g, "\n").split("\n")) {
    const match = rawLine.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (match && pending.has(match[1])) {
      output.push(`${match[1]}=${pending.get(match[1]) ?? ""}`);
      pending.delete(match[1]);
    } else {
      output.push(rawLine);
    }
  }

  if (pending.size > 0) {
    if (output.length > 0 && output.at(-1) !== "") output.push("");
    output.push("# Supabase Factory managed values");
    for (const [key, value] of [...pending].sort(([a], [b]) => a.localeCompare(b))) {
      output.push(`${key}=${value}`);
    }
  }

  while (output.length > 1 && output.at(-1) === "" && output.at(-2) === "") output.pop();
  if (output.at(-1) !== "") output.push("");
  return output.join("\n");
}

export function requireEnvValues(source: string, keys: readonly string[]): Record<string, string> {
  const parsed = parseEnvFile(source);
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = parsed.get(key);
    if (value === undefined || value.length === 0) throw new Error(`required generated environment value missing: ${key}`);
    result[key] = value;
  }
  return result;
}
