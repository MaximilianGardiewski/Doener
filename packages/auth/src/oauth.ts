export type OAuthProvider = "google" | "apple" | "microsoft";

export interface OAuthSignInRequest {
  provider: OAuthProvider;
  redirectTo?: string;
  scopes?: string;
}

export type OAuthNavigation = "external" | "complete";

export interface OAuthSignInResult {
  navigation: OAuthNavigation;
  error?: Error;
}

export interface OAuthPort {
  signInWithOAuth(request: OAuthSignInRequest): Promise<OAuthSignInResult>;
}
