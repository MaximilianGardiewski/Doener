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
    "[x] Configurable default 5-min acceptance timeout (`D053`)",
    "[x] Repeating incoming alarm + multi-device sync (`D014`, `D049`)",
    "[x] Planned future lane + configurable activation lead (`D055`)",
    "[x] +5/+10/+15/custom delay + customer update (`D056`)",
    "[x] Target time + approximate countdown (`D054`)",
    "[x] Allergen/dietary label model (`D045`)",
    "[x] Timed availability (`D051`)",
    "[x] Staff operational-only role (`D021`)",
    "[x] Safe homepage section ordering/toggling (`D031`)",
    "[x] Event/Special/Presse/News scheduling + pinning (`D032`)",
  ]) {
    assert.match(acceptance, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("known partial V1 requirements remain unchecked", () => {
  for (const expected of [
    "[ ] WhatsApp OTP primary + SMS fallback (`D003`)",
    "[ ] Edit/cancel pre-accept only (`D043`)",
    "[ ] Rush/pause and item/ingredient snooze (`D012`, `D013`)",
    "[ ] Live status/order summary/pickup location (`D015`)",
    "[ ] WhatsApp/SMS status notifications (`D016`)",
    "[ ] Route + call actions (`D017`)",
  ]) {
    assert.match(acceptance, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("evidence ledger records verified custom delay and remaining blockers", () => {
  for (const marker of [
    "D056 | `VERIFIED`",
    "D003 | `PARTIAL`",
    "D043 | `PARTIAL`",
    "D012 + D013 | `PARTIAL`",
    "D015 | `PARTIAL`",
    "D016 | `PARTIAL`",
    "D017 | `OPEN`",
    "23-Minuten-Integrationstest",
    "Customer-Edit vor Acceptance",
    "Verifizierte Pickup-Adresse",
  ]) {
    assert.match(evidence, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
