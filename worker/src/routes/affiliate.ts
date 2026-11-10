/**
 * External-link (affiliate) products. These are NOT GetForTrip bookings: the
 * customer pays on the partner's site. Conversions are recorded for commission
 * reporting only and never change the state of any GetForTrip booking.
 */
import type { Env } from "../env.ts";
import { HttpError, SECURITY_HEADERS, json } from "../lib/http.ts";
import { constantTimeEqual, hmacSha256Hex, newId } from "../lib/crypto.ts";

export async function handleAffiliate(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;

  if (path.startsWith("/out/") || path.startsWith("/api/v1/out/")) {
    const seg = path.replace("/api/v1", "").split("/").filter(Boolean);
    const partner = (seg[1] || "").toLowerCase();
    const itemId = (seg[2] || "").slice(0, 100);
    const cfg = await env.DB.prepare("SELECT partner_id, deep_link_template, is_active FROM affiliate_partners_config WHERE partner_id = ?").bind(partner).first<any>();
    if (!cfg || cfg.is_active !== 1 || !/^https:\/\//.test(cfg.deep_link_template || "")) {
      throw new HttpError(404, "PARTNER_LINK_UNAVAILABLE", "해당 제휴 링크는 현재 제공되지 않습니다.");
    }
    const clickId = newId("clk");
    const target = String(cfg.deep_link_template).replace("{click_id}", encodeURIComponent(clickId)).replace("{item_id}", encodeURIComponent(itemId));
    await env.DB.prepare(
      "INSERT INTO affiliate_clicks (click_id, domain_type, item_id, partner_name, outlink_url, sub_id, ip_address, user_agent, referrer, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'REDIRECTED')",
    ).bind(clickId, (url.searchParams.get("domain") || "UNKNOWN").toUpperCase().slice(0, 20), itemId, partner, target, (url.searchParams.get("sub_id") || "web").slice(0, 50), "", (request.headers.get("User-Agent") || "").slice(0, 200), (request.headers.get("Referer") || "").slice(0, 300)).run();
    return new Response(null, { status: 302, headers: { Location: target, ...SECURITY_HEADERS } });
  }

  if (path === "/api/v1/webhooks/postback" && request.method === "POST") {
    const raw = await request.text();
    const sig = request.headers.get("X-Signature") || "";
    const ts = Number(request.headers.get("X-Timestamp") || "");
    if (!sig || !Number.isInteger(ts)) throw new HttpError(400, "MISSING_SIGNATURE", "X-Signature / X-Timestamp 헤더가 필요합니다.");
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) throw new HttpError(403, "STALE_TIMESTAMP", "타임스탬프가 허용 범위를 벗어났습니다.");
    let p: any;
    try {
      p = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "MALFORMED_JSON", "본문이 JSON이 아닙니다.");
    }
    const partner = String(p.partner || "").toLowerCase();
    const cfg = await env.DB.prepare("SELECT secret_key, is_active FROM affiliate_partners_config WHERE partner_id = ?").bind(partner).first<any>();
    // No hardcoded fallback secrets: an unconfigured partner can never post conversions.
    if (!cfg || cfg.is_active !== 1 || !cfg.secret_key || String(cfg.secret_key).length < 24) throw new HttpError(404, "UNKNOWN_PARTNER", "등록되지 않은 제휴사입니다.");
    if (!constantTimeEqual(sig, await hmacSha256Hex(cfg.secret_key, `${ts}.${raw}`))) throw new HttpError(403, "INVALID_SIGNATURE", "서명 검증 실패");
    const clickId = String(p.click_id || "");
    const orderId = String(p.order_id || "");
    const amount = Number(p.amount);
    if (!clickId || !orderId || !Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "INVALID_PAYLOAD", "click_id, order_id, amount가 필요합니다.");
    // #21: INSERT OR IGNORE on idx_affiliate_conv_once — concurrent postbacks
    // for one order collapse to a single row instead of double commission.
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO affiliate_conversions (id, click_id, partner_name, order_id, amount, currency, commission, status, signature, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'REPORTED', ?, ?)`,
    ).bind(newId("cnv"), clickId, partner, orderId, amount, String(p.currency || "KRW").slice(0, 3), Number(p.commission) || 0, sig, raw.slice(0, 4000)).run();
    if (r.meta.changes) await env.DB.prepare("UPDATE affiliate_clicks SET status = 'CONVERTED' WHERE click_id = ?").bind(clickId).run();
    return json({ success: true, duplicate: !r.meta.changes });
  }
  return null;
}
