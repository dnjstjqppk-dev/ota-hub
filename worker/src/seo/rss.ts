import type { Env } from "../env.ts";
import { SECURITY_HEADERS } from "../lib/http.ts";

/**
 * S9: Naver-facing RSS of the newest products (real catalog rows only).
 * Latest 50 across all domains by created_at; rows without a valid date are
 * skipped (a recency feed cannot honestly order them). Package rows whose
 * original price exceeds the sale price carry the discount inline.
 */

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const siteOf = (env: Env) => (env.PUBLIC_SITE_URL || "https://getfortrip.com").replace(/\/+$/, "");

interface FeedRow {
  id: string;
  title: string;
  city: string | null;
  price: number | null;
  origPrice: number | null;
  created: string;
}

interface DomainFeed {
  domain: string;
  prefix: string;
  sql: string;
  map: (r: any) => Omit<FeedRow, "created"> | null;
}

const join = (...parts: unknown[]): string => parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(" ");
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const fmtKrw = (n: number): string => `${n.toLocaleString("ko-KR")}원`;

const DOMAINS: DomainFeed[] = [
  {
    domain: "HOTEL", prefix: "/hotels",
    sql: "SELECT id, name_ko, name_en, city, base_price_krw, created_at FROM hotels WHERE is_active = 1 AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 50",
    map: (r) => ({ id: r.id, title: join(r.name_ko, r.name_en) || String(r.id), city: join(r.city) || null, price: num(r.base_price_krw), origPrice: null }),
  },
  {
    domain: "FLIGHT", prefix: "/flights",
    sql: "SELECT id, airline_name, flight_number, departure_city, arrival_city, base_price_krw, created_at FROM flights WHERE is_active = 1 AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 50",
    map: (r) => {
      const route = [r.departure_city, r.arrival_city].map((c) => String(c ?? "").trim()).filter(Boolean).join("→");
      return { id: r.id, title: join(r.airline_name, r.flight_number) || String(r.id), city: route || null, price: num(r.base_price_krw), origPrice: null };
    },
  },
  {
    domain: "TRAIN", prefix: "/trains",
    sql: "SELECT id, train_type, train_number, departure_station, arrival_station, price_krw, created_at FROM trains WHERE is_active = 1 AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 50",
    map: (r) => {
      const route = [r.departure_station, r.arrival_station].map((c) => String(c ?? "").trim()).filter(Boolean).join("→");
      return { id: r.id, title: join(r.train_type, r.train_number) || String(r.id), city: route || null, price: num(r.price_krw), origPrice: null };
    },
  },
  {
    domain: "CAR", prefix: "/cars",
    sql: "SELECT id, company_name, vehicle_model, pickup_location, daily_price_krw, created_at FROM cars WHERE is_active = 1 AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 50",
    map: (r) => ({ id: r.id, title: join(r.company_name, r.vehicle_model) || String(r.id), city: join(r.pickup_location) || null, price: num(r.daily_price_krw), origPrice: null }),
  },
  {
    domain: "TRANSFER", prefix: "/transfers",
    sql: "SELECT id, service_title, destination_area, price_krw, created_at FROM transfers WHERE is_active = 1 AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 50",
    map: (r) => ({ id: r.id, title: join(r.service_title) || String(r.id), city: join(r.destination_area) || null, price: num(r.price_krw), origPrice: null }),
  },
  {
    domain: "ACTIVITY", prefix: "/things-to-do",
    sql: "SELECT id, title, city, price_krw, created_at FROM activities WHERE is_active = 1 AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 50",
    map: (r) => ({ id: r.id, title: join(r.title) || String(r.id), city: join(r.city) || null, price: num(r.price_krw), origPrice: null }),
  },
  {
    domain: "PACKAGE", prefix: "/packages",
    sql: "SELECT id, title, destination_city, total_package_krw, total_original_krw, created_at FROM packages WHERE is_active = 1 AND created_at IS NOT NULL ORDER BY created_at DESC LIMIT 50",
    map: (r) => ({ id: r.id, title: join(r.title) || String(r.id), city: join(r.destination_city) || null, price: num(r.total_package_krw), origPrice: num(r.total_original_krw) }),
  },
];

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

export interface RssItem { title: string; link: string; pubDate: string; description: string; }

export async function collectRssItems(env: Env): Promise<RssItem[]> {
  const site = siteOf(env);
  const rows: { domain: DomainFeed; row: any }[] = [];
  for (const d of DOMAINS) {
    try {
      const res = await env.DB.prepare(d.sql).all();
      for (const r of (res.results || []) as any[]) rows.push({ domain: d, row: r });
    } catch { /* missing table: skip the domain, keep the rest */ }
  }
  const items: (RssItem & { ts: number })[] = [];
  for (const { domain: d, row: r } of rows) {
    if (typeof r.id !== "string" || !ID_RE.test(r.id)) continue;
    const ts = Date.parse(String(r.created_at || ""));
    if (!Number.isFinite(ts)) continue;
    const m = d.map(r);
    if (!m) continue;
    const link = `${site}${d.prefix}/detail/${r.id}`;
    const bits = [m.city, m.price !== null ? fmtKrw(m.price) : ""].filter(Boolean);
    if (m.origPrice !== null && m.price !== null && m.origPrice > m.price) {
      bits.push(`정가 ${fmtKrw(m.origPrice)} 특가`);
    }
    items.push({ title: m.title, link, pubDate: new Date(ts).toUTCString(), description: bits.join(" · ") || m.title, ts });
  }
  items.sort((a, b) => b.ts - a.ts);
  return items.slice(0, 50).map(({ title, link, pubDate, description }) => ({ title, link, pubDate, description }));
}

export function buildRss(site: string, items: RssItem[], now: Date = new Date()): string {
  const base = site.replace(/\/+$/, "");
  const els = items.map((it) =>
    `    <item><title>${xmlEscape(it.title)}</title><link>${xmlEscape(it.link)}</link><guid>${xmlEscape(it.link)}</guid><pubDate>${xmlEscape(it.pubDate)}</pubDate><description>${xmlEscape(it.description)}</description></item>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>getfortrip 특가·신규 상품</title>\n    <link>${xmlEscape(base)}</link>\n    <description>getfortrip에 새로 등록된 상품과 특가 소식입니다 (최신 50개).</description>\n    <language>ko</language>\n    <lastBuildDate>${xmlEscape(now.toUTCString())}</lastBuildDate>\n${els.join("\n")}\n  </channel>\n</rss>`;
}

/** GET /rss.xml — newest-products feed (served from apex once the zone route lands). */
export async function rssFeed(env: Env): Promise<Response> {
  const items = await collectRssItems(env).catch(() => []);
  return new Response(buildRss(siteOf(env), items), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600", ...SECURITY_HEADERS },
  });
}
