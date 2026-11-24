/**
 * SMS + Kakao Alimtalk delivery (GAP-09) for the notification outbox.
 *
 * The outbox schema always allowed SMS/KAKAO rows, but no sender existed.
 * Sends go through Solapi v4 (one API for SMS/LMS/ATA); the adapter is a
 * single seam — swap sendViaSolapi to change vendors without touching
 * writers, templates, or the flush loop.
 *
 * Honesty rules (same as email): unconfigured keys leave rows queued;
 * Alimtalk without an approved template id falls back to SMS instead of
 * failing; unknown templates dead-letter with an audit, never silently.
 */
import type { Env } from "../env.ts";
import { audit } from "../lib/auth.ts";
import { outboxInsert } from "./email-service.ts";

export function isSmsConfigured(env: Env): boolean {
  return [(env.SOLAPI_API_KEY || "").trim(), (env.SOLAPI_API_SECRET || "").trim(), (env.SOLAPI_SENDER || "").trim()]
    .every((v) => v.length > 0);
}

export function isKakaoConfigured(env: Env): boolean {
  return isSmsConfigured(env) && (env.SOLAPI_KAKAO_PFID || "").trim().length > 0;
}

/** Approved Alimtalk template id for our template name, or null (→ SMS fallback). */
export function kakaoTemplateId(env: Env, template: string): string | null {
  try {
    const map = JSON.parse(env.SOLAPI_KAKAO_TEMPLATES || "{}");
    const id = map?.[template];
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/** Strip markup chars from values interpolated into plain-text messages. */
function clean(v: unknown): string {
  return String(v ?? "").replace(/[<>&]/g, "");
}

const krw = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? `${Math.round(v).toLocaleString("ko-KR")}원` : "";
};

/** Render an outbox row as plain text. Unknown templates return null, never sent. */
export function renderOutboxText(template: string, payloadJson: string, site: string): string | null {
  let p: any = {};
  try {
    p = JSON.parse(payloadJson || "{}");
  } catch {
    return null;
  }
  const brand = "getfortrip";
  const link = `${site.replace(/\/+$/, "")}/my/bookings`;
  const num = clean(p.bookingNumber || p.bookingId || "");
  switch (template) {
    case "BOOKING_CONFIRMED":
      if (!num) return null;
      return `[${brand}] 예약이 확정됐어요 — ${num}\n${link}`;
    case "PAYMENT_COMPLETED": {
      if (!num || !krw(p.amountMinor)) return null;
      return `[${brand}] ${krw(p.amountMinor)} 결제됐어요 — ${num}\n${link}`;
    }
    case "BOOKING_CANCELLED":
      if (!num) return null;
      return `[${brand}] 예약이 취소됐어요 — ${num}\n${link}`;
    case "REFUND_COMPLETED": {
      if (!num || !krw(p.amountMinor)) return null;
      return `[${brand}] ${krw(p.amountMinor)} 환불됐어요 — ${num}\n${link}`;
    }
    case "FLIGHT_TICKETED":
      if (!num) return null;
      return `[${brand}] 항공권이 발권됐어요 — ${num}\n${link}`;
    case "WHOLESALE_ISSUED":
      if (!num) return null;
      return `[${brand}] 바우처가 발급됐어요 — ${num}\n${link}`;
    case "SUPPLIER_REJECTED":
      if (!num) return null;
      return `[${brand}] 아쉽게도 예약이 확정되지 않았어요 — ${num}\n${link}`;
    default:
      return null;
  }
}

const SOLAPI_DEFAULT_BASE = "https://api.solapi.com";

async function solapiAuth(env: Env): Promise<{ key: string; header: string }> {
  const key = (env.SOLAPI_API_KEY || "").trim();
  const secret = (env.SOLAPI_API_SECRET || "").trim();
  const date = new Date().toISOString();
  const salt = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const ck = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", ck, new TextEncoder().encode(date + salt)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return { key, header: `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${sig}` };
}

async function sendViaSolapi(env: Env, message: Record<string, unknown>): Promise<boolean> {
  try {
    const { header } = await solapiAuth(env);
    const base = ((env.SOLAPI_API_BASE || "").trim() || SOLAPI_DEFAULT_BASE).replace(/\/+$/, "");
    const res = await fetch(`${base}/messages/v4/send`, {
      method: "POST",
      headers: { Authorization: header, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => ({}))) as any;
    return body && (body.error_count === 0 || body.error_count === undefined);
  } catch {
    return false;
  }
}

const smsSender = (env: Env) => (env.SOLAPI_SENDER || "").trim();

export async function sendSms(env: Env, to: string, text: string): Promise<boolean> {
  if (!isSmsConfigured(env)) return false;
  const long = new TextEncoder().encode(text).length > 90;
  return sendViaSolapi(env, {
    to, from: smsSender(env), text, type: long ? "LMS" : "SMS",
    ...(long ? { subject: "[getfortrip] 알림" } : {}),
  });
}

export async function sendKakao(env: Env, to: string, template: string, text: string, variables: Record<string, string>): Promise<boolean> {
  const templateId = kakaoTemplateId(env, template);
  if (!isKakaoConfigured(env) || !templateId) return false;
  return sendViaSolapi(env, {
    to, from: smsSender(env), text, type: "ATA",
    kakaoOptions: { pfId: (env.SOLAPI_KAKAO_PFID || "").trim(), templateId, variables },
  });
}

const MAX_ATTEMPTS = 5;

/**
 * Deliver queued SMS/KAKAO rows. KAKAO rows try Alimtalk first and fall back
 * to SMS when no template is approved (or Alimtalk is unconfigured); with no
 * keys at all every row stays queued and is reported as pending.
 */
export async function flushSmsOutbox(env: Env, limit?: number): Promise<{ sent: number; failed: number; pending: number }> {
  const batch = limit ?? Math.min(200, Math.max(1, Number(env.OUTBOX_BATCH_LIMIT) || 50));
  const rows = await env.DB.prepare(
    "SELECT id, channel, recipient, template, payload_json, attempts FROM notification_outbox WHERE channel IN ('SMS', 'KAKAO') AND status IN ('PENDING', 'BLOCKED_NO_PROVIDER') AND attempts < ? ORDER BY created_at LIMIT ?",
  ).bind(MAX_ATTEMPTS, batch).all<any>();
  const queued = rows.results || [];
  const site = env.PUBLIC_SITE_URL || "https://getfortrip.com";
  let sent = 0;
  let failed = 0;
  let pending = 0;
  for (const r of queued) {
    const text = renderOutboxText(r.template, r.payload_json, site);
    if (!text) {
      await env.DB.prepare("UPDATE notification_outbox SET status = 'FAILED', attempts = attempts + 1 WHERE id = ?").bind(r.id).run();
      await audit(env, "system", "SMS_DEAD_LETTER", "OUTBOX", r.id, { template: r.template, reason: "UNRENDERABLE" });
      failed++;
      continue;
    }
    let ok = false;
    if (r.channel === "KAKAO") {
      let vars: Record<string, string> = {};
      try {
        const p = JSON.parse(r.payload_json || "{}");
        if (p.bookingNumber || p.bookingId) vars = { bookingNumber: String(p.bookingNumber || p.bookingId) };
      } catch { /* unrenderable already excluded above; keep empty vars */ }
      ok = await sendKakao(env, r.recipient, r.template, text, vars);
      if (!ok && isSmsConfigured(env) && (!isKakaoConfigured(env) || !kakaoTemplateId(env, r.template))) {
        ok = await sendSms(env, r.recipient, text); // no approved template: SMS fallback
      }
    } else {
      ok = isSmsConfigured(env) ? await sendSms(env, r.recipient, text) : false;
    }
    if (ok) {
      await env.DB.prepare("UPDATE notification_outbox SET status = 'SENT', attempts = attempts + 1 WHERE id = ?").bind(r.id).run();
      sent++;
      continue;
    }
    if (!isSmsConfigured(env)) {
      pending++;
      continue;
    }
    const attempts = Number(r.attempts || 0) + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    await env.DB.prepare("UPDATE notification_outbox SET status = ?, attempts = ? WHERE id = ?")
      .bind(terminal ? "FAILED" : "PENDING", attempts, r.id).run();
    if (terminal) await audit(env, "system", "SMS_DEAD_LETTER", "OUTBOX", r.id, { template: r.template, reason: "RETRIES_EXHAUSTED" });
    failed++;
  }
  return { sent, failed, pending };
}

/** A phone is dialable when it holds 9–12 digits (010-…, +82-…). */
export function isDialable(phone: unknown): boolean {
  return /^\d{9,12}$/.test(String(phone ?? "").replace(/[^0-9]/g, ""));
}

/**
 * Booking lifecycle notification: EMAIL always, KAKAO alongside when a phone
 * exists (flush downgrades to SMS until Alimtalk templates are approved).
 */
export function notifyBooking(db: D1Database, b: { customer_email: string; customer_phone?: string | null }, template: string, payload: unknown): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [outboxInsert(db, "EMAIL", b.customer_email, template, payload)];
  if (isDialable(b.customer_phone)) {
    stmts.push(outboxInsert(db, "KAKAO", String(b.customer_phone), template, payload));
  }
  return stmts;
}
