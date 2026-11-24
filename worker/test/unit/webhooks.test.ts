/** GAP-05 (2026-11-24 commercialization audit): Toss webhook shared-secret auth. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleWebhooks } from "../../src/routes/webhooks.ts";
import { fakeDb } from "./_fakedb.ts";

/** In-memory ephemeral store: enough for the webhook rate limit. */
function memStore() {
  const hits = new Map<string, number>();
  return {
    count: async (k: string) => hits.get(k) || 0,
    recordHit: async (k: string) => { hits.set(k, (hits.get(k) || 0) + 1); },
    clear: async (k: string) => { hits.delete(k); },
  };
}

function hookEnv(over: Record<string, unknown> = {}) {
  return { APP_ENV: "production", DB: fakeDb(), EPHEMERAL: memStore(), ...over } as any;
}

function post(path: string, body: unknown) {
  const u = `https://api.test${path}`;
  return {
    req: new Request(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    url: new URL(u),
  };
}

async function errOf(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  assert.fail("expected the handler to throw");
}

test("toss webhook: production without a secret fails closed", async () => {
  const { req, url } = post("/api/v1/webhooks/toss", {});
  const err: any = await errOf(handleWebhooks(req, hookEnv(), url));
  assert.equal(err.code, "WEBHOOK_NOT_CONFIGURED");
});

test("toss webhook: staging without a secret fails closed (prod-like)", async () => {
  const { req, url } = post("/api/v1/webhooks/toss", {});
  const err: any = await errOf(handleWebhooks(req, hookEnv({ APP_ENV: "staging" }), url));
  assert.equal(err.code, "WEBHOOK_NOT_CONFIGURED");
});

test("toss webhook: development and test without a secret stay open", async () => {
  for (const APP_ENV of ["development", "test"]) {
    const { req, url } = post("/api/v1/webhooks/toss", {});
    // Past auth: an empty body dies at field validation, not at the gate.
    const err: any = await errOf(handleWebhooks(req, hookEnv({ APP_ENV }), url));
    assert.equal(err.code, "INVALID_WEBHOOK");
  }
});

test("toss webhook: exact key passes, anything else is rejected", async () => {
  const env = hookEnv({ TOSS_WEBHOOK_SECRET: "s3cr3t-hook-key" });
  const good = post("/api/v1/webhooks/toss?key=s3cr3t-hook-key", {});
  const passed: any = await errOf(handleWebhooks(good.req, env, good.url));
  assert.equal(passed.code, "INVALID_WEBHOOK"); // auth passed, body validation hit
  // Same length (15) but wrong, shorter, empty, padded, uppercased.
  for (const bad of ["x3cr3t-hook-key", "short", "", "s3cr3t-hook-key ", "S3CR3T-HOOK-KEY"]) {
    const t = post(`/api/v1/webhooks/toss?key=${encodeURIComponent(bad)}`, {});
    const err: any = await errOf(handleWebhooks(t.req, env, t.url));
    assert.equal(err.code, "INVALID_WEBHOOK_SECRET", `key=${JSON.stringify(bad)}`);
  }
  const missing = post("/api/v1/webhooks/toss", {});
  const err: any = await errOf(handleWebhooks(missing.req, env, missing.url));
  assert.equal(err.code, "INVALID_WEBHOOK_SECRET");
});
