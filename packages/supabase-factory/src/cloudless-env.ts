export const SUPABASE_CLOUD_MANAGEMENT_ENV_KEYS = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_REF",
] as const;

/**
 * Build an `env` argv that explicitly removes Supabase Cloud management/project
 * binding variables before invoking a command against a self-hosted project.
 */
export function cloudlessCommand(command: string, args: readonly string[]): readonly string[] {
  const unset = SUPABASE_CLOUD_MANAGEMENT_ENV_KEYS.flatMap((key) => ["-u", key]);
  return [...unset, command, ...args];
}
