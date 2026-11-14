import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/db/database.ts";

// TG-07: the D1 adapter delegates prepare/bind/first/all/run/batch and maps
// result shapes. A fake D1 binding records every call.

function fakeD1(calls: string[]) {
  const stmt = (sql: string) => ({
    sql,
    bind: (...args: unknown[]) => {
      calls.push(`bind:${sql}:${JSON.stringify(args)}`);
      const bound = {
        first: async <T,>() => {
          calls.push(`first:${sql}`);
          return { ok: 1 } as T;
        },
        all: async <T,>() => {
          calls.push(`all:${sql}`);
          return { results: [{ ok: 1 }] as T[], success: true, meta: {} };
        },
        run: async () => {
          calls.push(`run:${sql}`);
          return { success: true, meta: { changes: 3, last_row_id: 9 } };
        },
      };
      (bound as Record<string, unknown>).sql = sql;
      return bound;
    },
  });
  return {
    prepare: (sql: string) => {
      calls.push(`prepare:${sql}`);
      return stmt(sql);
    },
    batch: async (stmts: Array<{ sql: string }>) => {
      calls.push(`batch:${stmts.map((s) => s.sql).join("|")}`);
      return stmts.map(() => ({ success: true, meta: { changes: 2, last_row_id: 0 } }));
    },
  };
}

test("db: adapter delegates prepare/bind/first/all/run with mapped shapes", async () => {
  const calls: string[] = [];
  const d = db({ DB: fakeD1(calls) } as never);
  assert.deepEqual(await d.prepare("SELECT 1 AS ok").bind().first<{ ok: number }>(), { ok: 1 });
  assert.deepEqual(await d.prepare("SELECT 2").bind(1, "x").all<{ ok: number }>(), { results: [{ ok: 1 }] });
  assert.deepEqual(await d.prepare("DELETE FROM t").bind().run(), { changes: 3 });
  assert.deepEqual(calls, [
    "prepare:SELECT 1 AS ok", "bind:SELECT 1 AS ok:[]", "first:SELECT 1 AS ok",
    "prepare:SELECT 2", 'bind:SELECT 2:[1,"x"]', "all:SELECT 2",
    "prepare:DELETE FROM t", "bind:DELETE FROM t:[]", "run:DELETE FROM t",
  ]);
});

test("db: batch carries adapter statements through and maps changes", async () => {
  const calls: string[] = [];
  const d = db({ DB: fakeD1(calls) } as never);
  const out = await d.batch([d.prepare("DELETE FROM a").bind(), d.prepare("DELETE FROM b").bind(7)]);
  assert.deepEqual(out, [{ changes: 2 }, { changes: 2 }]);
  assert.ok(calls.some((c) => c === "batch:DELETE FROM a|DELETE FROM b"), JSON.stringify(calls));
});

test("db: batch rejects foreign statements instead of misfiring", async () => {
  const calls: string[] = [];
  const d = db({ DB: fakeD1(calls) } as never);
  const foreign = { first: async () => null, all: async () => ({ results: [] }), run: async () => ({ changes: 0 }) };
  await assert.rejects(d.batch([foreign]), /same adapter/);
});
