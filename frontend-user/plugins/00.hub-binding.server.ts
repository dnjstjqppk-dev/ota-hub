import { hubBindingTarget } from '~/utils/hubBinding'

/**
 * P0-1 (2026-11-22 commercial-readiness audit): server-side API calls ride
 * the ota-hub service binding (`API` in wrangler.jsonc) instead of HTTPS to
 * the public workers.dev origin, which Workers cannot subrequest (Error
 * 1042 — every SSR catalog page failed with 503/404).
 *
 * One wrapper covers all call sites (apiFetch + the raw fetch() in catalog
 * pages/stores): absolute URLs under NUXT_API_BASE_SERVER go to
 * `env.API.fetch()`, which ignores the hostname. Anything without a binding
 * (local `nuxt dev`, tests, no request context) or any binding transport
 * failure falls back to the original fetch, so local development is
 * untouched. Runs first (00.) so no SSR fetch escapes it.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.server) return
  const apiBaseServer = ((useRuntimeConfig() as any).apiBaseServer as string) || ''
  const originalFetch = globalThis.fetch
  if ((originalFetch as any).__hubBindingWrapped) return
  const wrapped: typeof fetch = (async (input: any, init: any) => {
    const href = typeof input === 'string' ? input : (input && typeof input.url === 'string' ? input.url : '')
    if (hubBindingTarget(href, apiBaseServer)) {
      try {
        const binding = (useRequestEvent()?.context as any)?.cloudflare?.env?.API
        if (binding && typeof binding.fetch === 'function') {
          try {
            return await binding.fetch(input, init)
          } catch {
            // Binding transport failure (e.g. local `wrangler dev` without a
            // live hub): fall through to the original fetch below.
          }
        }
      } catch {
        // No request context (tests, build-time prerender probes): fall through.
      }
    }
    return originalFetch(input, init)
  }) as typeof fetch
  ;(wrapped as any).__hubBindingWrapped = true
  globalThis.fetch = wrapped
})
