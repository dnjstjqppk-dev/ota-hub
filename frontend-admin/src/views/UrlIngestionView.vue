<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { adminFetch } from '../config/api'

interface IngestDraft {
  id?: string
  source_url: string
  domain_type: string
  title: string
  summary: string
  description: string
  image_urls: string[]
  currency: string
  price_minor: number
  original_price_minor: number | null
  options: Array<{ name: string; price_minor: number; max_pax: number }>
  country: string
  city: string
  address: string
  duration_mins: number | null
  inclusions: string[]
  exclusions: string[]
  cancellation_policy: string
  supplier_name: string
  status: string
  published_item_id?: string | null
}

const targetUrl = ref('')
const isScraping = ref(false)
const isPublishing = ref(false)
const currentDraft = ref<IngestDraft | null>(null)
const history = ref<any[]>([])
const loadingHistory = ref(false)
const feedbackMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null)

const samplePresets = [
  { label: '도쿄 스카이트리 전망대', url: 'https://travel.example.com/tokyo-skytree-admission' },
  { label: '파리 세느강 바토무슈 디너', url: 'https://travel.example.com/paris-seine-river-dinner-cruise' },
  { label: '오사카 유니버설 스튜디오 익스프레스', url: 'https://travel.example.com/usj-osaka-express-pass' },
  { label: '제주 신라호텔 오션뷰 스위트', url: 'https://hotels.example.com/shilla-jeju-suite' }
]

const domainOptions = [
  { id: 'ACTIVITY', label: '투어/액티비티' },
  { id: 'HOTEL', label: '호텔/숙박' },
  { id: 'CAR', label: '렌터카' },
  { id: 'PACKAGE', label: '여행 패키지' },
  { id: 'TRANSFER', label: '공항 픽업/샌딩' },
  { id: 'TICKET', label: '입장권/교통패스' }
]

const handleScrape = async () => {
  if (!targetUrl.value.trim()) {
    feedbackMessage.value = { type: 'error', text: '수집할 여행 상품 URL을 입력해주세요.' }
    return
  }

  isScraping.value = true
  feedbackMessage.value = null
  currentDraft.value = null

  try {
    const res = await adminFetch('/admin/ingest/url', {
      method: 'POST',
      body: JSON.stringify({ url: targetUrl.value.trim() })
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'URL 상품 수집에 실패했습니다.')
    }

    currentDraft.value = data.draft
    feedbackMessage.value = {
      type: 'success',
      text: `[${data.draft.title}] 상품 정보가 성공적으로 추출되어 임시 저장되었습니다.`
    }
    fetchHistory()
  } catch (err: any) {
    feedbackMessage.value = { type: 'error', text: err.message || '수집 중 오류가 발생했습니다.' }
  } finally {
    isScraping.value = false
  }
}

const handlePublish = async (draftId?: string) => {
  const idToPublish = draftId || currentDraft.value?.id
  if (!idToPublish) return

  isPublishing.value = true
  feedbackMessage.value = null

  try {
    const res = await adminFetch(`/admin/ingest/${idToPublish}/publish`, {
      method: 'POST'
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || '카탈로그 등록에 실패했습니다.')
    }

    feedbackMessage.value = {
      type: 'success',
      text: `공식 카탈로그에 등록 완료되었습니다! (신규 상품 ID: ${data.published_item_id})`
    }
    if (currentDraft.value && currentDraft.value.id === idToPublish) {
      currentDraft.value.status = 'PUBLISHED'
      currentDraft.value.published_item_id = data.published_item_id
    }
    fetchHistory()
  } catch (err: any) {
    feedbackMessage.value = { type: 'error', text: err.message || '등록 중 오류가 발생했습니다.' }
  } finally {
    isPublishing.value = false
  }
}

const fetchHistory = async () => {
  loadingHistory.value = true
  try {
    const res = await adminFetch('/admin/ingest/history')
    if (res.ok) {
      const data = await res.json()
      history.value = data.items || []
    }
  } catch (e) {
    console.error('Failed to load history', e)
  } finally {
    loadingHistory.value = false
  }
}

const loadDraftToEditor = (item: any) => {
  currentDraft.value = { ...item }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  fetchHistory()
})
</script>

