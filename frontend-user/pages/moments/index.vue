<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch, useApiUrl } from '~/composables/useApi'
import { useAuthStore } from '~/stores/auth'

useHead({
  title: '여행 모먼트',
  meta: [{ name: 'description', content: '전 세계 여행자들의 생생한 여행 기록과 포토 커뮤니티' }]
})

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
    user_name: r.user_name || '여행자',
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
    navigateTo({ path: '/login', query: { redirect: '/moments' } })
    return
  }
  submitError.value = ''
  uploadError.value = ''
  draftPhotos.value = []
  showWriteModal.value = true
}

const toggleLike = async (m: Moment) => {
  if (!auth.isLoggedIn) {
    navigateTo({ path: '/login', query: { redirect: '/moments' } })
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
      if (!res.ok || !json.url) throw new Error(json.error || '사진 업로드에 실패했습니다.')
      draftPhotos.value.push(absolutizeUpload(String(json.url)))
    }
  } catch (e: any) {
    uploadError.value = e.message || '사진 업로드에 실패했습니다.'
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
    body: { title, content, city: newCity.value.trim() || '서울', photos: draftPhotos.value.slice(0, 10) }
  })
  submitting.value = false
  if (!r.ok) {
    submitError.value = (r.data as any)?.error || '작성에 실패했습니다. 다시 시도해주세요.'
    return
  }
  moments.value.unshift({
    id: String((r.data as any).id),
    user_name: auth.user?.fullName || '여행자',
    user_avatar: null,
    city: newCity.value.trim() || '서울',
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
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-6">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-black text-slate-900 tracking-tight">여행 모먼트</h1>
        <p class="text-sm text-slate-500 mt-1">전 세계 여행자들의 생생한 여행 기록, 꿀팁 및 포토 커뮤니티</p>
      </div>

      <button
        type="button"
        @click="openWrite"
        class="px-5 py-2.5 bg-trip-blue hover:bg-trip-hover text-white text-xs font-bold rounded-xl shadow-md flex shrink-0 items-center gap-2"
      >
        <AppIcon name="plus" :size="14" /> 모먼트 작성하기
      </button>
    </div>

    <ResultsState
      :state="state"
      :count="moments.length"
      icon="camera"
      empty-title="아직 등록된 모먼트가 없어요"
      empty-hint="첫 여행 기록을 남겨보세요."
      error-title="모먼트를 불러오지 못했어요"
      @retry="fetchMoments"
    >
      <template #empty-actions>
        <button type="button" class="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-ink hover:bg-primary-hover" @click="openWrite">첫 모먼트 작성하기</button>
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <article v-for="m in moments" :key="m.id" class="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-trip-blue/10 text-sm font-black text-trip-blue" aria-hidden="true">{{ (m.user_name || '여').slice(0, 1) }}</span>
              <div>
                <div class="font-bold text-slate-900 text-sm">{{ m.user_name }}</div>
                <div class="text-xs text-slate-400">{{ m.city }} 여행기 · {{ m.created_at ? new Date(m.created_at).toLocaleDateString() : '' }}</div>
              </div>
            </div>
            <button
              type="button"
              :disabled="liking === m.id"
              :aria-pressed="likedIds.has(m.id)"
              :aria-label="likedIds.has(m.id) ? '좋아요 취소' : '좋아요'"
              :class="['flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50', likedIds.has(m.id) ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100']"
              @click="toggleLike(m)"
            >
              <AppIcon name="heart" :size="13" /> {{ m.likes_count }}
            </button>
          </div>

          <div>
            <h3 class="font-black text-slate-900 text-base mb-1">{{ m.title }}</h3>
            <p class="text-xs text-slate-600 leading-relaxed">{{ m.content }}</p>
          </div>

          <div v-if="m.photos.length" class="flex gap-2">
            <SmartImg v-for="p in m.photos" :key="p" :src="p" class="w-32 h-24 rounded-2xl object-cover" alt="모먼트 사진" />
          </div>
        </article>
      </div>
    </ResultsState>

    <!-- 작성 모달 -->
    <div v-if="showWriteModal" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="새 여행 모먼트 작성">
      <div class="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <h3 class="text-lg font-black text-slate-900">새 여행 모먼트 작성</h3>

        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1" for="moment-city">여행 도시</label>
            <input id="moment-city" v-model="newCity" type="text" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold" placeholder="서울" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1" for="moment-title">제목</label>
            <input id="moment-title" v-model="newTitle" type="text" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-bold" placeholder="여행지의 인상적인 순간을 요약해주세요" />
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1" for="moment-content">내용</label>
            <textarea id="moment-content" v-model="newContent" rows="4" class="w-full p-2.5 border border-slate-300 rounded-xl text-xs" placeholder="여행 꿀팁, 맛집, 호텔 후기를 적어주세요."></textarea>
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1" for="moment-photos">사진 (최대 10장)</label>
            <input id="moment-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple :disabled="uploading || draftPhotos.length >= 10" class="w-full text-xs text-slate-600" @change="attachFiles" />
            <p v-if="uploading" class="mt-1 text-xs text-slate-500" role="status">사진을 올리는 중…</p>
            <p v-if="uploadError" class="mt-1 text-xs font-bold text-danger" role="alert">{{ uploadError }}</p>
            <div v-if="draftPhotos.length" class="mt-2 flex flex-wrap gap-2">
              <img v-for="(p, i) in draftPhotos" :key="p + i" :src="p" class="h-16 w-20 rounded-xl object-cover" alt="첨부 미리보기" />
            </div>
          </div>
        </div>

        <p v-if="submitError" class="text-xs font-bold text-danger" role="alert">{{ submitError }}</p>

        <div class="flex gap-2 pt-2">
          <button type="button" :disabled="submitting || !newTitle.trim() || !newContent.trim()" @click="submitMoment" class="flex-1 py-3 bg-trip-blue text-white font-bold rounded-xl text-xs shadow-md disabled:opacity-50">
            {{ submitting ? '작성 중…' : '작성 완료' }}
          </button>
          <button type="button" @click="showWriteModal = false" class="py-3 px-5 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs">
            취소
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
