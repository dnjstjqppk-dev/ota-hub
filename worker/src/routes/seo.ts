import type { Env } from "../env.ts";
import { SECURITY_HEADERS } from "../lib/http.ts";

const STATIC_PATHS = ["", "/hotels", "/flights", "/trains", "/cars", "/transfers", "/things-to-do", "/packages", "/deals", "/help", "/faq", "/about"];

/** Catalog table -> public detail route. */
const DETAIL_ROUTES: ReadonlyArray<readonly [table: string, prefix: string]> = [
  ["hotels", "/hotels/detail/"],
  ["flights", "/flights/detail/"],
  ["trains", "/trains/detail/"],
  ["cars", "/cars/detail/"],
  ["transfers", "/transfers/detail/"],
  ["activities", "/things-to-do/detail/"],
  ["packages", "/packages/detail/"],
];

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function buildSitemap(site: string, paths: string[]): string {
  const base = site.replace(/\/+$/, "");
  const urls = [...new Set(paths)].map((p) => `  <url><loc>${xmlEscape(base + p)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}

/** Sitemap of the landing pages plus every product detail page currently in the catalog. */
export async function sitemap(env: Env): Promise<Response> {
  const site = env.PUBLIC_SITE_URL || "https://getfortrip.com";
  const paths = [...STATIC_PATHS];
  for (const [table, prefix] of DETAIL_ROUTES) {
    try {
      const rows = await env.DB.prepare(`SELECT id FROM ${table} ORDER BY id LIMIT 5000`).all<{ id: string }>();
      for (const r of rows.results || []) if (/^[A-Za-z0-9_-]{1,100}$/.test(r.id)) paths.push(prefix + r.id);
    } catch {
      // A missing table must not take the whole sitemap down.
    }
  }
  return new Response(buildSitemap(site, paths), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600", ...SECURITY_HEADERS },
  });
}
