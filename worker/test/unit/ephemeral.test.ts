import { test } from "node:test";
import assert from "node:assert/strict";
import { d1Ephemeral, withFallback } from "../../src/lib/ephemeral.ts";
import type { Env } from "../../src/env.ts";

// TG-10: the D1 store issues the exact legacy SQL (lifted verbatim), and the
// fallback wrapper degrades to it operation by operation.

function stubDb(calls: string[], firstResult: unknown = null) {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          calls.push(`Q:${sql} | ${JSON.stringify(args)}`);
          return firstResult;
        },
        run: async () => {
          calls.push(`W:${sql} | ${JSON.stringify(args)}`);
          return { meta: { changes: 1 } };
        },
      }),
    }),
  };
}

const envWith = (calls: string[], firstResult?: unknown) =>
  ({ DB: stubDb(calls, firstResult) }) as unknown as Env;

test("ephemeral: D1 rate counter issues the legacy count-then-insert", async () => {
  const calls: string[] = [];
  const s = d1Ephemeral(stubDb(calls, { c: 3 }) as never);
  assert.equal(await s.count("quotes:1.2.3.4", 1000, 60), 3);
  await s.recordHit("quotes:1.2.3.4", "quotes", 1000, 60);
  assert.deepEqual(calls, [
    'Q:SELECT COUNT(*) AS c FROM login_attempts WHERE ip_address = ? AND attempted_at > ? | ["quotes:1.2.3.4",940]',
    'W:INSERT INTO login_attempts (ip_address, email, attempted_at) VALUES (?, ?, ?) | ["quotes:1.2.3.4","quotes",1000]',
  ]);
});

test("ephemeral: D1 clear/revoke/reset map to the legacy statements", async () => {
  const calls: string[] = [];
  const s = d1Ephemeral(stubDb(calls) as never);
  await s.clear("user_fail:a@b.c");
  await s.revokeJti("jti-1", 9999);
  await s.setReset("usr-1", 1001);
  assert.deepEqual(calls, [
    'W:DELETE FROM login_attempts WHERE ip_address = ? | ["user_fail:a@b.c"]',
    'W:INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?) | ["jti-1",9999]',
    'W:INSERT INTO session_resets (subject_id, reset_at) VALUES (?, ?) ON CONFLICT(subject_id) DO UPDATE SET reset_at = excluded.reset_at | ["usr-1",1001]',
  ]);
  const r1 = d1Ephemeral(stubDb([], { x: 1 }) as never);
  assert.equal(await r1.isRevoked("j"), true);
  const r2 = d1Ephemeral(stubDb([]) as never);
  assert.equal(await r2.isRevoked("j"), false);
  assert.equal(await r2.getReset("u"), null);
  const r3 = d1Ephemeral(stubDb([], { reset_at: 42 }) as never);
  assert.equal(await r3.getReset("u"), 42);
});

test("ephemeral: D1 idempotency claim reads back the winner row", async () => {
  const s = d1Ephemeral(stubDb([], { request_hash: "h", status_code: 200, response_json: '{"ok":1}' }) as never);
  assert.deepEqual(await s.claimIdem("s", "k", "h"), { hash: "h", status: 200, body: '{"ok":1}' });
  const s2 = d1Ephemeral(stubDb([]) as never);
  assert.deepEqual(await s2.claimIdem("s", "k", "h"), { hash: null, status: null, body: null });
  const calls: string[] = [];
  await d1Ephemeral(stubDb(calls) as never).storeIdem("s", "k", 201, '{"a":1}');
  assert.deepEqual(calls, [
    'W:UPDATE idempotency_keys SET status_code = ?, response_json = ? WHERE scope = ? AND idem_key = ? | [201,"{\\"a\\":1}","s","k"]',
  ]);
});

test("ephemeral: fallback uses primary when healthy, secondary on failure", async () => {
  const order: string[] = [];
  const primary = {
    count: async () => { order.push("p.count"); return 7; },
    recordHit: async () => { order.push("p.recordHit"); },
    clear: async () => { order.push("p.clear"); },
    revokeJti: async () => { order.push("p.revokeJti"); },
    isRevoked: async () => { order.push("p.isRevoked"); return false; },
    setReset: async () => { order.push("p.setReset"); },
    getReset: async () => { order.push("p.getReset"); return null; },
    claimIdem: async () => { order.push("p.claimIdem"); return { hash: "h", status: null, body: null }; },
    storeIdem: async () => { order.push("p.storeIdem"); },
  };
  const secondary = {
    count: async () => { order.push("s.count"); return 1; },
    recordHit: async () => { order.push("s.recordHit"); },
    clear: async () => { order.push("s.clear"); },
    revokeJti: async () => { order.push("s.revokeJti"); },
    isRevoked: async () => { order.push("s.isRevoked"); return false; },
    setReset: async () => { order.push("s.setReset"); },
    getReset: async () => { order.push("s.getReset"); return null; },
    claimIdem: async () => { order.push("s.claimIdem"); return { hash: "h", status: null, body: null }; },
    storeIdem: async () => { order.push("s.storeIdem"); },
  };
  const both = withFallback(primary, secondary);
  assert.equal(await both.count("k", 1, 60), 7);
  await both.recordHit("k", "l", 1, 60);
  await both.clear("k");
  await both.revokeJti("j", 1);
  await both.isRevoked("j");
  await both.setReset("u", 1);
  await both.getReset("u");
  await both.claimIdem("s", "k", "h");
  await both.storeIdem("s", "k", 200, "{}");
  assert.ok(order.every((o) => o.startsWith("p.")), JSON.stringify(order));

  const failing = new Proxy(primary, { get: () => async () => { throw new Error("redis down"); } });
  const fb = withFallback(failing, secondary);
  assert.equal(await fb.count("k", 1, 60), 1);
  await fb.recordHit("k", "l", 1, 60);
  await fb.clear("k");
  await fb.revokeJti("j", 1);
  await fb.isRevoked("j");
  await fb.setReset("u", 1);
  await fb.getReset("u");
  assert.deepEqual(await fb.claimIdem("s", "k", "h"), { hash: "h", status: null, body: null });
  await fb.storeIdem("s", "k", 200, "{}");
  assert.equal(order.filter((o) => o.startsWith("s.")).length, 9);
});

test("ephemeral: env injection wins, D1 is the default", async () => {
  const { ephemeral } = await import("../../src/lib/ephemeral.ts");
  const calls: string[] = [];
  const injected = { count: async () => 99 } as never;
  assert.equal(await ephemeral({ EPHEMERAL: injected } as Env).count("k", 1, 60), 99);
  assert.equal(await ephemeral(envWith(calls, { c: 5 })).count("k", 1, 60), 5);
  assert.equal(calls.length, 1);
});