<template>
  <div class="p-8 space-y-8 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="border-b pb-6">
      <div class="flex items-center gap-2">
        <span class="text-2xl">🌐</span>
        <h1 class="text-2xl font-bold text-slate-900">URL 기반 여행상품 자동 수집 (OpenMarket Ingestion Engine)</h1>
        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
          Smart Parser Active
        </span>
      </div>
      <p class="text-sm text-slate-500 mt-1">
        외부 여행사, 오픈마켓, 파트너 웹페이지 URL을 입력하면 OpenGraph 메타데이터와 Schema.org JSON-LD를 자동 추출하여 즉시 카탈로그 상품으로 규격화합니다.
      </p>
    </div>

    <!-- Alert / Toast -->
    <div
      v-if="feedbackMessage"
      :class="[
        'p-4 rounded-xl flex items-center justify-between text-sm shadow-sm transition-all',
        feedbackMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
      ]"
    >
      <div class="flex items-center gap-2 font-medium">
        <span>{{ feedbackMessage.type === 'success' ? '✅' : '⚠️' }}</span>
        <span>{{ feedbackMessage.text }}</span>
      </div>
      <button @click="feedbackMessage = null" class="text-xs opacity-70 hover:opacity-100">✕ 닫기</button>
    </div>

    <!-- URL Input Card -->
    <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
        <span>🔗</span> 여행상품 외부 URL 입력
      </h2>

      <div class="flex flex-col sm:flex-row gap-3">
        <input
          v-model="targetUrl"
          type="url"
          placeholder="https://... 수집할 상품 페이지 URL을 입력하세요"
          class="flex-1 px-4 py-3 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          :disabled="isScraping"
        />
        <button
          @click="handleScrape"
          :disabled="isScraping || !targetUrl.trim()"
          class="px-6 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm transition-all min-w-[140px]"
        >
          <span v-if="isScraping" class="animate-spin">⚙️</span>
          <span>{{ isScraping ? '데이터 수집 중...' : '상품 수집 시작' }}</span>
        </button>
      </div>

      <!-- Presets -->
      <div class="flex flex-wrap items-center gap-2 pt-2">
        <span class="text-xs font-semibold text-slate-400">테스트 프리셋:</span>
        <button
          v-for="preset in samplePresets"
          :key="preset.label"
          @click="targetUrl = preset.url"
          class="text-xs px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
        >
          {{ preset.label }}
        </button>
      </div>
    </div>

    <!-- Extracted Draft Preview & Editor Card -->
    <div v-if="currentDraft" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-6 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
              수집 완료 (DRAFT)
            </span>
            <span class="text-xs text-slate-500 font-mono">ID: {{ currentDraft.id }}</span>
            <span
              v-if="currentDraft.status === 'PUBLISHED'"
              class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800"
            >
              카탈로그 등록 완료 ({{ currentDraft.published_item_id }})
            </span>
          </div>
          <h2 class="text-lg font-bold text-slate-900 mt-1">수집된 상품 상세 및 카탈로그 등록 검토</h2>
        </div>

        <div class="flex items-center gap-2">
          <button
            @click="currentDraft = null"
            class="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            편집 닫기
          </button>
          <button
            @click="handlePublish()"
            :disabled="isPublishing || currentDraft.status === 'PUBLISHED'"
            class="px-5 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 shadow-sm flex items-center gap-1.5 transition-all"
          >
            <span>{{ isPublishing ? '카탈로그 등록 중...' : '🚀 공식 카탈로그 등록 (Publish)' }}</span>
          </button>
        </div>
      </div>

      <div class="p-6 space-y-6">
        <!-- Two Column Form -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Left Column: Form Fields (2 Cols) -->
          <div class="lg:col-span-2 space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">상품명 (Title)</label>
              <input
                v-model="currentDraft.title"
                type="text"
                class="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">상품 카테고리</label>
                <select
                  v-model="currentDraft.domain_type"
                  class="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option v-for="opt in domainOptions" :key="opt.id" :value="opt.id">{{ opt.label }}</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">공급업체 명 (Supplier)</label>
                <input
                  v-model="currentDraft.supplier_name"
                  type="text"
                  class="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">판매가 (KRW)</label>
                <input
                  v-model.number="currentDraft.price_minor"
                  type="number"
                  class="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg font-bold text-blue-600"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">정상가 (소비자가)</label>
                <input
                  v-model.number="currentDraft.original_price_minor"
                  type="number"
                  class="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg text-slate-500"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 mb-1">국가 / 도시</label>
                <div class="flex gap-2">
                  <input v-model="currentDraft.country" placeholder="국가" class="w-1/2 px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                  <input v-model="currentDraft.city" placeholder="도시" class="w-1/2 px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">상세 위치 / 주소</label>
              <input
                v-model="currentDraft.address"
                type="text"
                class="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">한 줄 요약 (Summary)</label>
              <input
                v-model="currentDraft.summary"
                type="text"
                class="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">상세 설명 (Description)</label>
              <textarea
                v-model="currentDraft.description"
                rows="4"
                class="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg leading-relaxed"
              ></textarea>
            </div>

            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">취소 및 환불 정책</label>
              <input
                v-model="currentDraft.cancellation_policy"
                type="text"
                class="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <!-- Right Column: Images & Options Preview -->
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">추출된 상품 대표 이미지</label>
              <div v-if="currentDraft.image_urls && currentDraft.image_urls.length > 0" class="rounded-xl overflow-hidden border border-slate-200">
                <img :src="currentDraft.image_urls[0]" class="w-full h-44 object-cover" />
              </div>
              <div v-else class="h-44 bg-slate-100 rounded-xl flex items-center justify-center text-xs text-slate-400">
                이미지 없음
              </div>
            </div>

            <!-- Options Box -->
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 class="text-xs font-bold text-slate-800 mb-2">선택 옵션 목록 ({{ currentDraft.options?.length || 0 }})</h4>
              <div class="space-y-2">
                <div
                  v-for="(opt, idx) in currentDraft.options"
                  :key="idx"
                  class="p-2.5 bg-white rounded-lg border border-slate-200 text-xs flex items-center justify-between"
                >
                  <div>
                    <p class="font-bold text-slate-800">{{ opt.name }}</p>
                    <p class="text-[11px] text-slate-400">최대 {{ opt.max_pax }}명 이용 가능</p>
                  </div>
                  <span class="font-bold text-blue-600">₩{{ opt.price_minor.toLocaleString() }}</span>
                </div>
              </div>
            </div>

            <!-- Inclusions / Exclusions -->
            <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
              <div>
                <span class="font-bold text-emerald-700">포함 사항:</span>
                <span class="text-slate-600 ml-1">{{ currentDraft.inclusions?.join(', ') || '없음' }}</span>
              </div>
              <div>
                <span class="font-bold text-rose-700">불포함 사항:</span>
                <span class="text-slate-600 ml-1">{{ currentDraft.exclusions?.join(', ') || '없음' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Ingestion History Table -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="p-6 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 class="text-base font-bold text-slate-900">최근 URL 수집 상품 내역</h2>
          <p class="text-xs text-slate-500 mt-0.5">외부에서 수집된 상품들의 검토 및 카탈로그 등록 이력입니다.</p>
        </div>
        <button
          @click="fetchHistory"
          class="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
        >
          새로고침
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
            <tr>
              <th class="p-4">도메인</th>
              <th class="p-4">상품명</th>
              <th class="p-4">위치</th>
              <th class="p-4">판매가</th>
              <th class="p-4">상태</th>
              <th class="p-4">수집 일시</th>
              <th class="p-4 text-right">작업</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="loadingHistory">
              <td colspan="7" class="p-8 text-center text-slate-400">내역을 불러오는 중...</td>
            </tr>
            <tr v-else-if="history.length === 0">
              <td colspan="7" class="p-8 text-center text-slate-400">수집된 상품 내역이 없습니다.</td>
            </tr>
            <tr
              v-for="item in history"
              :key="item.id"
              class="hover:bg-slate-50/80 transition-colors"
            >
              <td class="p-4">
                <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                  {{ item.domain_type }}
                </span>
              </td>
              <td class="p-4 font-bold text-slate-900 max-w-xs truncate" :title="item.title">
                {{ item.title }}
              </td>
              <td class="p-4 text-slate-600">
                {{ item.country }} / {{ item.city }}
              </td>
              <td class="p-4 font-bold text-slate-900">
                ₩{{ Number(item.price_minor || 0).toLocaleString() }}
              </td>
              <td class="p-4">
                <span
                  :class="[
                    'px-2 py-0.5 rounded text-[11px] font-bold',
                    item.status === 'PUBLISHED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  ]"
                >
                  {{ item.status === 'PUBLISHED' ? '공식 카탈로그 등록' : '검토 대기 (DRAFT)' }}
                </span>
              </td>
              <td class="p-4 text-slate-400">
                {{ new Date(item.created_at).toLocaleDateString('ko-KR') }}
              </td>
              <td class="p-4 text-right space-x-2">
                <button
                  @click="loadDraftToEditor(item)"
                  class="px-2.5 py-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded font-medium"
                >
                  상세/수정
                </button>
                <button
                  v-if="item.status !== 'PUBLISHED'"
                  @click="handlePublish(item.id)"
                  class="px-2.5 py-1 text-white bg-emerald-600 hover:bg-emerald-700 rounded font-bold"
                >
                  등록
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

