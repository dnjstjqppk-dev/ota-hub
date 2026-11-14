import { test } from "node:test";
import assert from "node:assert/strict";
import { ANALYTICS_RETENTION_DAYS, trackEvent } from "../../src/lib/analytics.ts";
import type { Db } from "../../src/db/database.ts";

function stubDb(calls: Array<{ sql: string; args: unknown[] }>, fail = false): Db {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async <T,>() => null as T | null,
        all: async <T,>() => ({ results: [] as T[] }),
        run: async () => {
          if (fail) throw new Error("db down");
          calls.push({ sql, args });
          return { changes: 1 };
        },
      }),
    }),
    batch: async () => [],
  };
}

test("analytics: trackEvent inserts one row with type/domain/entity/user/meta", async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  await trackEvent(stubDb(calls), {
    type: "search", domain: "hotel", entityId: "htl_1", userId: "usr_1", meta: { resultCount: 7 },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO analytics_events/);
  assert.deepEqual(calls[0].args, ["search", "HOTEL", "htl_1", "usr_1", JSON.stringify({ resultCount: 7 })]);
});

test("analytics: unknown event types are dropped without a write", async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  await trackEvent(stubDb(calls), { type: "purchase" as never, domain: "HOTEL" });
  assert.equal(calls.length, 0);
});

test("analytics: a dead database never breaks the request", async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  await assert.doesNotReject(trackEvent(stubDb(calls, true), { type: "view", domain: "HOTEL", entityId: "x" }));
  assert.equal(calls.length, 0);
});

test("analytics: long fields truncate and missing fields stay null", async () => {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  await trackEvent(stubDb(calls), { type: "book", domain: "HOTEL", entityId: "b".repeat(200) });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["book", "HOTEL", "b".repeat(100), null, null]);
  assert.equal(ANALYTICS_RETENTION_DAYS, 90);
});
