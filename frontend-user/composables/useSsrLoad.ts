import type { Ref } from 'vue'

/**
 * SSR-once loader (2026-11-27 review). The catalog pages used to run
 * `useAsyncData(key, () => load())` with a handler that returned nothing and
 * only mutated plain refs. Nothing reached the payload, so the browser ran the
 * same API call again while hydrating: a second hub request on every view, a
 * page that stayed non-interactive until it settled, and — when that second
 * call failed — rates vanishing and a hydration mismatch.
 *
 * Here the handler returns a snapshot of the refs the loader fills. Nuxt puts
 * it in the payload, the browser skips the handler during hydration, and the
 * refs are restored from the payload before the first client render. Client
 * navigations still re-run the loader (Nuxt's default getCachedData only
 * reuses payload data while hydrating).
 */
export async function useSsrLoad(key: string, load: () => Promise<unknown>, refs: Record<string, Ref<any>>): Promise<void> {
  const snapshot = () => Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.value]))
  const { data } = await useAsyncData(key, async () => {
    await load()
    return snapshot()
  })
  const saved = data.value as Record<string, unknown> | null | undefined
  if (import.meta.client && saved && typeof saved === 'object') {
    for (const [k, r] of Object.entries(refs)) if (k in saved) r.value = saved[k]
  }
}
