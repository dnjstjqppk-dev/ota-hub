/**
 * P0-1 (2026-11-22 commercial-readiness audit): route SSR API calls through
 * the ota-hub service binding instead of the public workers.dev origin.
 *
 * Cloudflare Workers cannot subrequest another `*.workers.dev` worker in the
 * same account (Error 1042), so every SSR `fetch()` to NUXT_API_BASE_SERVER
 * threw and catalog pages rendered 503/404. `00.hub-binding.server.ts` wraps
 * the server global fetch and forwards matching URLs to `env.API.fetch()`,
 * which ignores the hostname and delivers in-process.
 *
 * This module is pure (no Nuxt imports) so node --test can cover it.
 */

/** Absolute hub API URL to forward, or null when global fetch must handle it. */
export function hubBindingTarget(input: unknown, apiBaseServer: string): string | null {
  if (typeof input !== 'string' || !input.startsWith('http')) return null
  if (typeof apiBaseServer !== 'string' || !apiBaseServer.startsWith('http')) return null
  const prefix = apiBaseServer.replace(/\/+$/, '')
  if (!input.startsWith(prefix)) return null
  // Boundary: the char after the prefix must end the URL or start a path,
  // query, or fragment — never extend the last segment (e.g. /api/v10).
  const next = input.charAt(prefix.length)
  if (next !== '' && next !== '/' && next !== '?' && next !== '#') return null
  return input
}
