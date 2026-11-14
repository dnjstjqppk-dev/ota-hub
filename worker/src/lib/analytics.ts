import type { Env } from "../env.ts";

/**
 * TG-03: append-only analytics events (search → view → book funnel).
 * Server-side emission into D1; a future warehouse sink (TG-19) reads this
 * table. Best-effort by contract: trackEvent never throws and never changes
 * a response. Retention: 90 days via runMaintenance.
 */

export type AnalyticsEventType = "search" | "view" | "book";

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  domain?: string;
  entityId?: string;
  userId?: string;
  meta?: Record<string, unknown>;
}

export const ANALYTICS_RETENTION_DAYS = 90;

const cap = (s: string | undefined, n: number): string | null => {
  const v = (s || "").slice(0, n);
  return v ? v : null;
};

/** Append one analytics event. Never throws: analytics must not break serving. */
export async function trackEvent(env: Env, e: AnalyticsEvent): Promise<void> {
  try {
    if (e.type !== "search" && e.type !== "view" && e.type !== "book") return;
    const meta = e.meta ? JSON.stringify(e.meta).slice(0, 2000) : null;
    await env.DB.prepare(
      "INSERT INTO analytics_events (event_type, domain, entity_id, user_id, meta_json) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(e.type, cap(e.domain?.toUpperCase(), 20), cap(e.entityId, 100), cap(e.userId, 100), meta)
      .run();
  } catch {
    /* analytics is best-effort */
  }
}
