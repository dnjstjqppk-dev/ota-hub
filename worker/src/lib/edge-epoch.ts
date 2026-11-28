import type { Env } from "../env.ts";

/**
 * Storefront edge-cache generation (2026-11-28).
 *
 * ota-user's edge guard caches public SSR pages per data center with the
 * Workers Cache API and puts this number in every cache key. Cache API
 * entries cannot be purged globally, so instead of purging, any successful
 * admin/partner write bumps the epoch: within ~30s (the guard's memo) every
 * colo starts using fresh keys and the old entries simply expire.
 */

/** Writes that never change what the storefront renders (sessions, credentials, MFA). */
const NON_CATALOG_RE = /\/(?:login|logout|register|forgot-password|reset-password|password|mfa|totp|verify[^/]*|session|refresh|me)(?:\/|$)/;

export function isCatalogMutation(method: string, pathname: string, status: number): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (status < 200 || status >= 400) return false;
  if (!/^\/api\/v1\/(?:admin|partner)\//.test(pathname)) return false;
  return !NON_CATALOG_RE.test(pathname);
}

export async function readEdgeEpoch(env: Env): Promise<number> {
  try {
    const r = await env.DB.prepare("SELECT epoch FROM edge_epoch WHERE id = 1").first<{ epoch: number }>();
    return Number(r?.epoch) || 0;
  } catch {
    return 0; // pre-0061 schema
  }
}

export async function bumpEdgeEpoch(env: Env): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO edge_epoch (id, epoch, updated_at) VALUES (1, 2, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(id) DO UPDATE SET epoch = epoch + 1, updated_at = excluded.updated_at",
    ).run();
  } catch (e) {
    console.error("edge epoch bump failed", e);
  }
}
