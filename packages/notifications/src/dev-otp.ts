import { randomInt, randomUUID } from "node:crypto";
import type { OtpChallenge, OtpChannel, OtpProvider } from "./contracts.ts";

type StoredChallenge = {
  code: string;
  mobile: string;
  expiresAtMs: number;
};

export interface DevOtpProviderOptions {
  ttlMs?: number;
  now?: () => number;
  codeFactory?: () => string;
  onCode?: (data: {
    challengeId: string;
    code: string;
    mobile: string;
    channel: OtpChannel;
    expiresAt: string;
  }) => void;
}

/**
 * Development-only OTP provider.
 *
 * It never sends a real WhatsApp or SMS message. The generated code is exposed
 * only through the injected `onCode` callback (for example a local console or
 * test harness). Do not wire this provider into a public production runtime.
 */
export class DevOtpProvider implements OtpProvider {
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #codeFactory: () => string;
  readonly #onCode?: DevOtpProviderOptions["onCode"];
  readonly #challenges = new Map<string, StoredChallenge>();

  constructor(options: DevOtpProviderOptions = {}) {
    this.#ttlMs = options.ttlMs ?? 5 * 60_000;
    this.#now = options.now ?? Date.now;
    this.#codeFactory =
      options.codeFactory ?? (() => randomInt(0, 1_000_000).toString().padStart(6, "0"));
    this.#onCode = options.onCode;
  }

  async sendOtp(input: {
    mobile: string;
    preferredChannel: OtpChannel;
    fallbackChannel?: OtpChannel;
  }): Promise<OtpChallenge> {
    const challengeId = randomUUID();
    const code = this.#codeFactory();
    const expiresAtMs = this.#now() + this.#ttlMs;
    const expiresAt = new Date(expiresAtMs).toISOString();

    this.#challenges.set(challengeId, { code, mobile: input.mobile, expiresAtMs });
    this.#onCode?.({
      challengeId,
      code,
      mobile: input.mobile,
      channel: input.preferredChannel,
      expiresAt,
    });

    return {
      challengeId,
      channel: input.preferredChannel,
      expiresAt,
    };
  }

  async verifyOtp(input: {
    challengeId: string;
    code: string;
    mobile: string;
  }): Promise<{ verified: boolean }> {
    const stored = this.#challenges.get(input.challengeId);
    if (!stored) return { verified: false };

    if (stored.expiresAtMs <= this.#now()) {
      this.#challenges.delete(input.challengeId);
      return { verified: false };
    }

    const verified = stored.code === input.code && stored.mobile === input.mobile;
    if (verified) this.#challenges.delete(input.challengeId);
    return { verified };
  }
}
