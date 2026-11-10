import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, resolvePbkdf2Iterations, verifyPassword, verifyPasswordDetailed } from "../../src/lib/crypto.ts";

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
