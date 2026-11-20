import type { Env } from "../env.ts";
import { SECURITY_HEADERS } from "../lib/http.ts";

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const siteOf = (env: Env) => (env.PUBLIC_SITE_URL || "https://getfortrip.com").replace(/\/+$/, "");

/** Crawlable landing/policy pages. Private flows (/my /checkout /booking /login) stay out. */
export const STATIC_SITEMAP_PATHS = ["", "/hotels", "/flights", "/trains", "/cars", "/transfers", "/things-to-do", "/packages", "/esim", "/insurance", "/deals", "/trip-best", "/help", "/faq", "/about", "/terms", "/privacy", "/refund-policy"];

export interface DomainSitemap { slug: string; prefix: string; sql: string; }

export const DOMAIN_SITEMAPS: DomainSitemap[] = [
  { slug: "hotels", prefix: "/hotels/detail/", sql: "SELECT id FROM hotels WHERE is_active = 1 ORDER BY id LIMIT 5000" },
  { slug: "flights", prefix: "/flights/detail/", sql: "SELECT id FROM flights WHERE is_active = 1 ORDER BY id LIMIT 5000" },
  { slug: "trains", prefix: "/trains/detail/", sql: "SELECT id FROM trains WHERE is_active = 1 ORDER BY id LIMIT 5000" },
  { slug: "cars", prefix: "/cars/detail/", sql: "SELECT id FROM cars WHERE is_active = 1 ORDER BY id LIMIT 5000" },
  { slug: "transfers", prefix: "/transfers/detail/", sql: "SELECT id FROM transfers WHERE is_active = 1 ORDER BY id LIMIT 5000" },
  { slug: "things-to-do", prefix: "/things-to-do/detail/", sql: "SELECT id FROM activities WHERE is_active = 1 ORDER BY id LIMIT 5000" },
  { slug: "packages", prefix: "/packages/detail/", sql: "SELECT id FROM packages WHERE is_active = 1 ORDER BY id LIMIT 5000" },
];

export function buildSitemapIndex(site: string, names: string[], lastmod: string): string {
  const base = site.replace(/\/+$/, "");
  const items = names.map((n) => `  <sitemap><loc>${xmlEscape(`${base}/${n}`)}</loc><lastmod>${lastmod}</lastmod></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>`;
}

export function buildUrlset(site: string, paths: string[], lastmod?: string): string {
  const base = site.replace(/\/+$/, "");
  const lm = lastmod ? `<lastmod>${lastmod}</lastmod>` : "";
  const urls = [...new Set(paths)].map((p) => `  <url><loc>${xmlEscape(base + p)}</loc>${lm}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}

async function domainPaths(env: Env, d: DomainSitemap): Promise<string[]> {
  try {
    const rows = await env.DB.prepare(d.sql).all<{ id: string }>();
    return (rows.results || []).filter((r) => /^[A-Za-z0-9_-]{1,100}$/.test(r.id)).map((r) => d.prefix + r.id);
  } catch { return []; }
}

const xmlRes = (xml: string) => new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600", ...SECURITY_HEADERS } });

/** GET /sitemap-index.xml — static sitemap + one child per catalog domain. */
export async function sitemapIndex(env: Env): Promise<Response> {
  const today = new Date().toISOString().slice(0, 10);
  const names = ["sitemap-static.xml", ...DOMAIN_SITEMAPS.map((d) => `sitemap-${d.slug}.xml`)];
  return xmlRes(buildSitemapIndex(siteOf(env), names, today));
}

/** GET /sitemap-static.xml | /sitemap-<domain>.xml. Returns null for unknown names. */
export async function childSitemap(env: Env, name: string): Promise<Response | null> {
  const today = new Date().toISOString().slice(0, 10);
  if (name === "sitemap-static.xml") return xmlRes(buildUrlset(siteOf(env), STATIC_SITEMAP_PATHS, today));
  const m = /^sitemap-([a-z-]+)\.xml$/.exec(name);
  const d = m && DOMAIN_SITEMAPS.find((x) => x.slug === m[1]);
  if (!d) return null;
  return xmlRes(buildUrlset(siteOf(env), await domainPaths(env, d), today));
}
