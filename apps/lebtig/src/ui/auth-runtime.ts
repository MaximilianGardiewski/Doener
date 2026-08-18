import { createClient } from "@supabase/supabase-js";
import type { OAuthPort } from "@business-web/auth";

import { createNativeSupabaseCredentialAuthPort } from "../auth/native-supabase-credentials.ts";
import { createNativeSupabaseOAuthPort } from "../auth/native-supabase-oauth.ts";
import type { LebtigCredentialAuthPort } from "../auth/route-controller.ts";

export interface LebtigBrowserAuthRuntime {
  configured: boolean;
  credentialAuth: LebtigCredentialAuthPort;
  oauth: OAuthPort;
}

function unavailableError(): Error {
  return new Error(
    "Lebtig Auth ist in diesem lokalen Preview nicht konfiguriert. Setze VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY für einen selbst gehosteten oder freigegebenen Supabase-Endpunkt.",
  );
}

function createUnavailableRuntime(): LebtigBrowserAuthRuntime {
  return {
    configured: false,
    credentialAuth: {
      async signInWithPassword() {
        return { session: false, error: unavailableError() };
      },
      async signUp() {
        return { session: false, error: unavailableError() };
      },
    },
    oauth: {
      async signInWithOAuth() {
        return { navigation: "complete", error: unavailableError() };
      },
    },
  };
}

export function createLebtigBrowserAuthRuntime(): LebtigBrowserAuthRuntime {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) return createUnavailableRuntime();

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const oauth = createNativeSupabaseOAuthPort({
    auth: {
      async signInWithOAuth(input) {
        const provider = input.provider === "microsoft" ? "azure" : input.provider;
        return client.auth.signInWithOAuth({
          provider,
          ...(input.options ? { options: input.options } : {}),
        });
      },
    },
  });

  return {
    configured: true,
    credentialAuth: createNativeSupabaseCredentialAuthPort(client),
    oauth,
  };
}
