import type { Env } from "../env.ts";

/**
 * TG-15 edge-cache invalidation.
 *
 * Product reads carry `s-maxage=300, stale-while-revalidate=3600`, so the
 * edge serves catalog responses for up to 5 minutes. Admin mutations purge
 * what is exactly knowable:
 *   - single-product writes: the detail URL + the bare list URL of its domain
 *   - supplier/bulk writes: the bare list URLs (per-filter list variants and
 *     untouched detail pages converge on TTL — documented, not silent)
 *
 * Purge rides the Cloudflare purge_cache API. Without CACHE_PURGE_TOKEN +
 * CLOUDFLARE_ZONE_ID it is an honest no-op ({ skipped: true }) — local dev
 * and CI have no edge to purge.
 */

export const DOMAIN_SEGMENTS: Record<string, string> = {
  HOTEL: "hotels",
  FLIGHT: "flights",
  TRAIN: "trains",
  CAR: "cars",
  TRANSFER: "transfers",
  ACTIVITY: "activities",
  PACKAGE: "packages",
};

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function originOf(request: Request): string | null {
  try {
    const u = new URL(request.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Exact-URL purge set for one product write. Fail-closed: [] when unsure. */
export function productPurgeUrls(request: Request, domain: string, itemId: string): string[] {
  const seg = DOMAIN_SEGMENTS[String(domain || "").toUpperCase()];
  const origin = originOf(request);
  if (!seg || !origin || !ID_RE.test(itemId)) return [];
  return [`${origin}/api/v1/${seg}/${itemId}`, `${origin}/api/v1/${seg}`];
}

/** Bare list (+ marketplace) for one domain — bulk writes. */
export function bareListUrls(request: Request, domain: string): string[] {
  const seg = DOMAIN_SEGMENTS[String(domain || "").toUpperCase()];
  const origin = originOf(request);
  if (!seg || !origin) return [];
  return [`${origin}/api/v1/${seg}`, `${origin}/api/v1/marketplace/catalog`];
}

/** Bounded purge set for supplier/bulk writes (bare lists + marketplace). */
export function channelPurgeUrls(request: Request): string[] {
  const origin = originOf(request);
  if (!origin) return [];
  return [
    ...Object.values(DOMAIN_SEGMENTS).map((seg) => `${origin}/api/v1/${seg}`),
    `${origin}/api/v1/marketplace/catalog`,
  ];
}

export interface PurgeResult {
  purged: number;
  skipped: boolean;
  error?: string;
}

type FetchFn = (url: string, init: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/**
 * Purge exact URLs from the edge cache. Never throws: validation failures
 * and transport errors surface as { purged: 0, error } for the caller to map.
 */
export async function purgeUrls(env: Env, urls: string[], transport?: FetchFn): Promise<PurgeResult> {
  try {
    const files = [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))];
    if (!files.length) return { purged: 0, skipped: false };
    if (files.length > 50) return { purged: 0, skipped: false, error: "TOO_MANY_URLS" };
    for (const f of files) {
      if (f.length > 500) return { purged: 0, skipped: false, error: "URL_TOO_LONG" };
      try {
        const u = new URL(f);
        if (u.protocol !== "http:" && u.protocol !== "https:") return { purged: 0, skipped: false, error: "INVALID_URL" };
      } catch {
        return { purged: 0, skipped: false, error: "INVALID_URL" };
      }
    }
    const token = (env.CACHE_PURGE_TOKEN || "").trim();
    const zone = (env.CLOUDFLARE_ZONE_ID || "").trim();
    if (!token || !zone) return { purged: 0, skipped: true };
    const res = await (transport || fetch)(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ files }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.success !== true) return { purged: 0, skipped: false, error: "PURGE_FAILED" };
    return { purged: files.length, skipped: false };
  } catch {
    return { purged: 0, skipped: false, error: "PURGE_FAILED" };
  }
}

/**
 * Best-effort inline purge for admin mutations. Returns the purged count for
 * the X-Cache-Purged header (0 when skipped or failed — mutations never fail
 * for cache reasons).
 */
export async function purgeForMutation(env: Env, urls: string[]): Promise<number> {
  const r = await purgeUrls(env, urls);
  return r.purged;
}
