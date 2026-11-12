import { test } from "node:test";
import assert from "node:assert/strict";
import { idempotencyPrecheck, idempotencyStore } from "../../src/lib/idempotency.ts";
import { fakeDb } from "./_fakedb.ts";

// Genuine in-memory idempotency_keys semantics: INSERT OR IGNORE claims,
// SELECT reads back, UPDATE stores the response.
const envFor = (rows = new Map<string, any>()) => ({
  DB: fakeDb({
    first: (sql, params) => {
      if (sql.startsWith("SELECT request_hash")) {
        const [scope, key] = params as string[];
        return rows.get(`${scope}\n${key}`) || null;
      }
      return null;
    },
    run: (sql, params) => {
      if (sql.startsWith("INSERT OR IGNORE INTO idempotency_keys")) {
        const [scope, key, hash] = params as string[];
        const k = `${scope}\n${key}`;
        if (!rows.has(k)) rows.set(k, { request_hash: hash, status_code: null, response_json: null });
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("UPDATE idempotency_keys SET")) {
        const [status, body, scope, key] = params as [number, string, string, string];
        const r = rows.get(`${scope}\n${key}`);
        if (r) rows.set(`${scope}\n${key}`, { ...r, status_code: status, response_json: body });
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
  }),
}) as any;

// #110: claim-then-replay, and key reuse across different requests is a 422.
test("idempotency: first call claims, stored responses replay, reuse rejects", async () => {
  const env = envFor();
  const first = await idempotencyPrecheck(env, "t", "k1", ["a", "b"]);
  assert.equal(first.replay, null);
  assert.match(first.fingerprint, /^[0-9a-f]{64}$/);
  await idempotencyStore(env, "t", "k1", 200, { ok: true });
  const replay = await idempotencyPrecheck(env, "t", "k1", ["a", "b"]);
  assert.deepEqual(replay.replay, { status: 200, body: { ok: true } });
  await assert.rejects(idempotencyPrecheck(env, "t", "k1", ["a", "DIFFERENT"]), (e: any) => e.code === "IDEMPOTENCY_KEY_REUSED");
  const other = await idempotencyPrecheck(env, "t", "k2", ["a", "b"]);
  assert.equal(other.replay, null, "different keys are independent");
  assert.equal(other.fingerprint, first.fingerprint, "same parts, same fingerprint");
});
