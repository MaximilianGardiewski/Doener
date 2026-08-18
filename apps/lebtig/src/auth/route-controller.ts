import type { OAuthPort } from "@business-web/auth";

export type LebtigAuthMode = "signin" | "signup";

export interface LebtigCredentials {
  email: string;
  password: string;
}

export interface LebtigCredentialAuthResult {
  session: boolean;
  error?: Error;
}

/**
 * App-level port for the email/password operations used by the Lebtig auth UI.
 * The UI must not depend directly on a Supabase or Lovable client.
 */
export interface LebtigCredentialAuthPort {
  signInWithPassword(credentials: LebtigCredentials): Promise<LebtigCredentialAuthResult>;
  signUp(input: LebtigCredentials & { emailRedirectTo: string }): Promise<LebtigCredentialAuthResult>;
}

export type LebtigAuthRouteResult =
  | { kind: "navigate"; to: "/admin" }
  | { kind: "external-navigation" }
  | { kind: "pending-verification" }
  | { kind: "validation-error"; field: "email" | "password"; message: string }
  | { kind: "error"; error: Error };

export function resolveLebtigAuthMode(
  requestedMode: LebtigAuthMode,
  bootstrapOpen: boolean,
): LebtigAuthMode {
  return requestedMode === "signup" && !bootstrapOpen ? "signin" : requestedMode;
}

export function validateLebtigCredentials(
  input: LebtigCredentials,
): { ok: true; credentials: LebtigCredentials } | { ok: false; result: LebtigAuthRouteResult } {
  const email = input.email.trim();
  if (email.length === 0 || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      result: {
        kind: "validation-error",
        field: "email",
        message: "Bitte gültige E-Mail angeben",
      },
    };
  }

  if (input.password.length < 8 || input.password.length > 72) {
    return {
      ok: false,
      result: {
        kind: "validation-error",
        field: "password",
        message: "Passwort muss zwischen 8 und 72 Zeichen lang sein",
      },
    };
  }

  return { ok: true, credentials: { email, password: input.password } };
}

function adminRedirectUrl(origin: string): string {
  return new URL("/admin", origin).toString();
}

export async function submitLebtigCredentialAuth(input: {
  mode: LebtigAuthMode;
  bootstrapOpen: boolean;
  origin: string;
  credentials: LebtigCredentials;
  credentialAuth: LebtigCredentialAuthPort;
}): Promise<LebtigAuthRouteResult> {
  const validated = validateLebtigCredentials(input.credentials);
  if (!validated.ok) return validated.result;

  if (input.mode === "signup" && !input.bootstrapOpen) {
    return {
      kind: "error",
      error: new Error("Lebtig bootstrap is closed; self-service signup is disabled"),
    };
  }

  const authResult = input.mode === "signin"
    ? await input.credentialAuth.signInWithPassword(validated.credentials)
    : await input.credentialAuth.signUp({
        ...validated.credentials,
        emailRedirectTo: adminRedirectUrl(input.origin),
      });

  if (authResult.error) return { kind: "error", error: authResult.error };
  if (input.mode === "signup" && !authResult.session) return { kind: "pending-verification" };
  return { kind: "navigate", to: "/admin" };
}

export async function startLebtigGoogleOAuth(input: {
  origin: string;
  oauth: OAuthPort;
}): Promise<LebtigAuthRouteResult> {
  const result = await input.oauth.signInWithOAuth({
    provider: "google",
    redirectTo: adminRedirectUrl(input.origin),
  });

  if (result.error) return { kind: "error", error: result.error };
  if (result.navigation === "external") return { kind: "external-navigation" };
  return { kind: "navigate", to: "/admin" };
}
