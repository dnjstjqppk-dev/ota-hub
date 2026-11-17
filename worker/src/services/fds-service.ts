import type { Env } from "../env.ts";

/**
 * TG-17: rule-based fraud screen (v1, no ML). Scores every payment attempt
 * BEFORE the provider is called; at/above threshold the attempt is held for
 * operator review (no money moves). Enforced only when FRAUD_REVIEW=1 —
 * unset means off (the suite and sandbox run unflagged; production opts in
 * via the go-live checklist).
 */

export const FDS_REVIEW_THRESHOLD = 60;

export interface FdsScore {
  score: number;
  reasons: string[];
  held: boolean;
}

const HOUR_AGO = () => new Date(Date.now() - 3600_000).toISOString();
const DAY_AGO = () => new Date(Date.now() - 86400_000).toISOString();

async function count(env: Env, sql: string, ...binds: unknown[]): Promise<number> {
  try {
    const r = await env.DB.prepare(sql).bind(...binds).first<{ c: number }>();
    return Number(r?.c || 0);
  } catch {
    return 0;
  }
}

/** Score a payment attempt. Never throws (fail-open with score 0 on DB error). */
export async function scoreAttempt(env: Env, userId: string, bookingId: string, amountMinor: number): Promise<FdsScore> {
  const reasons: string[] = [];
  let score = 0;
  try {
    // R1: confirm velocity per user (account-takeover spray).
    const vel = await count(env,
      "SELECT COUNT(*) AS c FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.user_id = ? AND p.created_at >= ?",
      userId, HOUR_AGO());
    if (vel >= 10) { score += 50; reasons.push(`velocity:${vel}/h`); }
    else if (vel >= 5) { score += 30; reasons.push(`velocity:${vel}/h`); }
    // R2: single + daily exposure.
    if (amountMinor >= 3_000_000) { score += 20; reasons.push(`amount:${amountMinor}`); }
    const daily = await count(env,
      "SELECT COALESCE(SUM(p.amount_minor),0) AS c FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.user_id = ? AND p.created_at >= ? AND p.status IN ('CAPTURED','PROCESSING','UNKNOWN')",
      userId, DAY_AGO());
    if (daily >= 5_000_000) { score += 25; reasons.push(`daily:${daily}`); }
    // R3: recent declines (card testing).
    const declines = await count(env,
      "SELECT COUNT(*) AS c FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.user_id = ? AND p.status = 'FAILED' AND p.created_at >= ?",
      userId, HOUR_AGO());
    if (declines >= 3) { score += 25; reasons.push(`declines:${declines}/h`); }
    // R4: new account + high value.
    const user = await env.DB.prepare("SELECT created_at FROM users WHERE id = ?").bind(userId).first<{ created_at: string }>().catch(() => null);
    if (user?.created_at && user.created_at >= DAY_AGO() && amountMinor >= 1_000_000) {
      score += 20; reasons.push("new_account_high_value");
    }
    // R5: coupon ring (one code across 3+ accounts in 24h).
    const promo = await env.DB.prepare(
      "SELECT q.promotion_code AS code FROM bookings b JOIN quotes q ON q.id = b.quote_id WHERE b.id = ?",
    ).bind(bookingId).first<{ code: string | null }>().catch(() => null);
    if (promo?.code) {
      const ring = await count(env,
        "SELECT COUNT(DISTINCT b.user_id) AS c FROM bookings b JOIN quotes q ON q.id = b.quote_id WHERE q.promotion_code = ? AND b.created_at >= ?",
        promo.code, DAY_AGO());
      if (ring >= 3) { score += 20; reasons.push(`coupon_ring:${promo.code}:${ring}`); }
    }
  } catch {
    return { score: 0, reasons: [], held: false };
  }
  return { score, reasons, held: score >= FDS_REVIEW_THRESHOLD };
}

export function fdsEnforced(env: Env): boolean {
  return env.FRAUD_REVIEW === "1";
}
