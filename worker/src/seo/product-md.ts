import type { Env } from "../env.ts";
import { TAX_BPS, type Domain } from "../domain/pricing.ts";
import { json, SECURITY_HEADERS } from "../lib/http.ts";
import { bookabilityOf, loadSupplier } from "../services/catalog.ts";
import { productPageUrl } from "./indexnow.ts";

/**
 * S4: per-product markdown fact sheet for LLMs (`GET /api/v1/seo/md/{domain}/{id}`).
 * Every line comes from catalogue rows the detail APIs already serve — a missing
 * field drops its line, never a placeholder. Inactive or unknown products 404.
 */

const TABLES: Record<Domain, string> = {
  HOTEL: "hotels", FLIGHT: "flights", TRAIN: "trains", CAR: "cars",
  TRANSFER: "transfers", ACTIVITY: "activities", PACKAGE: "packages",
};

const FALLBACK_SUPPLIER: Record<Domain, string> = {
  HOTEL: "ptn_htl_01", FLIGHT: "ptn_flt_01", TRAIN: "unassigned_train", CAR: "ptn_car_01",
  TRANSFER: "unassigned_transfer", ACTIVITY: "ptn_tour_01", PACKAGE: "unassigned_package",
};

/** Price unit qualifiers, mirroring the detail booking cards and pricing labels. */
const UNITS: Record<Domain, string> = {
  HOTEL: "1박", FLIGHT: "1인", TRAIN: "1인", CAR: "1일",
  TRANSFER: "차량 1대 편도", ACTIVITY: "1인", PACKAGE: "1인",
};

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const oneLine = (v: unknown): string => (typeof v === "string" ? v : String(v ?? "")).replace(/\s+/g, " ").trim();
const str = (v: unknown): string | null => {
  const s = oneLine(v);
  return s ? s : null;
};
const joinRoute = (...parts: unknown[]): string | null => {
  const s = parts.map((p) => oneLine(p)).filter(Boolean).join(" → ");
  return s || null;
};
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const fmtKrw = (n: number): string => `${n.toLocaleString("ko-KR")}원`;

function nameOf(domain: Domain, r: any): string {
  switch (domain) {
    case "HOTEL": return str(r.name_ko) || str(r.name_en) || str(r.name) || String(r.id);
    case "FLIGHT": return joinRoute(r.airline_name, r.flight_number) || String(r.id);
    case "TRAIN": return joinRoute(r.train_type, r.train_number) || String(r.id);
    case "CAR": return joinRoute(r.company_name, r.vehicle_model) || String(r.id);
    case "TRANSFER": return str(r.service_title) || String(r.id);
    case "ACTIVITY": return str(r.title) || String(r.id);
    case "PACKAGE": return str(r.title) || String(r.id);
  }
}

function cityOf(domain: Domain, r: any): string | null {
  switch (domain) {
    case "HOTEL": return str(r.city);
    case "FLIGHT": return joinRoute(r.departure_city, r.arrival_city) || joinRoute(r.departure_airport, r.arrival_airport);
    case "TRAIN": return joinRoute(r.departure_station, r.arrival_station);
    case "CAR": return str(r.pickup_location);
    case "TRANSFER": return joinRoute(r.airport_code, r.destination_area) || str(r.destination_area);
    case "ACTIVITY": return str(r.city);
    case "PACKAGE": return str(r.destination_city);
  }
}

function priceOf(domain: Domain, r: any): number | null {
  switch (domain) {
    case "HOTEL": return num(r.base_price_krw);
    case "FLIGHT": return num(r.base_price_krw);
    case "TRAIN": return num(r.price_krw);
    case "CAR": return num(r.daily_price_krw);
    case "TRANSFER": return num(r.price_krw);
    case "ACTIVITY": return num(r.price_krw);
    case "PACKAGE": return num(r.bundle_price_krw ?? r.total_package_krw);
  }
}

async function cancelOf(env: Env, domain: Domain, itemId: string): Promise<string | null> {
  const p = await env.DB.prepare(
    "SELECT free_cancel_hours, tiers_json, note FROM product_policies WHERE domain_type = ? AND item_id = ?",
  ).bind(domain, itemId).first<any>().catch(() => null);
  if (!p) return null;
  const parts: string[] = [];
  if (p.free_cancel_hours !== null && p.free_cancel_hours !== undefined && Number.isFinite(Number(p.free_cancel_hours))) {
    parts.push(`${Number(p.free_cancel_hours)}시간 전까지 무료 취소`);
  }
  try {
    const tiers = JSON.parse(p.tiers_json || "[]");
    if (Array.isArray(tiers)) {
      for (const t of tiers.slice(0, 3)) {
        const hb = t?.hours_before, rb = t?.refund_bps;
        if (hb !== null && hb !== undefined && rb !== null && rb !== undefined && Number.isFinite(Number(hb)) && Number.isFinite(Number(rb))) {
          parts.push(`${Number(hb)}시간 전 ${Number(rb) / 100}% 환불`);
        }
      }
    }
  } catch { /* malformed tiers never break the sheet */ }
  const note = str(p.note);
  if (note) parts.push(note);
  return parts.length ? parts.join(" / ") : null;
}

function ratingOf(r: any): string | null {
  // Number(null) is 0, so null/blank scores must be rejected explicitly.
  if (r.review_score === null || r.review_score === undefined || r.review_score === "") return null;
  const score = Number(r.review_score);
  const count = Number(r.review_count);
  if (!Number.isFinite(score) || !Number.isFinite(count) || count <= 0) return null;
  return `${score.toFixed(1)} (리뷰 ${Math.floor(count)}건)`;
}

async function modeOf(env: Env, domain: Domain, r: any): Promise<string> {
  const supplier = await loadSupplier(env, r.partner_id || FALLBACK_SUPPLIER[domain]).catch(() => null);
  if (supplier?.transaction_model === "AFFILIATE") return "제휴";
  return bookabilityOf(env, supplier).bookable ? "직판" : "구매 불가";
}

export async function productMd(env: Env, domainRaw: string, id: string): Promise<Response> {
  const domain = (domainRaw || "").toUpperCase() as Domain;
  const notFound = () => json({ success: false, error: "상품을 찾을 수 없습니다.", code: "NOT_FOUND" }, 404);
  if (!TABLES[domain] || !ID_RE.test(id)) return notFound();
  const row: any = await env.DB.prepare(`SELECT * FROM ${TABLES[domain]} WHERE id = ?`).bind(id).first().catch(() => null);
  if (!row || row.is_active === 0) return notFound();

  const lines = [`- 상품명: ${oneLine(nameOf(domain, row))}`];
  const city = cityOf(domain, row);
  if (city) lines.push(`- 도시: ${city}`);
  const price = priceOf(domain, row);
  if (price !== null) {
    const taxNote = TAX_BPS[domain] > 0 ? "세금 별도" : "추가 세금 없음";
    lines.push(`- 가격: ${fmtKrw(price)} (KRW, ${UNITS[domain]} 기준, ${taxNote})`);
  }
  lines.push(`- 판매 방식: ${await modeOf(env, domain, row)}`);
  const cancel = await cancelOf(env, domain, id);
  if (cancel) lines.push(`- 취소 규정: ${cancel}`);
  const rating = ratingOf(row);
  if (rating) lines.push(`- 평점: ${rating}`);
  lines.push(`- 정규 URL: ${productPageUrl(env, domain, id)}`);
  const updated = str(row.updated_at);
  if (updated) lines.push(`- 최종 갱신: ${updated}`);
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600", ...SECURITY_HEADERS },
  });
}
