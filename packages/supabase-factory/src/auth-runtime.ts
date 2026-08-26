import type { SecretRef, SecretStore } from "./secrets.ts";
import type { ResolvedFactoryManifest } from "./types.ts";

export interface AuthRuntimeSecretRefs {
  smtpUser?: SecretRef;
  smtpPassword?: SecretRef;
}

export async function renderAuthRuntimeEnvironment(
  manifest: ResolvedFactoryManifest,
  secrets: AuthRuntimeSecretRefs | undefined,
  secretStore: SecretStore,
): Promise<Record<string, string>> {
  const auth = manifest.auth;
  const production = manifest.project.environment === "production";
  const replacements: Record<string, string> = {
    DISABLE_SIGNUP: String(!auth.signupEnabled),
    JWT_EXPIRY: String(auth.jwtExpirySeconds),
    ENABLE_EMAIL_SIGNUP: String(auth.email.enabled),
    ENABLE_EMAIL_AUTOCONFIRM: String(auth.email.autoConfirm),
    ENABLE_ANONYMOUS_USERS: String(auth.anonymousUsers),
    ENABLE_PHONE_SIGNUP: String(auth.phone.enabled),
    ENABLE_PHONE_AUTOCONFIRM: String(auth.phone.autoConfirm),
  };

  if (!auth.email.enabled) return replacements;

  const smtp = auth.email.smtp;
  if (!smtp) {
    if (production) throw new Error("production email Auth requires SMTP configuration");
    // Development may intentionally use the official local supabase-mail defaults.
    return replacements;
  }

  replacements.SMTP_ADMIN_EMAIL = smtp.adminEmail;
  replacements.SMTP_HOST = smtp.host;
  replacements.SMTP_PORT = String(smtp.port);
  replacements.SMTP_SENDER_NAME = smtp.senderName;

  if (!secrets?.smtpUser || !secrets.smtpPassword) {
    throw new Error("configured SMTP requires smtpUser and smtpPassword SecretRefs");
  }

  const [user, password] = await Promise.all([
    secretStore.get(secrets.smtpUser),
    secretStore.get(secrets.smtpPassword),
  ]);
  if (!user || !password) throw new Error("SMTP SecretRefs resolved to an empty credential");
  replacements.SMTP_USER = user;
  replacements.SMTP_PASS = password;
  return replacements;
}
