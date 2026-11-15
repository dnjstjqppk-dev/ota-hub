/**
 * TG-11: durable job queue for fulfilment sagas.
 *
 * Mechanics only (enqueue, lease-claim, backoff, dead-letter): saga handlers
 * live in booking-service and are injected as a registry, so this module
 * never imports the domain it pumps. Pumped by runMaintenance (5-min cron +
 * admin endpoint) like every other retry loop (outbox, webhooks, refunds).
 */
import type { Env } from "../env.ts";
import { newId } from "../lib/crypto.ts";
import { audit } from "../lib/auth.ts";

export const JOB_MAX_ATTEMPTS = 5;
export const JOB_BASE_DELAY_MIN = 5;
export const JOB_MAX_DELAY_MIN = 60;
export const JOB_LEASE_MIN = 5;
export const JOB_BATCH = 20;

export type JobType = "FULFIL_BOOK" | "TICKET_ISSUE";
export type JobStatus = "PENDING" | "CLAIMED" | "DONE" | "DEAD";

export interface JobRow {
  id: string;
  type: JobType;
  booking_id: string;
  payload_json: string;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  available_at: string;
  claimed_at: string | null;
  claimed_by: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Handler verdicts: done (success or stale), or retry with the observed error. */
export type JobRunResult = { action: "done" } | { action: "retry"; error: string };
export interface JobHandler {
  run(env: Env, job: JobRow): Promise<JobRunResult>;
  /** Budget exhausted: compensate the saga, then the pump dead-letters. */
  exhausted(env: Env, job: JobRow): Promise<void>;
}

/** attempts: completed attempts so far (1-based) -> next due time. Pure. */
export function backoffAvailableAt(nowMs: number, attempts: number): string {
  const delayMin = Math.min(JOB_BASE_DELAY_MIN * 2 ** Math.max(0, attempts - 1), JOB_MAX_DELAY_MIN);
  return new Date(nowMs + delayMin * 60_000).toISOString();
}

/** Live (retryable) job for a saga step, if any — enqueue sites dedupe on this. */
export async function findLiveJob(db: D1Database, type: JobType, bookingId: string): Promise<JobRow | null> {
  return db.prepare(
    "SELECT * FROM job_queue WHERE type = ? AND booking_id = ? AND status IN ('PENDING', 'CLAIMED') ORDER BY created_at LIMIT 1"
  ).bind(type, bookingId).first<JobRow>();
}

/** Enqueue stmt for the owning money batch (atomic with the state it retries). */
export function jobEnqueueStmt(db: D1Database, type: JobType, bookingId: string, availableAt: string, maxAttempts = JOB_MAX_ATTEMPTS): D1PreparedStatement {
  return db.prepare(
    "INSERT INTO job_queue (id, type, booking_id, payload_json, status, attempts, max_attempts, available_at) VALUES (?, ?, ?, '{}', 'PENDING', 0, ?, ?)"
  ).bind(newId("job"), type, bookingId, maxAttempts, availableAt);
}

export interface PumpStats { done: number; requeued: number; dead: number; }

/**
 * Claim due jobs and dispatch them. A job whose handler throws is retried
 * like an observed-transient outcome (poison dies loudly at exhaustion).
 * Single-job failures never escape; a dead database still aborts the pump.
 */
export async function pumpJobs(env: Env, handlers: Record<string, JobHandler>, nowMs = Date.now(), limit = JOB_BATCH): Promise<PumpStats> {
  const db = env.DB;
  const now = new Date(nowMs).toISOString();
  const leaseCutoff = new Date(nowMs - JOB_LEASE_MIN * 60_000).toISOString();
  const worker = `pump_${nowMs.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  const stats: PumpStats = { done: 0, requeued: 0, dead: 0 };
  const due = await db.prepare(
    "SELECT * FROM job_queue WHERE status = 'PENDING' AND available_at <= ? ORDER BY available_at LIMIT ?"
  ).bind(now, limit).all<JobRow>();
  const stale = await db.prepare(
    "SELECT * FROM job_queue WHERE status = 'CLAIMED' AND claimed_at < ? ORDER BY claimed_at LIMIT ?"
  ).bind(leaseCutoff, limit).all<JobRow>();
  const jobs = [...(due.results || []), ...(stale.results || [])].slice(0, limit);
  for (const j of jobs) {
    const claimed = await db.prepare(
      "UPDATE job_queue SET status = 'CLAIMED', claimed_at = ?, claimed_by = ?, updated_at = ? WHERE id = ? AND status IN ('PENDING', 'CLAIMED') AND (claimed_at IS NULL OR claimed_at < ?)"
    ).bind(now, now, worker, j.id, leaseCutoff).run();
    if ((claimed.meta.changes || 0) !== 1) continue; // lost the race with a concurrent pump
    const handler = handlers[j.type];
    if (!handler) {
      await markDead(env, j, `UNKNOWN_JOB_TYPE:${j.type}`);
      stats.dead++;
      continue;
    }
    let verdict: JobRunResult;
    try {
      verdict = await handler.run(env, j);
    } catch (e) {
      verdict = { action: "retry", error: String((e as any)?.message || e).slice(0, 300) };
    }
    if (verdict.action === "done") {
      await db.prepare("UPDATE job_queue SET status = 'DONE', updated_at = ? WHERE id = ?").bind(now, j.id).run();
      stats.done++;
      continue;
    }
    const attempts = Number(j.attempts || 0) + 1;
    if (attempts >= Number(j.max_attempts || JOB_MAX_ATTEMPTS)) {
      let exhaustError: string | null = null;
      try {
        await handler.exhausted(env, { ...j, attempts });
      } catch (e) {
        exhaustError = String((e as any)?.message || e).slice(0, 300);
      }
      await markDead(env, { ...j, attempts }, exhaustError || verdict.error);
      stats.dead++;
      continue;
    }
    await db.prepare("UPDATE job_queue SET status = 'PENDING', attempts = ?, available_at = ?, last_error = ?, claimed_at = NULL, claimed_by = NULL, updated_at = ? WHERE id = ?")
      .bind(attempts, backoffAvailableAt(nowMs, attempts), verdict.error, now, j.id).run();
    stats.requeued++;
  }
  return stats;
}

async function markDead(env: Env, job: JobRow, error: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE job_queue SET status = 'DEAD', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?")
    .bind(Number(job.attempts || 0), error.slice(0, 500), now, job.id).run();
  // #120 pattern: dead letters audit instead of dying silently.
  await audit(env, "system", "JOB_DEAD_LETTER", "JOB", job.id, { type: job.type, bookingId: job.booking_id, attempts: Number(job.attempts || 0), lastError: error.slice(0, 300) });
}

/** Ops listing (mirrors the #74 refunds queue: no customer PII in projection). */
export async function listJobs(env: Env, status: JobStatus | null, limit = 200): Promise<JobRow[]> {
  const rows = status
    ? await env.DB.prepare("SELECT id, type, booking_id, status, attempts, max_attempts, available_at, last_error, created_at, updated_at FROM job_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?").bind(status, limit).all<JobRow>()
    : await env.DB.prepare("SELECT id, type, booking_id, status, attempts, max_attempts, available_at, last_error, created_at, updated_at FROM job_queue ORDER BY created_at DESC LIMIT ?").bind(limit).all<JobRow>();
  return rows.results || [];
}
