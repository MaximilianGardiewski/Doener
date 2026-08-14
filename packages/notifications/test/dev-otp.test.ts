import test from "node:test";
import assert from "node:assert/strict";
import { DevOtpProvider } from "../src/dev-otp.ts";

const mobile = "+491701234567";

test("development OTP verifies once without external messaging", async () => {
  let issuedCode = "";
  const provider = new DevOtpProvider({
    codeFactory: () => "123456",
    onCode: ({ code }) => {
      issuedCode = code;
    },
  });

  const challenge = await provider.sendOtp({
    mobile,
    preferredChannel: "whatsapp",
    fallbackChannel: "sms",
  });

  assert.equal(challenge.channel, "whatsapp");
  assert.equal(issuedCode, "123456");
  assert.deepEqual(
    await provider.verifyOtp({ challengeId: challenge.challengeId, code: issuedCode, mobile }),
    { verified: true },
  );
  assert.deepEqual(
    await provider.verifyOtp({ challengeId: challenge.challengeId, code: issuedCode, mobile }),
    { verified: false },
  );
});

test("development OTP challenge is bound to the requested mobile number", async () => {
  const provider = new DevOtpProvider({ codeFactory: () => "123456" });
  const challenge = await provider.sendOtp({ mobile, preferredChannel: "whatsapp" });

  assert.deepEqual(
    await provider.verifyOtp({
      challengeId: challenge.challengeId,
      code: "123456",
      mobile: "+491709999999",
    }),
    { verified: false },
  );

  // A failed mobile mismatch does not consume the genuine challenge.
  assert.deepEqual(
    await provider.verifyOtp({ challengeId: challenge.challengeId, code: "123456", mobile }),
    { verified: true },
  );
});

test("development OTP rejects wrong and expired codes", async () => {
  let now = Date.UTC(2026, 7, 14, 18, 0, 0);
  const provider = new DevOtpProvider({
    ttlMs: 60_000,
    now: () => now,
    codeFactory: () => "654321",
  });

  const challenge = await provider.sendOtp({
    mobile,
    preferredChannel: "sms",
  });

  assert.deepEqual(
    await provider.verifyOtp({ challengeId: challenge.challengeId, code: "000000", mobile }),
    { verified: false },
  );

  now += 60_001;
  assert.deepEqual(
    await provider.verifyOtp({ challengeId: challenge.challengeId, code: "654321", mobile }),
    { verified: false },
  );
});
