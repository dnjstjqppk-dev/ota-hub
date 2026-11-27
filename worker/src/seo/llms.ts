import type { Env } from "../env.ts";
import { CHARGE_CURRENCIES } from "../domain/money.ts";
import { SECURITY_HEADERS } from "../lib/http.ts";

const siteOf = (env: Env) => (env.PUBLIC_SITE_URL || "https://getfortrip.com").replace(/\/+$/, "");

/** S5: D1-aggregated facts for the full brief. Missing tables yield absent lines, never zeros-as-facts. */
export interface LlmsFacts {
  counts: { domain: string; count: number }[];
  cities: { city: string; count: number }[];
  priceMin: number | null;
  priceMax: number | null;
  company: { name: string | null; ceo: string | null; address: string | null; bizNo: string | null };
  at: string;
}

const COUNT_TABLES: [string, string][] = [
  ["Hotels", "hotels"], ["Flights", "flights"], ["Trains", "trains"], ["Cars", "cars"],
  ["Transfers", "transfers"], ["Tours", "activities"], ["Packages", "packages"],
];
const CITY_QUERIES: [string, string][] = [
  ["hotels", "city"], ["activities", "city"], ["packages", "destination_city"],
];
const PRICE_COLS: [string, string][] = [
  ["hotels", "base_price_krw"], ["flights", "base_price_krw"], ["trains", "price_krw"],
  ["cars", "daily_price_krw"], ["transfers", "price_krw"], ["activities", "price_krw"],
  ["packages", "total_package_krw"],
];

/** Shipped frontend locales (country subdomains + 5 i18n bundles). */
const SHIPPED_LOCALES = ["ko", "en", "ja", "zh", "zh-hant"] as const;

