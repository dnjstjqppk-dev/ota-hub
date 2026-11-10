/**
 * Transactional email delivery (Resend) for the notification outbox.
 *
 * Writers (password resets, booking confirmations) only enqueue rows; this
 * module is the single sender, driven by the maintenance cron. With no
 * RESEND_API_KEY configured nothing is sent and rows stay queued — the API
 * says so honestly instead of claiming delivery.
 */
import type { Env } from "../env.ts";
import { newId } from "../lib/crypto.ts";

export function isEmailConfigured(env: Env): boolean {
  return (env.RESEND_API_KEY || "").trim().length > 0;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&#39;", '"': "&quot;" })[c]!);
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

/** Render an outbox row. Unknown templates return null and are never sent. */
export function renderOutboxEmail(template: string, payloadJson: string, site: string): RenderedEmail | null {
  let p: any = {};
  try {
    p = JSON.parse(payloadJson || "{}");
  } catch {
    return null;
  }
  const brand = "getfortrip";
  if (template === "PASSWORD_RESET") {
    const link = String(p.link || "");
    if (!/^https:\/\//.test(link)) return null;
    return {
      subject: `[${brand}] 비밀번호 재설정 링크 (30분 유효)`,
      html: `<p>안녕하세요. 비밀번호 재설정을 요청하셨어요.</p><p><a href="${esc(link)}">비밀번호 재설정하기</a> (30분 동안 유효해요)</p><p>요청하지 않으셨다면 이 메일을 무시하세요.</p>`,
    };
  }
  if (template === "PRICE_ALERT") {
    const what = String(p.routeOrHotel || "");
    const cur = Number(p.currentPrice);
    const tgt = Number(p.targetPrice);
    if (!what || !Number.isFinite(cur) || !Number.isFinite(tgt)) return null;
    return {
      subject: `[${brand}] 목표가 도달 — ${what} ${cur.toLocaleString("ko-KR")}원`,
      html: `<p>${esc(what)} 상품이 목표가(${tgt.toLocaleString("ko-KR")}원) 이하로 내려갔어요. 현재가: <b>${cur.toLocaleString("ko-KR")}원</b></p><p>가격은 변동될 수 있으니 서둘러 예약하세요.</p>`,
    };
  }
  if (template === "BOOKING_CONFIRMED" || template === "FLIGHT_TICKETED") {
    const num = String(p.bookingNumber || p.bookingId || "");
    if (!num) return null;
    const url = `${site.replace(/\/+$/, "")}/my/bookings`;
    const what = template === "FLIGHT_TICKETED" ? "항공권이 발권됐어요" : "예약이 확정됐어요";
    return {
      subject: `[${brand}] ${what} — ${num}`,
      html: `<p>${esc(what)}. 예약번호: <b>${esc(num)}</b></p><p><a href="${esc(url)}">내 예약에서 바우처 확인하기</a></p>`,
    };
  }
  if (template === "PAYMENT_COMPLETED") {
    const num = String(p.bookingNumber || p.bookingId || "");
    const amt = Number(p.amountMinor);
    if (!num || !Number.isSafeInteger(amt)) return null;
    const url = `${site.replace(/\/+$/, "")}/my/bookings`;
    return {
      subject: `[${brand}] 결제가 완료됐어요 — ${num}`,
      html: `<p>${amt.toLocaleString("ko-KR")}원 결제가 완료됐어요. 예약번호: <b>${esc(num)}</b></p><p>공급사 확정이 끝나면 바우처를 보내드려요. <a href="${esc(url)}">내 예약 보기</a></p>`,
    };
  }
  if (template === "BOOKING_CANCELLED") {
    const num = String(p.bookingNumber || p.bookingId || "");
    if (!num) return null;
    const url = `${site.replace(/\/+$/, "")}/my/bookings`;
    return {
      subject: `[${brand}] 예약이 취소됐어요 — ${num}`,
      html: `<p>예약번호 <b>${esc(num)}</b> 예약이 취소됐어요.</p><p>환불 대상 금액이 있으면 취소·환불 규정에 따라 원래 결제 수단으로 돌려드려요. <a href="${esc(url)}">내 예약 보기</a></p>`,
    };
  }
  if (template === "REFUND_COMPLETED") {
    const num = String(p.bookingNumber || p.bookingId || "");
    const amt = Number(p.amountMinor);
    if (!num || !Number.isSafeInteger(amt)) return null;
    const url = `${site.replace(/\/+$/, "")}/my/bookings`;
    return {
      subject: `[${brand}] ${amt.toLocaleString("ko-KR")}원 환불이 완료됐어요 — ${num}`,
      html: `<p>예약번호 <b>${esc(num)}</b>에 대해 <b>${amt.toLocaleString("ko-KR")}원</b>을 환불했어요. 카드사·은행 사정에 따라 입금까지 며칠 걸릴 수 있어요.</p><p><a href="${esc(url)}">내 예약 보기</a></p>`,
    };
  }
  if (template === "SUPPLIER_REJECTED") {
    const num = String(p.bookingNumber || p.bookingId || "");
    if (!num) return null;
    const url = `${site.replace(/\/+$/, "")}/my/bookings`;
    return {
      subject: `[${brand}] 공급사가 예약을 받지 못했어요 — ${num}`,
      html: `<p>예약번호 <b>${esc(num)}</b>에 대해 공급사가 예약을 확정하지 못했어요. 결제한 금액은 전액 환불해 드려요.</p><p><a href="${esc(url)}">내 예약 보기</a></p>`,
    };
  }
  return null;
}

/** Send one email via Resend. Returns false on any failure; never throws. */
export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
  const key = (env.RESEND_API_KEY || "").trim();
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: (env.EMAIL_FROM || "").trim() || "getfortrip <noreply@getfortrip.com>", to, subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const MAX_ATTEMPTS = 5;

/**
 * Deliver queued EMAIL rows. Without a provider key every row is left queued
 * and reported as pending — callers (cron, admin) can see the backlog.
 */
export async function flushOutbox(env: Env, limit?: number): Promise<{ sent: number; failed: number; pending: number }> {
  // C4: 50 rows per 5-minute cron = ~600/hr. Override with OUTBOX_BATCH_LIMIT
  // (capped at 200: each send is a live Resend call inside one cron run).
  const batch = limit ?? Math.min(200, Math.max(1, Number(env.OUTBOX_BATCH_LIMIT) || 50));
  limit = batch;
  const rows = await env.DB.prepare(
    "SELECT id, recipient, template, payload_json, attempts FROM notification_outbox WHERE channel = 'EMAIL' AND status IN ('PENDING', 'BLOCKED_NO_PROVIDER') AND attempts < ? ORDER BY created_at LIMIT ?",
  ).bind(MAX_ATTEMPTS, limit).all<any>();
  const queued = rows.results || [];
  if (!isEmailConfigured(env)) return { sent: 0, failed: 0, pending: queued.length };
  const site = env.PUBLIC_SITE_URL || "https://getfortrip.com";
  let sent = 0;
  let failed = 0;
  for (const r of queued) {
    const rendered = renderOutboxEmail(r.template, r.payload_json, site);
    if (!rendered) {
      await env.DB.prepare("UPDATE notification_outbox SET status = 'FAILED', attempts = attempts + 1 WHERE id = ?").bind(r.id).run();
      failed++;
      continue;
    }
    if (await sendEmail(env, r.recipient, rendered.subject, rendered.html)) {
      await env.DB.prepare("UPDATE notification_outbox SET status = 'SENT', attempts = attempts + 1 WHERE id = ?").bind(r.id).run();
      sent++;
    } else {
      const attempts = Number(r.attempts || 0) + 1;
      await env.DB.prepare("UPDATE notification_outbox SET status = ?, attempts = ? WHERE id = ?")
        .bind(attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", attempts, r.id).run();
      failed++;
    }
  }
  return { sent, failed, pending: 0 };
}

/**
 * Enqueue helper for writers; keeps the insert shape in one place. Only EMAIL
 * delivers today — SMS/KAKAO have no sender, so they fail closed here instead
 * of queueing rows nobody will ever send (C3).
 */
export function outboxInsert(db: D1Database, channel: "EMAIL" | "SMS" | "KAKAO", recipient: string, template: string, payload: unknown): D1PreparedStatement {
  if (channel !== "EMAIL") throw new Error(`${channel} delivery is not implemented; no sender is configured.`);
  return db.prepare("INSERT INTO notification_outbox (id, channel, recipient, template, payload_json, status) VALUES (?, ?, ?, ?, ?, 'PENDING')")
    .bind(newId("ntf"), channel, recipient, template, JSON.stringify(payload));
}
