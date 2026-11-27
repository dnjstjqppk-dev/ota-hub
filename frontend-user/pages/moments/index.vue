<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch, useApiUrl } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

const { t, locale } = useI18n()
const localePath = useLocalePath()
useSeoPage({ site: `https://${useRuntimeConfig().public.brandDomain}`, path: '/moments', title: t('moments.title'), description: t('moments.desc') })
const LOCALE_TAG: Record<string, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }
const fmtDate = (s: string) => new Date(s).toLocaleDateString(LOCALE_TAG[locale.value] || 'ko-KR')

interface Moment {
  id: string
  user_name: string
  user_avatar: string | null
  city: string
  title: string
  content: string
  photos: string[]
  likes_count: number
  created_at: string
}

const auth = useAuthStore()
const moments = ref<Moment[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')

const showWriteModal = ref(false)
const newTitle = ref('')
const newCity = ref('')
const newContent = ref('')
const submitting = ref(false)
const submitError = ref('')
// #153: likes I toggled this session (the feed carries counts, not my state).
const likedIds = ref(new Set<string>())
const liking = ref('')
// #153: photos attached to the draft (uploaded first, URLs attached on submit).
const draftPhotos = ref<string[]>([])
const uploading = ref(false)
const uploadError = ref('')

function toMoment(r: any): Moment {
  let photos: string[] = []
  try {
    const parsed = JSON.parse(r.photos_json || '[]')
    if (Array.isArray(parsed)) photos = parsed.filter((p) => typeof p === 'string')
  } catch {}
  return {
    id: String(r.id),
    user_name: r.user_name || t('moments.traveler'),
    user_avatar: r.user_avatar || null,
    city: r.city || '',
    title: r.title || '',
    content: r.content || '',
    photos,
    likes_count: Number(r.likes_count || 0),
    created_at: r.created_at
  }
}

const fetchMoments = async () => {
  state.value = 'loading'
  const r = await apiFetch('/moments')
  if (r.ok && Array.isArray((r.data as any).moments)) {
    moments.value = (r.data as any).moments.map(toMoment)
    state.value = 'ready'
  } else {
    state.value = 'error'
  }
}

function openWrite() {
  if (!auth.isLoggedIn) {
    navigateTo({ path: localePath('/login'), query: { redirect: localePath('/moments') } })
    return
  }
  submitError.value = ''
  uploadError.value = ''
  draftPhotos.value = []
  showWriteModal.value = true
}

const toggleLike = async (m: Moment) => {
  if (!auth.isLoggedIn) {
    navigateTo({ path: localePath('/login'), query: { redirect: localePath('/moments') } })
    return
  }
  if (liking.value) return
  liking.value = m.id
  const liked = likedIds.value.has(m.id)
  const r = await apiFetch(`/moments/${encodeURIComponent(m.id)}/like`, { method: liked ? 'DELETE' : 'POST' })
  liking.value = ''
  if (!r.ok) return
  if (liked) likedIds.value.delete(m.id)
  else likedIds.value.add(m.id)
  m.likes_count = Number((r.data as any)?.likesCount ?? m.likes_count)
}

const absolutizeUpload = (rel: string): string => {
  const base = useApiUrl()
  if (/^https?:\/\//.test(base)) return new URL(rel, base.endsWith('/') ? base : `${base}/`).href
  return `${window.location.origin}${rel}`
}

const attachFiles = async (ev: Event) => {
  const input = ev.target as HTMLInputElement
  const files = [...(input.files || [])].filter((f) => f.type.startsWith('image/')).slice(0, 10 - draftPhotos.value.length)
  if (!files.length) return
  uploading.value = true
  uploadError.value = ''
  try {
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      form.append('purpose', 'MOMENT_PHOTO')
      const res = await fetch(useApiUrl('/uploads'), { credentials: 'include', method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.url) throw new Error(json.error || t('moments.uploadFail'))
      draftPhotos.value.push(absolutizeUpload(String(json.url)))
    }
  } catch (e: any) {
    uploadError.value = e.message || t('moments.uploadFail')
  } finally {
    uploading.value = false
    input.value = ''
  }
};

const submitMoment = async () => {
  const title = newTitle.value.trim()
  const content = newContent.value.trim()
  if (!title || !content || submitting.value) return
  submitting.value = true
  submitError.value = ''
  const r = await apiFetch('/moments', {
    method: 'POST',
    body: { title, content, city: newCity.value.trim() || t('moments.cityDef'), photos: draftPhotos.value.slice(0, 10) }
  })
  submitting.value = false
  if (!r.ok) {
    submitError.value = (r.data as any)?.error || t('moments.submitFail')
    return
  }
  moments.value.unshift({
    id: String((r.data as any).id),
    user_name: auth.user?.fullName || t('moments.traveler'),
    user_avatar: null,
    city: newCity.value.trim() || t('moments.cityDef'),
    title,
    content,
    photos: draftPhotos.value.slice(0, 10),
    likes_count: 0,
    created_at: new Date().toISOString()
  })
  showWriteModal.value = false
  newTitle.value = ''
  newCity.value = ''
  newContent.value = ''
  draftPhotos.value = []
}

onMounted(() => {
  fetchMoments()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-8 lg:px-6 lg:pb-16">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-3xl font-extrabold tracking-tight text-ink">{{ $t('moments.title') }}</h1>
        <p class="mt-1 text-sm text-ink-muted">{{ $t('moments.sub') }}</p>
      </div>

      <button type="button" class="btn-primary !px-5 !py-2.5 !text-xs" @click="openWrite">
        <AppIcon name="plus" :size="14" /> {{ $t('moments.write') }}
      </button>
    </div>

    <ResultsState
      :state="state"
      :count="moments.length"
      icon="camera"
      :empty-title="$t('moments.empty')"
      :empty-hint="$t('moments.emptyHint')"
      :error-title="$t('moments.loadFail')"
      @retry="fetchMoments"
    >
      <template #empty-actions>
        <button type="button" class="btn-primary" @click="openWrite">{{ $t('moments.writeFirst') }}</button>
      </template>

      <div class="grid grid-cols-1 gap-5 md:grid-cols-2">
        <article v-for="m in moments" :key="m.id" class="card space-y-4 p-6 transition hover:shadow-pop">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-extrabold text-primary" aria-hidden="true">{{ (m.user_name || $t('moments.traveler')).slice(0, 1) }}</span>
              <div>
                <div class="text-sm font-bold text-ink">{{ m.user_name }}</div>
                <div class="text-xs text-ink-subtle">{{ $t('moments.tripLog', { city: m.city, d: m.created_at ? fmtDate(m.created_at) : '' }) }}</div>
              </div>
            </div>
            <button
              type="button"
              :disabled="liking === m.id"
              :aria-pressed="likedIds.has(m.id)"
              :aria-label="likedIds.has(m.id) ? $t('moments.unlike') : $t('moments.like')"
              :class="['flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-50', likedIds.has(m.id) ? 'bg-accent text-white' : 'bg-accent-soft text-accent hover:bg-accent/15']"
              @click="toggleLike(m)"
            >
              <AppIcon name="heart" :size="13" /> {{ m.likes_count }}
            </button>
          </div>

          <div>
            <h2 class="mb-1 text-base font-extrabold text-ink">{{ m.title }}</h2>
            <p class="text-sm leading-relaxed text-ink-muted">{{ m.content }}</p>
          </div>

          <div v-if="m.photos.length" class="chip-rail flex gap-2 pb-1 [&>*]:shrink-0">
            <SmartImg v-for="p in m.photos" :key="p" :src="p" img-class="h-24 w-32 rounded-2xl object-cover" icon="camera" :alt="$t('moments.photoAlt')" />
          </div>
        </article>
      </div>
    </ResultsState>

    <!-- Write Modal -->
    <div v-if="showWriteModal" class="fixed inset-0 z-50 flex items-center justify-center bg-midnight-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" :aria-label="$t('moments.modalAria')" @click.self="showWriteModal = false">
      <div class="w-full max-w-lg space-y-4 rounded-[28px] border border-line bg-surface p-6 shadow-pop animate-pop-in">
        <h3 class="text-lg font-extrabold text-ink">{{ $t('moments.modalTitle') }}</h3>

        <div class="space-y-3">
          <div>
            <label class="field-label" for="moment-city">{{ $t('moments.cityLabel') }}</label>
            <input id="moment-city" v-model="newCity" type="text" class="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" :placeholder="$t('moments.cityDef')" />
          </div>
          <div>
            <label class="field-label" for="moment-title">{{ $t('help.subject') }}</label>
            <input id="moment-title" v-model="newTitle" type="text" class="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" :placeholder="$t('moments.titlePh')" />
          </div>
          <div>
            <label class="field-label" for="moment-content">{{ $t('help.body') }}</label>
            <textarea id="moment-content" v-model="newContent" rows="4" class="w-full rounded-field border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" :placeholder="$t('moments.contentPh')"></textarea>
          </div>
          <div>
            <label class="field-label" for="moment-photos">{{ $t('moments.photosLabel') }}</label>
            <input id="moment-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple :disabled="uploading || draftPhotos.length >= 10" class="w-full text-xs text-ink-muted" @change="attachFiles" />
            <p v-if="uploading" class="mt-1 text-xs text-ink-muted" role="status">{{ $t('moments.uploading') }}</p>
            <p v-if="uploadError" class="mt-1 text-xs font-bold text-danger" role="alert">{{ uploadError }}</p>
            <div v-if="draftPhotos.length" class="mt-2 flex flex-wrap gap-2">
              <img v-for="(p, i) in draftPhotos" :key="p + i" :src="p" class="h-16 w-20 rounded-xl object-cover" :alt="$t('moments.previewAlt')" />
            </div>
          </div>
        </div>

        <p v-if="submitError" class="text-xs font-bold text-danger" role="alert">{{ submitError }}</p>

        <div class="flex gap-2 pt-2">
          <button type="button" :disabled="submitting || !newTitle.trim() || !newContent.trim()" class="btn-primary flex-1" @click="submitMoment">
            {{ submitting ? $t('moments.submitting') : $t('moments.submit') }}
          </button>
          <button type="button" class="btn-secondary" @click="showWriteModal = false">
            {{ $t('common.cancel') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
