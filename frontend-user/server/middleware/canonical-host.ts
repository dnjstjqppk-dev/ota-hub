/**
 * Domain hookup (2026-11-25): www.<domain> is attached to ota-user only so it
 * resolves; the apex is the one canonical host (SEO canonical, cookie jar,
 * /api/* route). Permanent redirect, path and query kept.
 */
export default defineEventHandler((event) => {
  const host = (getRequestHost(event, { xForwardedHost: false }) || '').toLowerCase()
  if (!host.startsWith('www.')) return
  const url = getRequestURL(event)
  return sendRedirect(event, `https://${host.slice(4)}${url.pathname}${url.search}`, 301)
})
