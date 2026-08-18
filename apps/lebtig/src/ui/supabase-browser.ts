import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface LebtigSupabaseBrowserConfig {
  url: string;
  anonKey: string;
}

let sessionClient: SupabaseClient | null | undefined;

export function readLebtigSupabaseBrowserConfig(): LebtigSupabaseBrowserConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Session-aware browser client for auth and staff operations.
 * Only the public anon key is accepted here; privileged credentials belong to serve.mjs.
 */
export function getLebtigSessionSupabaseClient(): SupabaseClient | null {
  if (sessionClient !== undefined) return sessionClient;
  const config = readLebtigSupabaseBrowserConfig();
  if (!config) {
    sessionClient = null;
    return sessionClient;
  }

  sessionClient = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return sessionClient;
}

/**
 * Deliberately does not load/persist a browser session. Public CMS reads therefore
 * keep anonymous semantics even if an editor is signed in in another client.
 */
export function createLebtigAnonymousSupabaseClient(): SupabaseClient | null {
  const config = readLebtigSupabaseBrowserConfig();
  if (!config) return null;
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
