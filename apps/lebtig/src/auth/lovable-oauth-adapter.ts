import type {
  OAuthPort,
  OAuthProvider,
  OAuthSignInRequest,
  OAuthSignInResult,
} from "@business-web/auth";

interface LovableOAuthResultLike {
  redirected?: boolean;
  error?: Error | { message?: string } | null;
}

export interface LovableOAuthBrokerLike {
  signInWithOAuth(
    provider: OAuthProvider | "lovable",
    options?: {
      redirect_uri?: string;
      extraParams?: Record<string, string>;
    },
  ): Promise<LovableOAuthResultLike>;
}

function normalizeError(error: NonNullable<LovableOAuthResultLike["error"]>): Error {
  return error instanceof Error ? error : new Error(error.message || "OAuth sign-in failed");
}

/**
 * Transitional adapter for the current Lovable Cloud OAuth broker.
 * BusinessWebFactory code depends only on OAuthPort; this adapter can be removed
 * when the migrated Lebtig UI switches fully to native Supabase OAuth.
 */
export function createLovableOAuthAdapter(broker: LovableOAuthBrokerLike): OAuthPort {
  return {
    async signInWithOAuth(request: OAuthSignInRequest): Promise<OAuthSignInResult> {
      const result = await broker.signInWithOAuth(request.provider, {
        ...(request.redirectTo ? { redirect_uri: request.redirectTo } : {}),
        ...(request.scopes ? { extraParams: { scope: request.scopes } } : {}),
      });

      if (result.error) {
        return { navigation: "complete", error: normalizeError(result.error) };
      }

      return { navigation: result.redirected ? "external" : "complete" };
    },
  };
}
