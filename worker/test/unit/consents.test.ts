import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTxConsents } from "../../src/lib/consents.ts";

const V = { "refund-policy": "2.0", privacy: "2.1" };

test("A3: tx consents accepted when all three match current versions", () => {
  const r = validateTxConsents({ consents: { refundPolicy: "2.0", privacy: "2.1", thirdParty: "2.1" } }, V);
  assert.deepEqual(r, { refundPolicy: "2.0", privacy: "2.1", thirdParty: "2.1" });
  const nested = validateTxConsents({ consents: { refundPolicy: { version: "2.0" }, privacy: { version: "2.1" }, thirdParty: { version: "2.1" } } }, V);
  assert.equal(nested.refundPolicy, "2.0");
});

test("A3: missing consent block rejected with CONSENT_REQUIRED", () => {
  for (const body of [{}, { consents: null }, { consents: {} }, { consents: { refundPolicy: "2.0" } }, { consents: { refundPolicy: "2.0", privacy: "2.1" } }]) {
    assert.throws(() => validateTxConsents(body, V), (e: any) => e.status === 400 && e.code === "CONSENT_REQUIRED");
  }
});

test("A3: stale version rejected with CONSENT_STALE + current versions", () => {
  assert.throws(
    () => validateTxConsents({ consents: { refundPolicy: "2.0", privacy: "2.0", thirdParty: "2.0" } }, V),
    (e: any) => e.status === 400 && e.code === "CONSENT_STALE" && e.details?.current?.privacy === "2.1",
  );
});
