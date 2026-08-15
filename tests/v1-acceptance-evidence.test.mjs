import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const acceptance = await readFile(
  new URL("../docs/projects/mcello/ACCEPTANCE.md", import.meta.url),
  "utf8",
);
const evidence = await readFile(
  new URL("../docs/projects/mcello/V1_EVIDENCE.md", import.meta.url),
  "utf8",
);

test("verified V1 backend/ordering capabilities are reflected in acceptance", () => {
  for (const expected of [
    "[x] Pickup ASAP + preorder slots (`D005`, `D009`)",
    "[x] 15-minute slot capacity (`D039`)",
    "[x] Cart persistence + revalidation (`D038`)",
    "[x] Binding only on KDS acceptance (`D042`)",
    "[x] Edit/cancel pre-accept only (`D043`)",
    "[x] Configurable default 5-min acceptance timeout (`D053`)",
    "[x] Repeating incoming alarm + multi-device sync (`D014`, `D049`)",
    "[x] Rush/pause and item/ingredient snooze (`D012`, `D013`)",
    "[x] Planned future lane + configurable activation lead (`D055`)",
    "[x] +5/+10/+15/custom delay + customer update (`D056`)",
    "[x] Target time + approximate countdown (`D054`)",
    "[x] Allergen/dietary label model (`D045`)",
    "[x] Timed availability (`D051`)",
    "[x] Staff operational-only role (`D021`)",
    "[x] Safe homepage section ordering/toggling (`D031`)",
    "[x] Event/Special/Presse/News scheduling + pinning (`D032`)",
    "[x] Installable browser-compatible PWA (`D060`)",
    "[x] Public navigation and emphasized order CTA (`D030`)",
    "[x] Showcase-grade motion without harming usability (`D058`)",
    "[x] Staging/production path is reproducible on self-hosted infrastructure from Git + migrations (`D063`)",
    "[x] Production self-host plan includes TLS, secrets, firewalling, backups, restore test and monitoring (`D063`)",
  ]) {
    assert.match(acceptance, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("known partial V1 requirements remain unchecked", () => {
  for (const expected of [
    "[ ] WhatsApp OTP primary + SMS fallback (`D003`)",
    "[ ] Live status/order summary/pickup location (`D015`)",
    "[ ] WhatsApp/SMS status notifications (`D016`)",
    "[ ] Route + call actions (`D017`)",
  ]) {
    assert.match(acceptance, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("evidence ledger records verified ordering flows and remaining blockers", () => {
  for (const marker of [
    "D043 | `VERIFIED`",
    "D012 + D013 | `VERIFIED`",
    "D056 | `VERIFIED`",
    "D060 | `VERIFIED`",
    "D030 | `VERIFIED`",
    "D058 | `VERIFIED`",
    "D063 (self-host release path) | `VERIFIED`",
    "D063 (production hardening/restore) | `VERIFIED`",
    "tests/pwa-installability.test.mjs",
    "tests/public-navigation.browser.mjs",
    "tests/showcase-motion.browser.mjs",
    "tests/selfhost-backup-restore.integration.sh",
    ".github/workflows/selfhost-release.yml",
    ".github/workflows/selfhost-db-drill.yml",
    "D003 | `PARTIAL`",
    "D015 | `PARTIAL`",
    "D016 | `PARTIAL`",
    "D017 | `OPEN`",
    "tests/preaccept-edit.integration.mjs",
    "tests/rush-mode.integration.mjs",
    "23-Minuten-Integrationstest",
    "Verifizierte Pickup-Adresse",
  ]) {
    assert.match(evidence, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
