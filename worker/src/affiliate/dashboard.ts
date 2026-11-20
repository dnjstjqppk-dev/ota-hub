/**
 * Affiliate CVR / settlement dashboard (Phase 3, read-only).
 *
 * Attribution follows the click: a conversion counts for the click's partner,
 * domain and day. Money mixes currencies, so KRW rollups join the real
 * fx_rates table (unrated currencies list separately, never guessed).
 * REPORTED commission = expected settlement; CONFIRMED = settled.
 */
import type { Env } from "../env.ts";
import { HttpError } from "../lib/http.ts";

export interface DashboardFilters { from: string; to: string; partner: string; domain: string }
export interface FunnelRow { key: string; clicks: number; conversions: number; cvr: number; gmvKrwEst: number; expectedKrwEst: number; confirmedKrwEst: number }

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KRW = (c: string) => `COALESCE(SUM(CASE WHEN f.currency IS NULL THEN 0 ELSE ${c} * f.rate_to_krw END), 0)`;

function where(f: DashboardFilters): { sql: string; args: unknown[] } {
  for (const d of [f.from, f.to]) if (d && !DAY.test(d)) throw new HttpError(400, "INVALID_DATE", "from/to는 YYYY-MM-DD 형식이어야 합니다.");
  const c: string[] = [];
  const a: unknown[] = [];
  if (f.from) { c.push("date(k.created_at) >= date(?)"); a.push(f.from); }
  if (f.to) { c.push("date(k.created_at) <= date(?)"); a.push(f.to); }
  if (f.partner) { c.push("k.partner_name = ?"); a.push(f.partner.toLowerCase()); }
  if (f.domain) { c.push("k.domain_type = ?"); a.push(f.domain.toUpperCase()); }
  return { sql: c.length ? `WHERE ${c.join(" AND ")}` : "", args: a };
}

async function funnel(env: Env, keySql: string, f: DashboardFilters): Promise<FunnelRow[]> {
  const w = where(f);
  const r = await env.DB.prepare(
    `SELECT ${keySql} AS key, COUNT(DISTINCT k.click_id) AS clicks, COUNT(DISTINCT c.id) AS conversions,
     ${KRW("c.amount")} AS gmv, ${KRW("CASE WHEN c.status = 'REPORTED' THEN c.commission ELSE 0 END")} AS exp,
     ${KRW("CASE WHEN c.status = 'CONFIRMED' THEN c.commission ELSE 0 END")} AS ok
     FROM affiliate_clicks k LEFT JOIN affiliate_conversions c ON c.click_id = k.click_id
     LEFT JOIN fx_rates f ON f.currency = c.currency ${w.sql} GROUP BY key ORDER BY clicks DESC LIMIT 100`,
  ).bind(...w.args).all<any>();
  return (r.results || []).map((x) => ({
    key: String(x.key), clicks: Number(x.clicks) || 0, conversions: Number(x.conversions) || 0,
    cvr: x.clicks ? Number((Number(x.conversions) / Number(x.clicks)).toFixed(4)) : 0,
    gmvKrwEst: Math.round(Number(x.gmv) || 0), expectedKrwEst: Math.round(Number(x.exp) || 0), confirmedKrwEst: Math.round(Number(x.ok) || 0),
  }));
}

/** Totals + per-partner / per-domain funnels + unrated-currency honesty list. */
export async function affiliateDashboard(env: Env, f: DashboardFilters) {
  const w = where(f);
  const unrated = await env.DB.prepare(
    `SELECT DISTINCT c.currency AS cur FROM affiliate_conversions c JOIN affiliate_clicks k ON k.click_id = c.click_id
     LEFT JOIN fx_rates fx ON fx.currency = c.currency WHERE fx.currency IS NULL ${w.sql ? `AND ${w.sql.slice(6)}` : ""} LIMIT 20`,
  ).bind(...w.args).all<{ cur: string }>();
  const [total] = await funnel(env, "'all'", f);
  return {
    filters: f, totals: total || null,
    byPartner: await funnel(env, "k.partner_name", f),
    byDomain: await funnel(env, "k.domain_type", f),
    unratedCurrencies: (unrated.results || []).map((x) => x.cur),
  };
}
