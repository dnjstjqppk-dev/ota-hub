import { ref, shallowRef } from 'vue'

/**
 * Load-once/reload state for a view: `state` is loading | ready | error and `error` carries the server's
 * message. Out-of-order responses are dropped so a slow earlier request cannot overwrite a newer one.
 */
export function useResource<T>(loader: () => Promise<T>, initial: T) {
  const data = shallowRef<T>(initial)
  const state = ref<'loading' | 'ready' | 'error'>('loading')
  const error = ref('')
  let ticket = 0
  async function reload() {
    const mine = ++ticket
    state.value = 'loading'
    error.value = ''
    try {
      const v = await loader()
      if (mine !== ticket) return
      data.value = v
      state.value = 'ready'
    } catch (e) {
      if (mine !== ticket) return
      error.value = (e as Error).message || '불러오지 못했어요.'
      state.value = 'error'
    }
  }
  return { data, state, error, reload }
}
