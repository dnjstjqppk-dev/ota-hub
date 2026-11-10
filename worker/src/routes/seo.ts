import type { Env } from "../env.ts";
import { SECURITY_HEADERS } from "../lib/http.ts";

const STATIC_PATHS = ["", "/hotels", "/flights", "/trains", "/cars", "/transfers", "/things-to-do", "/packages", "/deals", "/help", "/faq", "/about"];

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export function buildSitemap(site: string, paths: string[]): string {
  const base = site.replace(/\/+$/, "");
  const urls = [...new Set(paths)].map((p) => `  <url><loc>${xmlEscape(base + p)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}

export interface SnapshotProduct {
  domain: string;
  id: string;
  route: string;
  name: string | null;
  city: string | null;
  image: string | null;
  priceKrw: number | null;
  score: number | null;
  reviewCount: number;
}

/**
 * C7: every public product's route + first-paint facts, straight from D1.
 * The build snapshots this into the static bundle (scripts/gen-seo-snapshot.mjs)
 * so each deploy prerenders all currently-public products — no hardcoded IDs.
 * Scores/images are whatever the catalog holds (real reviews + partner uploads
 * after the C8 cleanup); nothing is invented here.
 */
export async function catalogSnapshot(env: Env): Promise<{ routes: string[]; products: SnapshotProduct[] }> {
  const routes: string[] = [];
  const products: SnapshotProduct[] = [];
  const queries: ReadonlyArray<readonly [domain: string, prefix: string, sql: string]> = [
    ["HOTEL", "/hotels/detail/", "SELECT id, name_ko AS name, city, thumbnail_url AS image, base_price_krw AS price, review_score AS score, review_count AS rc FROM hotels WHERE is_active = 1 ORDER BY id LIMIT 5000"],
    ["FLIGHT", "/flights/detail/", "SELECT id, (airline_name || ' ' || flight_number) AS name, departure_city AS city, NULL AS image, base_price_krw AS price, NULL AS score, 0 AS rc FROM flights WHERE is_active = 1 ORDER BY id LIMIT 5000"],
    ["TRAIN", "/trains/detail/", "SELECT id, (train_type || ' ' || train_number) AS name, departure_station AS city, NULL AS image, price_krw AS price, NULL AS score, 0 AS rc FROM trains WHERE is_active = 1 ORDER BY id LIMIT 5000"],
    ["CAR", "/cars/detail/", "SELECT id, vehicle_model AS name, pickup_location AS city, image_url AS image, daily_price_krw AS price, NULL AS score, 0 AS rc FROM cars WHERE is_active = 1 ORDER BY id LIMIT 5000"],
    ["TRANSFER", "/transfers/detail/", "SELECT id, service_title AS name, destination_area AS city, image_url AS image, price_krw AS price, NULL AS score, 0 AS rc FROM transfers WHERE is_active = 1 ORDER BY id LIMIT 5000"],
    ["ACTIVITY", "/things-to-do/detail/", "SELECT id, title AS name, city, thumbnail_url AS image, price_krw AS price, review_score AS score, review_count AS rc FROM activities WHERE is_active = 1 ORDER BY id LIMIT 5000"],
    ["PACKAGE", "/packages/detail/", "SELECT id, title AS name, destination_city AS city, thumbnail_url AS image, total_package_krw AS price, NULL AS score, 0 AS rc FROM packages WHERE is_active = 1 ORDER BY id LIMIT 5000"],
  ];
  for (const [domain, prefix, sql] of queries) {
    try {
      const rows = await env.DB.prepare(sql).all<any>();
      for (const r of rows.results || []) {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(r.id)) continue;
        routes.push(prefix + r.id);
        products.push({
          domain, id: r.id, route: prefix + r.id,
          name: r.name ?? null, city: r.city ?? null, image: r.image ?? null,
          priceKrw: Number.isFinite(Number(r.price)) ? Number(r.price) : null,
          score: r.score === null || r.score === undefined ? null : Number(r.score),
          reviewCount: Number(r.rc) || 0,
        });
      }
    } catch {
      // A missing table must not take the whole sitemap down.
    }
  }
  return { routes: [...new Set(routes)], products };
}

/** Sitemap of the landing pages plus every ACTIVE product detail page. Delisted products drop out automatically (C7). */
export async function sitemap(env: Env): Promise<Response> {
  const site = env.PUBLIC_SITE_URL || "https://getfortrip.com";
  const snap = await catalogSnapshot(env);
  const paths = [...STATIC_PATHS, ...snap.routes];
  return new Response(buildSitemap(site, paths), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600", ...SECURITY_HEADERS },
  });
}