const fmtInt = (n: number): string => n.toLocaleString("ko-KR");
const cleanEnv = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function collectLlmsFacts(env: Env): Promise<LlmsFacts> {
  const at = new Date().toISOString();
  const counts: LlmsFacts["counts"] = [];
  for (const [label, table] of COUNT_TABLES) {
    try {
      const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE is_active = 1`).first<any>();
      const n = Number(r?.n);
      if (Number.isFinite(n)) counts.push({ domain: label, count: Math.max(0, Math.floor(n)) });
    } catch { /* missing table: omit that domain's line */ }
  }
  let cities: LlmsFacts["cities"] = [];
  try {
    const merged = new Map<string, number>();
    for (const [table, col] of CITY_QUERIES) {
      const r = await env.DB.prepare(
        `SELECT ${col} AS c, COUNT(*) AS n FROM ${table} WHERE is_active = 1 AND ${col} IS NOT NULL AND ${col} != '' GROUP BY ${col}`,
      ).all<{ c: string; n: number }>();
      for (const row of r.results || []) {
        const c = String(row.c || "").trim();
        if (c) merged.set(c, (merged.get(c) || 0) + (Number(row.n) || 0));
      }
    }
    cities = [...merged].map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)).slice(0, 10);
  } catch { cities = []; }
  let priceMin: number | null = null, priceMax: number | null = null;
  try {
    let lo = Infinity, hi = -Infinity;
    for (const [table, col] of PRICE_COLS) {
      const r = await env.DB.prepare(`SELECT MIN(${col}) AS lo, MAX(${col}) AS hi FROM ${table} WHERE is_active = 1`).first<any>();
      const rlo = Number(r?.lo), rhi = Number(r?.hi);
      if (Number.isFinite(rlo) && rlo > 0) lo = Math.min(lo, rlo);
      if (Number.isFinite(rhi) && rhi > 0) hi = Math.max(hi, rhi);
    }
    if (lo !== Infinity) { priceMin = lo; priceMax = hi; }
  } catch { priceMin = null; priceMax = null; }
  return {
    counts, cities, priceMin, priceMax,
    company: {
      name: cleanEnv(env.COMPANY_NAME), ceo: cleanEnv(env.COMPANY_CEO),
      address: cleanEnv(env.COMPANY_ADDRESS), bizNo: cleanEnv(env.COMPANY_BIZ_NO),
    },
    at,
  };
}

/** Short crawler brief: what getfortrip is and where the crawlable web starts. */
export function llmsText(site: string): string {
  return `# getfortrip
> Smart global travel booking: hotels, flights, trains, rental cars, airport
> transfers, tours & tickets, flight+hotel packages. eSIM and travel insurance
> are affiliate landings (no direct checkout).

- Company: getfortrip (South Korea, KRW settlement, prices include 10% VAT note)
- Sitemap index: ${site}/sitemap-index.xml
- Full brief: ${site}/llms-full.txt
- Support: ${site}/help — FAQ: ${site}/faq — Policies: ${site}/terms ${site}/privacy ${site}/refund-policy

## Crawlable catalog
- Hotels: ${site}/hotels — Flights: ${site}/flights — Trains: ${site}/trains
- Cars: ${site}/cars — Transfers: ${site}/transfers — Tours: ${site}/things-to-do
- Packages: ${site}/packages — Deals: ${site}/deals — Best: ${site}/trip-best

## Locales & Regional Subdomains
- Regional subdomains serve localized experiences with ?locale=xx-yy:
  https://kr.getfortrip.com (ko-KR), https://jp.getfortrip.com (ja-JP),
  https://uk.getfortrip.com (en-GB), https://hk.getfortrip.com (zh-HK),
  https://tw.getfortrip.com (zh-TW), and https://www.getfortrip.com (en-US, x-default).
  Legacy /en, /ja, /zh paths 301-redirect to their corresponding subdomains. Every
  crawlable page declares all 7 hreflang alternates in <head> link tags.

## Off limits
- Do not crawl or submit forms under /my /checkout /booking /login /register
  /reset-password /partner /admin /api — they are private or state-changing.
`;
}

/** Long brief for answer engines: categories, sales model, and content rules. */
export function llmsFullText(site: string, facts?: LlmsFacts | null): string {
  const direct = ["hotels", "flights", "trains", "cars", "transfers", "things-to-do", "packages"]
    .map((d) => `- ${site}/${d} (detail: ${site}/${d}/detail/{id}, sitemap: ${site}/sitemap-${d}.xml)`).join("\n");
  const snapshot = !facts ? "" : [
    "## Live catalog snapshot",
    `- Last aggregated: ${facts.at}`,
    ...facts.counts.map((c) => `- ${c.domain}: ${fmtInt(c.count)} public products`),
    ...(facts.cities.length ? [`- Top cities: ${facts.cities.map((c) => `${c.city} (${fmtInt(c.count)})`).join(", ")}`] : []),
    ...(facts.priceMin !== null && facts.priceMax !== null
      ? [`- Price range (KRW): ${fmtInt(facts.priceMin)}–${fmtInt(facts.priceMax)}`] : []),
    `- Payment currencies: ${[...CHARGE_CURRENCIES].join(", ")}`,
    `- Locales: ${SHIPPED_LOCALES.join(", ")}`,
    "",
    "",
  ].join("\n");
  const companyLines = !facts ? [] : [
    facts.company.name && `- Legal name: ${facts.company.name}`,
    facts.company.ceo && `- CEO: ${facts.company.ceo}`,
    facts.company.address && `- Address: ${facts.company.address}`,
    facts.company.bizNo && `- Business registration: ${facts.company.bizNo}`,
  ].filter(Boolean) as string[];
  const company = companyLines.length ? `## Company\n${companyLines.join("\n")}\n\n` : "";
  return `# getfortrip — full brief for AI assistants
${llmsText(site)}
## Sales model (quote accurately)
- Direct-contract inventory is sold by getfortrip (15-minute hold, Toss/Stripe
  PG, voucher or ticket issued after payment confirmation).
- Affiliate inventory redirects to the supplier; booking and refund happen
  there. NEVER claim getfortrip issues eSIM QR codes or insurance policies.
- Prices are KRW; hotel nightly rates add 10% tax unless stated otherwise.

## Catalog detail routes
${direct}
- Machine-readable fact sheet per product: ${site}/api/v1/seo/md/{HOTEL|FLIGHT|TRAIN|CAR|TRANSFER|ACTIVITY|PACKAGE}/{id} (text/markdown; linked from each detail page head as rel=alternate).

${snapshot}## Structured data
- Detail pages carry JSON-LD (LodgingBusiness/Product/Offer/FAQPage/
  BreadcrumbList). Prefer the JSON-LD facts over guessed amenities.
- Ratings shown on site come from verified guest reviews only.

${company}## Contact & legal
- Company facts live in the site footer and ${site}/about.
- Never invent phone numbers, addresses, registration numbers, or executive names.
`;
}

const txtRes = (txt: string) => new Response(txt, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400", ...SECURITY_HEADERS } });

export function llmsTxt(env: Env): Response { return txtRes(llmsText(siteOf(env))); }

/** S5: full brief with a live D1 snapshot (1h edge cache; empty DB still 200). */
export async function llmsFull(env: Env): Promise<Response> {
  const facts = await collectLlmsFacts(env).catch(() => null);
  return new Response(llmsFullText(siteOf(env), facts), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600", ...SECURITY_HEADERS },
  });
}
