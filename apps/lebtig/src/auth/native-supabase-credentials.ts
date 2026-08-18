import type {
  LebtigCredentialAuthPort,
  LebtigCredentialAuthResult,
  LebtigCredentials,
} from "./route-controller.ts";

interface SupabaseAuthErrorLike {
  message: string;
}

interface SupabaseCredentialResponseLike {
  data?: {
    session?: unknown | null;
  } | null;
  error?: SupabaseAuthErrorLike | null;
}

export interface SupabaseCredentialClientLike {
  auth: {
    signInWithPassword(input: LebtigCredentials): Promise<SupabaseCredentialResponseLike>;
    signUp(input: {
      email: string;
      password: string;
      options: { emailRedirectTo: string };
    }): Promise<SupabaseCredentialResponseLike>;
  };
}

function normalizeResult(result: SupabaseCredentialResponseLike): LebtigCredentialAuthResult {
  if (result.error) {
    return { session: false, error: new Error(result.error.message) };
  }
  return { session: Boolean(result.data?.session) };
}

/**
 * Portable default adapter for the email/password operations used by Lebtig.
 * The concrete @supabase/supabase-js client is injected by the composition root.
 */
export function createNativeSupabaseCredentialAuthPort(
  client: SupabaseCredentialClientLike,
): LebtigCredentialAuthPort {
  return {
    async signInWithPassword(credentials) {
      return normalizeResult(await client.auth.signInWithPassword(credentials));
    },
    async signUp(input) {
      return normalizeResult(await client.auth.signUp({
        email: input.email,
        password: input.password,
        options: { emailRedirectTo: input.emailRedirectTo },
      }));
    },
  };
}
