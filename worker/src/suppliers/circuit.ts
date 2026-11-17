/**
 * TG-18: per-supplier circuit breaker.
 *
 * Consecutive supplier failures trip the breaker OPEN; while OPEN the money
 * gates refuse new quotes/bookings with 503 + cached alternates, and
 * adapter.book() short-circuits to FAILED (which always converges to a full
 * refund via compensateSupplierFailure). ticket()/cancel() NEVER short-circuit:
 * unwinding an existing commitment must not be blocked by the breaker.
 *
 * State is per-isolate memory (same precedent as the TG-16 search hot cache
 * and TG-13 metrics): two isolates can disagree briefly, and the gates
 * re-check on every request so a stale CLOSED view can never sell through
 * an OPEN breaker for long. A shared Redis tier waits on a generic cache
 * API in EphemeralStore.
 */

export type BreakerStateName = "CLOSED" | "OPEN" | "HALF";

/** Consecutive failures that trip the breaker. */
export const BREAKER_THRESHOLD = 3;
/** Default OPEN dwell before a half-open probe is allowed. */
export const BREAKER_DEFAULT_COOLDOWN_MS = 300_000;

interface BreakerRec {
  failures: number;
  /** ms epoch when the breaker last opened (null = never / closed). */
  openedAt: number | null;
}

const breakers = new Map<string, BreakerRec>();

function rec(name: string): BreakerRec {
  let r = breakers.get(name);
  if (!r) {
    r = { failures: 0, openedAt: null };
    breakers.set(name, r);
  }
  return r;
}

/** Parse SUPPLIER_BREAKER_COOLDOWN_MS (default 300000, clamped 1000–3600000). */
export function breakerCooldownMs(env?: { SUPPLIER_BREAKER_COOLDOWN_MS?: string }): number {
  const raw = Number(env?.SUPPLIER_BREAKER_COOLDOWN_MS);
  if (!Number.isFinite(raw)) return BREAKER_DEFAULT_COOLDOWN_MS;
  return Math.min(3_600_000, Math.max(1_000, Math.floor(raw)));
}

export interface BreakerStatus {
  state: BreakerStateName;
  failures: number;
  /** Seconds until a half-open probe is allowed (0 unless OPEN). */
  retryAfterSec: number;
}

export function breakerStatus(
  name: string,
  opts?: { now?: number; cooldownMs?: number },
): BreakerStatus {
  const now = opts?.now ?? Date.now();
  const cooldown = opts?.cooldownMs ?? BREAKER_DEFAULT_COOLDOWN_MS;
  const r = rec(name);
  if (r.openedAt === null) return { state: "CLOSED", failures: r.failures, retryAfterSec: 0 };
  const elapsed = now - r.openedAt;
  if (elapsed >= cooldown) return { state: "HALF", failures: r.failures, retryAfterSec: 0 };
  return { state: "OPEN", failures: r.failures, retryAfterSec: Math.max(1, Math.ceil((cooldown - elapsed) / 1000)) };
}

/** True unless the breaker is OPEN (HALF allows the probe through). */
export function breakerAllows(name: string, opts?: { now?: number; cooldownMs?: number }): boolean {
  return breakerStatus(name, opts).state !== "OPEN";
}

export function recordBreakerSuccess(name: string): void {
  const r = rec(name);
  r.failures = 0;
  r.openedAt = null;
}

export function recordBreakerFailure(name: string, opts?: { now?: number }): void {
  const r = rec(name);
  const now = opts?.now ?? Date.now();
  if (r.openedAt !== null) {
    // Already OPEN (or a failed HALF probe): re-arm the cooldown.
    r.openedAt = now;
    return;
  }
  r.failures += 1;
  if (r.failures >= BREAKER_THRESHOLD) r.openedAt = now;
}

/** Test-only reset (the E2E suite trips real breakers; units reset between cases). */
export function resetBreakers(): void {
  breakers.clear();
}
