import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, hashPassword, isLegacyHash, newTotpSecret, resolvePbkdf2Iterations, verifyPassword, verifyPasswordDetailed, verifyTotp } from "../../src/lib/crypto.ts";

test("C9: iteration count resolves from env and clamps to the verify range", () => {
  assert.equal(resolvePbkdf2Iterations({} as any), 100_000);
  assert.equal(resolvePbkdf2Iterations({ PBKDF2_ITERATIONS: "60000" } as any), 60_000);
  assert.equal(resolvePbkdf2Iterations({ PBKDF2_ITERATIONS: "5" } as any), 10_000);
  assert.equal(resolvePbkdf2Iterations({ PBKDF2_ITERATIONS: "99999999" } as any), 1_000_000);
  assert.equal(resolvePbkdf2Iterations({ PBKDF2_ITERATIONS: "nope" } as any), 100_000);
});

test("C9: hashes carry their count; drift from configured count flags rehash", async () => {
  const h = await hashPassword("Passw0rd-x1", 30_000);
  assert.ok(h.startsWith("pbkdf2:sha256:30000:"));
  assert.equal(await verifyPassword("Passw0rd-x1", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
  const same = await verifyPasswordDetailed("Passw0rd-x1", h, 30_000);
  assert.deepEqual(same, { ok: true, needsRehash: false });
  const drifted = await verifyPasswordDetailed("Passw0rd-x1", h, 100_000);
  assert.deepEqual(drifted, { ok: true, needsRehash: true });
});

test("#97: legacy hash shape detection matches the verify branch", () => {
  assert.equal(isLegacyHash("pbkdf2:sha256:100000:abc:def"), false);
  assert.equal(isLegacyHash("0".repeat(64)), true);
  assert.equal(isLegacyHash("0".repeat(63)), false);
  assert.equal(isLegacyHash(null), false);
  assert.equal(isLegacyHash(undefined), false);
  assert.equal(isLegacyHash(""), false);
});

test("#100: base32 round-trips and TOTP matches the RFC 6238 vector", async () => {
  const raw = new Uint8Array([...Array(20).keys()]);
  assert.deepEqual([...base32Decode(base32Encode(raw))], [...raw]);
  assert.equal(base32Encode(new TextEncoder().encode("12345678901234567890")), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  // RFC 6238 appendix B, SHA-1, T0=59s: 8-digit 94287082, so 6-digit 287082.
  const v = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(await verifyTotp(v, "287082", 59, 0), true);
  assert.equal(await verifyTotp(v, "287082", 0, 0), false, "wrong step, no window");
  assert.equal(await verifyTotp(v, "287082", 0, 1), true, "adjacent step inside window");
  assert.equal(await verifyTotp(v, "12345", 59, 1), false, "non-6-digit rejected");
  assert.equal(await verifyTotp("!!!", "287082", 59, 1), false, "bad secret rejected");
  assert.equal(newTotpSecret().length, 32, "20 bytes, unpadded");
});
