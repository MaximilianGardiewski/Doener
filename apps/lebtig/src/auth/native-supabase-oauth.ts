import type {
  OAuthPort,
  OAuthProvider,
  OAuthSignInRequest,
  OAuthSignInResult,
} from "@business-web/auth";

interface SupabaseOAuthErrorLike {
  message?: string;
}

export interface SupabaseOAuthClientLike {
  auth: {
    signInWithOAuth(input: {
      provider: OAuthProvider;
      options?: {
        redirectTo?: string;
        scopes?: string;
      };
    }): Promise<{
      error?: SupabaseOAuthErrorLike | Error | null;
    }>;
  };
}

function normalizeError(error: SupabaseOAuthErrorLike | Error): Error {
  return error instanceof Error ? error : new Error(error.message || "OAuth sign-in failed");
}

export function createNativeSupabaseOAuthPort(client: SupabaseOAuthClientLike): OAuthPort {
  return {
    async signInWithOAuth(request: OAuthSignInRequest): Promise<OAuthSignInResult> {
      const options = request.redirectTo || request.scopes
        ? {
            ...(request.redirectTo ? { redirectTo: request.redirectTo } : {}),
            ...(request.scopes ? { scopes: request.scopes } : {}),
          }
        : undefined;

      const result = await client.auth.signInWithOAuth({
        provider: request.provider,
        ...(options ? { options } : {}),
      });

      if (result.error) {
        return { navigation: "complete", error: normalizeError(result.error) };
      }

      // supabase-js owns the external OAuth redirect in the browser.
      return { navigation: "external" };
    },
  };
}
