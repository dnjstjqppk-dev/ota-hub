import { test } from "node:test";
import assert from "node:assert/strict";
import { backoffAvailableAt, findLiveJob, jobEnqueueStmt, pumpJobs } from "../../src/services/queue-service.ts";
import { fakeDb } from "./_fakedb.ts";

const T0 = Date.parse("2026-11-15T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function job(over: Record<string, unknown> = {}) {
  return {
    id: "job_1", type: "FULFIL_BOOK", booking_id: "bkg_1", payload_json: "{}",
    status: "PENDING", attempts: 0, max_attempts: 5, available_at: iso(T0),
    claimed_at: null, claimed_by: null, last_error: null,
    created_at: iso(T0), updated_at: iso(T0), ...over,
  };
}

function rig(jobs: ReturnType<typeof job>[], opts: { claimChanges?: number } = {}) {
  const rows = new Map(jobs.map((j) => [j.id as string, { ...j }]));
  const audits: unknown[] = [];
  const calls = { run: 0, exhausted: 0 };
  const db = fakeDb({
    all: (sql) => {
      if (sql.includes("status = 'PENDING'")) return [...rows.values()].filter((r) => r.status === "PENDING");
      if (sql.includes("status = 'CLAIMED'")) return [...rows.values()].filter((r) => r.status === "CLAIMED");
      return [];
    },
    first: (sql) => {
      if (sql.includes("FROM job_queue")) return [...rows.values()].find((r) => r.status === "PENDING" || r.status === "CLAIMED") || null;
      return null;
    },
    run: (sql, params) => {
      if (sql.includes("admin_audit_logs")) { audits.push(params); return { meta: { changes: 1 } }; }
      if (sql.startsWith("UPDATE job_queue SET status = 'CLAIMED'")) {
        if (opts.claimChanges === 0) return { meta: { changes: 0 } };
        const r = rows.get(params[3] as string)!;
        r.status = "CLAIMED"; r.claimed_at = params[0]; r.claimed_by = params[2];
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("UPDATE job_queue SET status = 'DONE'")) {
        rows.get(params[1] as string)!.status = "DONE";
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("UPDATE job_queue SET status = 'PENDING', attempts")) {
        const r = rows.get(params[4] as string)!;
        r.status = "PENDING"; r.attempts = params[0]; r.available_at = params[1];
        r.last_error = params[2]; r.claimed_at = null; r.claimed_by = null;
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("UPDATE job_queue SET status = 'DEAD'")) {
        const r = rows.get(params[3] as string)!;
        r.status = "DEAD"; r.attempts = params[0]; r.last_error = params[1];
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
  });
  return { env: { DB: db } as any, rows, audits, calls };
}

function handler(over: Record<string, any> = {}) {
  return {
    run: async () => ({ action: "done" as const }),
    exhausted: async () => {},
    ...over,
  };
}

test("TG-11: backoff doubles from 5 minutes and caps at 60", () => {
  assert.equal(backoffAvailableAt(T0, 1), iso(T0 + 5 * 60_000));
  assert.equal(backoffAvailableAt(T0, 2), iso(T0 + 10 * 60_000));
  assert.equal(backoffAvailableAt(T0, 3), iso(T0 + 20 * 60_000));
  assert.equal(backoffAvailableAt(T0, 4), iso(T0 + 40 * 60_000));
  assert.equal(backoffAvailableAt(T0, 5), iso(T0 + 60 * 60_000));
  assert.equal(backoffAvailableAt(T0, 9), iso(T0 + 60 * 60_000));
});

test("TG-11: done verdict marks DONE and never calls exhausted", async () => {
  const r = rig([job()]);
  const h = handler({ run: async () => { r.calls.run++; return { action: "done" as const }; }, exhausted: async () => { r.calls.exhausted++; } });
  const s = await pumpJobs(r.env, { FULFIL_BOOK: h }, T0);
  assert.deepEqual(s, { done: 1, requeued: 0, dead: 0 });
  assert.equal(r.rows.get("job_1")!.status, "DONE");
  assert.equal(r.calls.run, 1);
  assert.equal(r.calls.exhausted, 0);
});

test("TG-11: retry verdict requeues with backoff and keeps quiet", async () => {
  const r = rig([job()]);
  const h = handler({ run: async () => ({ action: "retry" as const, error: "boom" }) });
  const s = await pumpJobs(r.env, { FULFIL_BOOK: h }, T0);
  assert.deepEqual(s, { done: 0, requeued: 1, dead: 0 });
  const row = r.rows.get("job_1")!;
  assert.equal(row.status, "PENDING");
  assert.equal(row.attempts, 1);
  assert.equal(row.available_at, iso(T0 + 5 * 60_000));
  assert.equal(row.last_error, "boom");
  assert.equal(row.claimed_at, null);
  assert.equal(r.audits.length, 0);
});

test("TG-11: final attempt compensates once, then dead-letters loudly", async () => {
  const r = rig([job({ attempts: 4 })]);
  const h = handler({
    run: async () => { r.calls.run++; return { action: "retry" as const, error: "still dark" }; },
    exhausted: async () => { r.calls.exhausted++; },
  });
  const s = await pumpJobs(r.env, { FULFIL_BOOK: h }, T0);
  assert.deepEqual(s, { done: 0, requeued: 0, dead: 1 });
  const row = r.rows.get("job_1")!;
  assert.equal(row.status, "DEAD");
  assert.equal(row.attempts, 5);
  assert.equal(r.calls.exhausted, 1);
  assert.equal(r.audits.length, 1);
  const a = r.audits[0] as any[];
  assert.equal(a[2], "JOB_DEAD_LETTER");
  assert.ok(String(a[5]).includes("bkg_1") && String(a[5]).includes("still dark"));
});

test("TG-11 red drill: a throwing handler retries, then still dead-letters", async () => {
  const r = rig([job({ attempts: 4 })]);
  const h = handler({
    run: async () => { r.calls.run++; throw new Error("poison"); },
    exhausted: async () => { r.calls.exhausted++; },
  });
  const s = await pumpJobs(r.env, { FULFIL_BOOK: h }, T0);
  assert.deepEqual(s, { done: 0, requeued: 0, dead: 1 });
  assert.equal(r.calls.run, 1);
  assert.equal(r.calls.exhausted, 1);
  assert.equal(r.rows.get("job_1")!.status, "DEAD");
  assert.ok(String((r.audits[0] as any[])[5]).includes("poison"));
});

test("TG-11 red drill: a lost lease race never runs the handler", async () => {
  const r = rig([job()], { claimChanges: 0 });
  const h = handler({ run: async () => { r.calls.run++; return { action: "done" as const }; } });
  const s = await pumpJobs(r.env, { FULFIL_BOOK: h }, T0);
  assert.deepEqual(s, { done: 0, requeued: 0, dead: 0 });
  assert.equal(r.calls.run, 0);
  assert.equal(r.rows.get("job_1")!.status, "PENDING");
});

test("TG-11: unknown job types die loudly without a handler", async () => {
  const r = rig([job({ type: "NOPE" })]);
  const s = await pumpJobs(r.env, { FULFIL_BOOK: handler() }, T0);
  assert.deepEqual(s, { done: 0, requeued: 0, dead: 1 });
  assert.equal(r.rows.get("job_1")!.status, "DEAD");
  assert.ok(String((r.audits[0] as any[])[5]).includes("UNKNOWN_JOB_TYPE"));
});

test("TG-11: enqueue dedupes on live jobs; stmt shape is stable", async () => {
  const live = rig([job()]);
  assert.ok(await findLiveJob(live.env.DB, "FULFIL_BOOK", "bkg_1"));
  const empty = rig([job({ status: "DONE" })]);
  assert.equal(await findLiveJob(empty.env.DB, "FULFIL_BOOK", "bkg_1"), null);
  let captured: any = null;
  const db = { prepare: (sql: string) => ({ bind: (...params: unknown[]) => { captured = { sql, params }; return {}; } }) } as any;
  jobEnqueueStmt(db, "TICKET_ISSUE", "bkg_9", iso(T0));
  assert.ok(captured.sql.startsWith("INSERT INTO job_queue"));
  assert.equal(captured.params[1], "TICKET_ISSUE");
  assert.equal(captured.params[2], "bkg_9");
  assert.equal(captured.params[3], 5);
  assert.equal(captured.params[4], iso(T0));
});
