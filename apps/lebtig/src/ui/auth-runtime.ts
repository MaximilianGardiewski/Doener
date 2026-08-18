import type { OAuthPort } from "@business-web/auth";

import { createNativeSupabaseCredentialAuthPort } from "../auth/native-supabase-credentials.ts";
import { createNativeSupabaseOAuthPort } from "../auth/native-supabase-oauth.ts";
import type { LebtigCredentialAuthPort } from "../auth/route-controller.ts";
import type { LebtigRole } from "../domain/roles.ts";
import { getLebtigSessionSupabaseClient } from "./supabase-browser.ts";

export interface LebtigEditorialAccess {
  userId: string;
  roles: LebtigRole[];
}

export interface LebtigBrowserAuthRuntime {
  configured: boolean;
  credentialAuth: LebtigCredentialAuthPort;
  oauth: OAuthPort;
  getEditorialAccess(): Promise<LebtigEditorialAccess | null>;
  getBootstrapStatus(): Promise<boolean>;
  signOut(): Promise<void>;
}

function unavailableError(): Error {
  return new Error(
    "Lebtig Auth ist in diesem lokalen Preview nicht konfiguriert. Setze VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY für einen selbst gehosteten oder freigegebenen Supabase-Endpunkt.",
  );
}

async function fetchBootstrapStatus(): Promise<boolean> {
  try {
    const response = await fetch("/api/bootstrap-status", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { bootstrapOpen?: unknown };
    return payload.bootstrapOpen === true;
  } catch {
    return false;
  }
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
    async getEditorialAccess() {
      return null;
    },
    async getBootstrapStatus() {
      return false;
    },
    async signOut() {},
  };
}

export function createLebtigBrowserAuthRuntime(): LebtigBrowserAuthRuntime {
  const client = getLebtigSessionSupabaseClient();
  if (!client) return createUnavailableRuntime();

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
    async getEditorialAccess() {
      const userResult = await client.auth.getUser();
      const user = userResult.data.user;
      if (userResult.error || !user) return null;

      const roleResult = await client
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (roleResult.error) throw new Error(roleResult.error.message);

      const roles = (roleResult.data ?? [])
        .map((entry) => entry.role)
        .filter((role): role is LebtigRole => role === "admin" || role === "moderator");
      return { userId: user.id, roles };
    },
    getBootstrapStatus: fetchBootstrapStatus,
    async signOut() {
      const result = await client.auth.signOut();
      if (result.error) throw new Error(result.error.message);
    },
  };
}
