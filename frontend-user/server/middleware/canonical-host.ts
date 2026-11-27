/**
 * Country-subdomain routing (2026-11-27):
 * Production redirects (legacy /en|/ja|/zh 301 and apex/www Geo-IP 302) run in
 * front of Nitro inside frontend-user/edge/edge-guard.mjs.
 * This Nitro middleware only handles legacy /en|/ja|/zh 301s during local `nuxt dev`
 * where the edge wrapper is not active.
 */
import { LEGACY_PREFIX_MAP, buildLocalizedUrl, isSiteHost, normalizeCurrency, normalizeLocale } from '~/config/locale.config'

const LEGACY_PREFIX_RE = /^\/(en|ja|zh)(?=\/|$)/

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const m = LEGACY_PREFIX_RE.exec(url.pathname)
  if (!m) return
  const cfg = LEGACY_PREFIX_MAP[m[1] as keyof typeof LEGACY_PREFIX_MAP]
  if (!cfg) return
  const rest = url.pathname.slice(m[0].length) || '/'
  const host = url.hostname.toLowerCase()
  const target = buildLocalizedUrl(rest, {
    sub: cfg.sub,
    locale: normalizeLocale(url.searchParams.get('locale')) || cfg.locale,
    curr: normalizeCurrency(url.searchParams.get('curr')) || cfg.curr,
    query: url.searchParams,
    origin: isSiteHost(host) ? undefined : url.origin,
  })
  return sendRedirect(event, target, 301)
})
