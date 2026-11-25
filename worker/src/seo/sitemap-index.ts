import type { Env } from "../env.ts";
import { SECURITY_HEADERS } from "../lib/http.ts";

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const siteOf = (env: Env) => (env.PUBLIC_SITE_URL || "https://getfortrip.com").replace(/\/+$/, "");

/** Crawlable landing/policy pages. Private flows (/my /checkout /booking /login) stay out. */
export const STATIC_SITEMAP_PATHS = ["", "/hotels", "/flights", "/trains", "/cars", "/transfers", "/things-to-do", "/packages", "/esim", "/insurance", "/deals", "/trip-best", "/help", "/faq", "/about", "/terms", "/privacy", "/refund-policy"];

export interface DomainSitemap { slug: string; prefix: string; table: string; }

export const DOMAIN_SITEMAPS: DomainSitemap[] = [
  { slug: "hotels", prefix: "/hotels/detail/", table: "hotels" },
  { slug: "flights", prefix: "/flights/detail/", table: "flights" },
  { slug: "trains", prefix: "/trains/detail/", table: "trains" },
  { slug: "cars", prefix: "/cars/detail/", table: "cars" },
  { slug: "transfers", prefix: "/transfers/detail/", table: "transfers" },
  { slug: "things-to-do", prefix: "/things-to-do/detail/", table: "activities" },
  { slug: "packages", prefix: "/packages/detail/", table: "packages" },
];

export function buildSitemapIndex(site: string, names: string[], lastmod: string): string {
  const base = site.replace(/\/+$/, "");
  const items = names.map((n) => `  <sitemap><loc>${xmlEscape(`${base}/${n}`)}</loc><lastmod>${lastmod}</lastmod></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>`;
}

const HREF_LANGS = ["ko", "en", "ja", "zh"] as const;

/** S8: locale alternates per URL (ko has no prefix; x-default points at the ko URL). */
function hreflangLinks(base: string, path: string): string {
  const href = (prefix: string) => xmlEscape(`${base}${prefix}${path}`);
  return [`<xhtml:link rel="alternate" hreflang="x-default" href="${href("")}"/>`,
    `<xhtml:link rel="alternate" hreflang="ko" href="${href("")}"/>`,
    ...HREF_LANGS.slice(1).map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${href(`/${l}`)}"/>`)].join("");
}

const URLSET_OPEN = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`;

export function buildUrlset(site: string, paths: string[], lastmod?: string): string {
  const base = site.replace(/\/+$/, "");
  const lm = lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : "";
  const urls = [...new Set(paths)].map((p) => `  <url><loc>${xmlEscape(base + p)}</loc>${lm}${hreflangLinks(base, p)}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${URLSET_OPEN}\n${urls.join("\n")}\n</urlset>`;
}

/** S8: domain sitemap with per-product lastmod (absent when the row has no updated_at). */
export function buildProductUrlset(site: string, entries: { path: string; updated: string | null }[]): string {
  const base = site.replace(/\/+$/, "");
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const e of entries) {
    if (seen.has(e.path)) continue;
    seen.add(e.path);
    urls.push(`  <url><loc>${xmlEscape(base + e.path)}</loc>${e.updated ? `<lastmod>${xmlEscape(e.updated)}</lastmod>` : ""}${hreflangLinks(base, e.path)}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${URLSET_OPEN}\n${urls.join("\n")}\n</urlset>`;
}

async function domainPaths(env: Env, d: DomainSitemap): Promise<{ path: string; updated: string | null }[]> {
  const idOk = (id: unknown) => typeof id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(id);
  const toDate = (v: unknown): string | null => {
    const s = String(v || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };
  try {
    const rows = await env.DB.prepare(`SELECT id, updated_at AS u FROM ${d.table} WHERE is_active = 1 ORDER BY id LIMIT 5000`).all();
    return (rows.results || []).filter((r: any) => idOk(r.id)).map((r: any) => ({ path: `${d.prefix}${r.id}`, updated: toDate(r.u) }));
  } catch { /* pre-0059 schema: retry without the column rather than dropping the domain */ }
  try {
    const rows = await env.DB.prepare(`SELECT id FROM ${d.table} WHERE is_active = 1 ORDER BY id LIMIT 5000`).all();
    return (rows.results || []).filter((r: any) => idOk(r.id)).map((r: any) => ({ path: `${d.prefix}${r.id}`, updated: null }));
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
  return xmlRes(buildProductUrlset(siteOf(env), await domainPaths(env, d)));
}
