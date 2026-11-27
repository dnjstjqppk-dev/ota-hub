/**
 * Client-side recently viewed travel products (stored in localStorage, max 8 items).
 * SSR-safe: never touches window/localStorage on the server.
 */
import { ref } from 'vue'

export interface RecentItem {
  domain: string
  id: string
  title: string
  subtitle?: string
  image?: string | null
  priceKrw?: number | null
  path: string
  viewedAt: number
}

const KEY = 'gft_recently_viewed_v1'
const MAX_ITEMS = 8

const items = ref<RecentItem[]>([])
let loaded = false

function readStorage(): RecentItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : []
  } catch {
    return []
  }
}

function writeStorage(list: RecentItem[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ITEMS)))
  } catch {
    // quota / privacy mode
  }
}

export function useRecentlyViewed() {
  const hydrate = () => {
    if (loaded || typeof window === 'undefined') return
    loaded = true
    items.value = readStorage()
  }

  const record = (entry: Omit<RecentItem, 'viewedAt'>) => {
    if (typeof window === 'undefined' || !entry.id || !entry.path) return
    const current = loaded ? items.value : readStorage()
    loaded = true
    const next: RecentItem[] = [
      { ...entry, viewedAt: Date.now() },
      ...current.filter((x) => !(x.domain === entry.domain && x.id === entry.id)),
    ].slice(0, MAX_ITEMS)
    items.value = next
    writeStorage(next)
  }

  const clear = () => {
    items.value = []
    writeStorage([])
  }

  return { items, hydrate, record, clear }
}
