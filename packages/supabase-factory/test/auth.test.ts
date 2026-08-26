import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTORY_API_VERSION,
  renderAuthRuntimeEnvironment,
  resolveManifest,
  type SecretRef,
  type SecretStore,
} from "../src/index.ts";

class MemorySecretStore implements SecretStore {
  readonly name = "memory";
  readonly values = new Map<string, string>();
  async put(key: string, value: string): Promise<SecretRef> { this.values.set(key, value); return { store: this.name, key }; }
  async get(ref: SecretRef): Promise<string> {
    const value = this.values.get(ref.key);
    if (value === undefined) throw new Error(`missing secret: ${ref.key}`);
    return value;
  }
  async has(key: string): Promise<boolean> { return this.values.has(key); }
  async delete(key: string): Promise<void> { this.values.delete(key); }
}

test("Factory Auth defaults disable signup methods instead of inheriting demo defaults", () => {
  const resolved = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "auth-defaults", environment: "production" },
    profile: "minimal",
  });

  assert.equal(resolved.auth.signupEnabled, false);
  assert.equal(resolved.auth.email.enabled, false);
  assert.equal(resolved.auth.phone.enabled, false);
  assert.equal(resolved.auth.anonymousUsers, false);
  assert.equal(resolved.auth.jwtExpirySeconds, 3600);
});

test("production email Auth requires explicit SMTP routing configuration", () => {
  assert.throws(() => resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "email-app", environment: "production" },
    profile: "minimal",
    auth: { email: { enabled: true } },
  }), /requires explicit production SMTP configuration/);
});

test("production SMTP credentials are resolved only through SecretRefs", async () => {
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "email-app", environment: "production" },
    profile: "minimal",
    auth: {
      email: {
        enabled: true,
        autoConfirm: false,
        smtp: {
          adminEmail: "auth@example.test",
          host: "smtp.example.test",
          port: 465,
          senderName: "Example App",
        },
      },
    },
  });
  const store = new MemorySecretStore();
  const smtpUser = await store.put("projects/email-app/smtp/user", "smtp-user-secret");
  const smtpPassword = await store.put("projects/email-app/smtp/password", "smtp-pass-secret");

  const env = await renderAuthRuntimeEnvironment(manifest, { smtpUser, smtpPassword }, store);
  assert.equal(env.DISABLE_SIGNUP, "false");
  assert.equal(env.ENABLE_EMAIL_SIGNUP, "true");
  assert.equal(env.ENABLE_EMAIL_AUTOCONFIRM, "false");
  assert.equal(env.ENABLE_PHONE_SIGNUP, "false");
  assert.equal(env.SMTP_ADMIN_EMAIL, "auth@example.test");
  assert.equal(env.SMTP_HOST, "smtp.example.test");
  assert.equal(env.SMTP_PORT, "465");
  assert.equal(env.SMTP_SENDER_NAME, "Example App");
  assert.equal(env.SMTP_USER, "smtp-user-secret");
  assert.equal(env.SMTP_PASS, "smtp-pass-secret");
  assert.equal(JSON.stringify(manifest).includes("smtp-user-secret"), false);
  assert.equal(JSON.stringify(manifest).includes("smtp-pass-secret"), false);
});

test("configured SMTP fails closed without both credential references", async () => {
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "email-app", environment: "production" },
    profile: "minimal",
    auth: {
      email: {
        enabled: true,
        smtp: { adminEmail: "auth@example.test", host: "smtp.example.test", port: 587, senderName: "Example" },
      },
    },
  });
  const store = new MemorySecretStore();
  const smtpUser = await store.put("projects/email-app/smtp/user", "user");
  await assert.rejects(() => renderAuthRuntimeEnvironment(manifest, { smtpUser }, store), /smtpUser and smtpPassword SecretRefs/);
});

test("development can explicitly use the official local mail server path without external SMTP secrets", async () => {
  const manifest = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "dev-email", environment: "development" },
    profile: "minimal",
    auth: { email: { enabled: true, autoConfirm: true } },
  });
  const env = await renderAuthRuntimeEnvironment(manifest, undefined, new MemorySecretStore());
  assert.equal(env.ENABLE_EMAIL_SIGNUP, "true");
  assert.equal(env.ENABLE_EMAIL_AUTOCONFIRM, "true");
  assert.equal(Object.hasOwn(env, "SMTP_PASS"), false);
});

test("production phone Auth fails closed until an SMS provider binding exists", () => {
  assert.throws(() => resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "phone-app", environment: "production" },
    profile: "minimal",
    auth: { phone: { enabled: true } },
  }), /explicit SMS provider binding/);
});

test("JWT expiry honors current documented one-week maximum", () => {
  assert.throws(() => resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "long-jwt", environment: "staging" },
    profile: "minimal",
    auth: { jwtExpirySeconds: 604801 },
  }), /between 300 and 604800/);

  const resolved = resolveManifest({
    apiVersion: FACTORY_API_VERSION,
    project: { id: "week-jwt", environment: "staging" },
    profile: "minimal",
    auth: { jwtExpirySeconds: 604800 },
  });
  assert.equal(resolved.auth.jwtExpirySeconds, 604800);
});
