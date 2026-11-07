import type { Env } from "../env.ts";
import { hmacSha256Hex, newId, randomToken } from "../lib/crypto.ts";
import { validateUrlSafety } from "./url-ingest-service.ts";

export const WEBHOOK_MAX_ATTEMPTS = 5;
const DISPATCH_TIMEOUT_MS = 8000;
const DISPATCH_BATCH = 20;

export interface PartnerHook {
  partnerId: string;
  url: string;
}

/** Active subscription for a partner, or null when the partner never set a URL. */
export async function loadPartnerHook(db: D1Database, partnerId: string | null): Promise<PartnerHook | null> {
  if (!partnerId) return null;
  const row = await db.prepare(
    `SELECT p.id AS id, pr.webhook_url AS url
     FROM partners p JOIN partner_profiles pr ON pr.partner_id = p.id
     WHERE p.id = ? AND p.is_active = 1`
  ).bind(partnerId).first<{ id: string; url: string | null }>();
  if (!row?.url) return null;
  return { partnerId: row.id, url: row.url };
}

/**
 * Statements that enqueue one order-event delivery. Append to the owning money
 * batch so the event is atomic with the state it describes. INSERT OR IGNORE
 * over (event_type, booking_id) keeps capture/reconcile races from doubling.
 */
export function hookEnqueueStmts(db: D1Database, hook: PartnerHook | null, event: string, snapshot: Record<string, unknown>): any[] {
  if (!hook) return [];
  const secret = `whsec_${randomToken(24)}`;
  return [
    db.prepare("UPDATE partner_profiles SET webhook_secret = ? WHERE partner_id = ? AND webhook_secret IS NULL").bind(secret, hook.partnerId),
    db.prepare(
      "INSERT OR IGNORE INTO partner_webhook_deliveries (id, partner_id, webhook_url, event_type, booking_id, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(newId("whd"), hook.partnerId, hook.url, event, (snapshot.booking_id as string) ?? null, JSON.stringify(snapshot)),
  ];
}

/** Deliver pending rows. Called from runMaintenance; never throws. */
export async function flushPartnerWebhooks(env: Env): Promise<{ sent: number; pending: number }> {
  const db = env.DB;
  let sent = 0;
  try {
    const rows = await db.prepare(
      "SELECT * FROM partner_webhook_deliveries WHERE status = 'PENDING' AND attempts < ? ORDER BY created_at LIMIT ?"
    ).bind(WEBHOOK_MAX_ATTEMPTS, DISPATCH_BATCH).all<any>();
    for (const d of rows.results || []) {
      try {
        const prof = await db.prepare("SELECT webhook_url, webhook_secret FROM partner_profiles WHERE partner_id = ?").bind(d.partner_id).first<any>();
        if (!prof?.webhook_url || !prof?.webhook_secret || prof.webhook_url !== d.webhook_url) {
          await db.prepare("UPDATE partner_webhook_deliveries SET status = 'SKIPPED', last_error = 'URL_CHANGED_OR_REMOVED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(d.id).run();
          continue;
        }
        validateUrlSafety(prof.webhook_url);
        if (!prof.webhook_url.startsWith("https://")) throw new Error("WEBHOOK_HTTPS_REQUIRED");
        const body = JSON.stringify({ id: d.id, event: d.event_type, occurred_at: d.created_at, data: JSON.parse(d.payload_json || "{}") });
        const sig = await hmacSha256Hex(prof.webhook_secret, body);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), DISPATCH_TIMEOUT_MS);
        let status = 0;
        try {
          const res = await fetch(prof.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-GFT-Event": d.event_type, "X-GFT-Delivery": d.id, "X-GFT-Signature": `sha256=${sig}` },
            body,
            signal: ctrl.signal,
          });
          status = res.status;
        } finally {
          clearTimeout(timer);
        }
        if (status >= 200 && status < 300) {
          await db.prepare("UPDATE partner_webhook_deliveries SET status = 'SENT', last_status_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, d.id).run();
          sent++;
        } else {
          throw new Error(`HTTP_${status}`);
        }
      } catch (e: any) {
        const attempts = Number(d.attempts || 0) + 1;
        const failed = attempts >= WEBHOOK_MAX_ATTEMPTS;
        await db.prepare("UPDATE partner_webhook_deliveries SET attempts = ?, last_error = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(attempts, String(e?.message || e).slice(0, 300), failed ? "FAILED" : "PENDING", d.id).run();
      }
    }
  } catch (e) {
    console.warn("flushPartnerWebhooks failed:", e);
  }
  const pending = await db.prepare("SELECT COUNT(*) AS c FROM partner_webhook_deliveries WHERE status = 'PENDING'").bind().first<{ c: number }>().catch(() => ({ c: 0 }));
  return { sent, pending: Number(pending?.c || 0) };
}
