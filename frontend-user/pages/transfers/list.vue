<script setup lang="ts">
/**
 * Airport transfer results (design system "Horizon"). URL = state (airport, destination, date, passengers).
 * API only. Price is per vehicle, one way; vehicles too small for the party are hidden (the quote API
 * rejects them with OCCUPANCY_EXCEEDED) and the page says so.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCurrencyStore } from '~/stores/currency'
import { useApiUrl } from '~/composables/useApi'
import { fmtDay, qDate, qInt, qOneOf, qStr, todayIso, useUrlQuery } from '~/composables/useUrlQuery'

const { route, router, patch, isSelf } = useUrlQuery()
const currency = useCurrencyStore()

const SORTS = [{ id: 'price_asc', label: '낮은 가격순' }, { id: 'price_desc', label: '높은 가격순' }, { id: 'capacity', label: '탑승 인원 많은순' }] as const
const q = computed(() => {
  const r = route.query
  return {
    airport: qStr(r.airport), destination: qStr(r.destination || r.dest), date: qDate(r.date || r.startDate),
    adults: qInt(r.adults || r.passengers, 2, 1, 9), children: qInt(r.children, 0, 0, 8),
    sort: qOneOf(r.sortBy, SORTS.map((s) => s.id), 'price_asc')
  }
})
const pax = computed(() => q.value.adults + q.value.children)

const today = ref('')
const draft = reactive({ airport: '', destination: '', date: '', adults: 2, children: 0 })
const formOpen = ref(false)
const formError = ref('')
function syncDraft() { const x = q.value; Object.assign(draft, { airport: x.airport, destination: x.destination, date: x.date, adults: x.adults, children: x.children }) }
syncDraft()
function submit() {
  formError.value = ''
  if (!draft.airport.trim()) { formError.value = '공항을 입력해 주세요.'; return }
  formOpen.value = false
  router.replace({ query: { airport: draft.airport.trim(), ...(draft.destination.trim() ? { destination: draft.destination.trim() } : {}), ...(draft.date ? { date: draft.date } : {}), adults: String(draft.adults), ...(draft.children ? { children: String(draft.children) } : {}) } })
}

const items = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
let ctrl: AbortController | null = null
async function load() {
  ctrl?.abort(); ctrl = new AbortController(); const mine = ctrl
  const x = q.value
  state.value = 'loading'
  const timer = setTimeout(() => mine.abort(), 10000)
  try {
    const p = new URLSearchParams()
    if (x.airport) p.set('airport', x.airport)
    if (x.destination) p.set('destination', x.destination)
    const res = await fetch(`${useApiUrl('/transfers')}?${p}`, { signal: mine.signal })
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    if (mine !== ctrl) return
    items.value = Array.isArray(j.data) ? j.data : []
    state.value = 'ready'
  } catch { if (mine === ctrl) state.value = 'error' } finally { clearTimeout(timer) }
}
const fits = computed(() => items.value.filter((t) => !Number(t.max_passengers) || Number(t.max_passengers) >= pax.value))
const hiddenBySize = computed(() => items.value.length - fits.value.length)
const sorted = computed(() => {
  const by = { price_asc: (a: any, b: any) => a.price_krw - b.price_krw, price_desc: (a: any, b: any) => b.price_krw - a.price_krw, capacity: (a: any, b: any) => b.max_passengers - a.max_passengers }[q.value.sort]
  return [...fits.value].sort(by)
})

function paxQuery() { const x = q.value; return { adults: String(x.adults), ...(x.children ? { children: String(x.children) } : {}) } }
function detailLink(t: any) { return { path: `/transfers/detail/${t.id}`, query: { ...(q.value.date ? { startDate: q.value.date } : {}), ...paxQuery() } } }
function book(t: any) { router.push({ path: '/checkout', query: { domain: 'TRANSFER', itemId: t.id, startDate: q.value.date, ...paxQuery() } }) }

watch(() => route.fullPath, () => { if (isSelf()) syncDraft() })
watch(() => [q.value.airport, q.value.destination], () => { if (isSelf()) load() })
onMounted(() => { today.value = todayIso(); load() })
onBeforeUnmount(() => ctrl?.abort())
useHead(() => ({ title: q.value.airport ? `${q.value.airport} 공항 이동` : '공항 이동 검색' }))
</script>

<template>
  <div class="pb-24 lg:pb-16">
    <section class="border-b border-line bg-surface">
      <div class="mx-auto max-w-7xl px-4 py-3 lg:px-6 lg:py-4">
        <button v-if="!formOpen" type="button" class="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas px-4 py-2.5 text-left lg:hidden" @click="formOpen = true">
          <AppIcon name="transfer" class="text-ink-subtle" />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold text-ink">{{ q.airport ? `${q.airport}${q.destination ? ` → ${q.destination}` : ''}` : '공항을 선택하세요' }}</span>
            <span class="block truncate text-xs text-ink-muted">{{ q.date ? fmtDay(q.date) : '날짜 미정' }} · {{ pax }}명</span>
          </span>
          <span class="text-sm font-semibold text-primary">변경</span>
        </button>
        <form :class="['lg:block', formOpen ? 'block' : 'hidden']" novalidate @submit.prevent="submit">
          <div class="grid gap-2 lg:grid-cols-[1fr_1fr_0.9fr_0.9fr_auto]">
            <div class="field-box"><label for="tl-apt" class="field-label">공항</label><SearchAutocomplete v-model="draft.airport" input-id="tl-apt" domain="flights" variant="bare" placeholder="예: 인천국제공항" /></div>
            <div class="field-box"><label for="tl-dest" class="field-label">목적지 (선택)</label><SearchAutocomplete v-model="draft.destination" input-id="tl-dest" domain="transfers" variant="bare" placeholder="지역, 호텔, 명소" /></div>
            <DateRangePicker v-model:start="draft.date" mode="single" start-label="이용일" :min="today" compact />
            <GuestPicker v-model:adults="draft.adults" v-model:children="draft.children" :show-rooms="false" label="탑승 인원" compact />
            <div class="flex gap-2">
              <button v-if="formOpen" type="button" class="btn-secondary lg:hidden" @click="formOpen = false; syncDraft()">취소</button>
              <button type="submit" class="btn-primary min-h-[52px] flex-1 rounded-2xl px-7 text-base"><AppIcon name="search" :size="18" />검색</button>
            </div>
          </div>
          <p v-if="formError" class="mt-2 text-sm font-medium text-danger" role="alert">{{ formError }}</p>
        </form>
      </div>
    </section>

    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="flex flex-wrap items-end justify-between gap-3 pb-3 pt-6">
        <div>
          <nav class="mb-1 flex items-center gap-1 text-xs text-ink-subtle" aria-label="이동 경로"><NuxtLink to="/" class="hover:text-ink">홈</NuxtLink><AppIcon name="chevron-right" :size="12" /><NuxtLink to="/transfers" class="hover:text-ink">공항 이동</NuxtLink></nav>
          <h1 class="text-xl font-bold tracking-tight text-ink sm:text-2xl">{{ q.airport ? `${q.airport} 출발 공항 이동` : '모든 공항 이동' }} <span v-if="state === 'ready'" class="ml-1 text-base font-semibold text-ink-subtle tabular">{{ sorted.length }}개</span></h1>
          <p v-if="q.date" class="mt-0.5 text-sm text-ink-muted">{{ fmtDay(q.date, true) }} 이용 · {{ pax }}명</p>
        </div>
        <label class="flex items-center gap-2 text-sm text-ink-muted">
          <span class="hidden sm:inline">정렬</span>
          <select :value="q.sort" class="rounded-xl border border-line bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-ink focus:border-primary focus:outline-none" @change="patch({ sortBy: ($event.target as HTMLSelectElement).value === 'price_asc' ? '' : ($event.target as HTMLSelectElement).value })">
            <option v-for="s in SORTS" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <p class="mb-3 flex items-start gap-1.5 text-xs text-ink-subtle"><AppIcon name="check" :size="14" class="mt-px" />표시 요금은 차량 1대 편도 참고가이며 세금 10%가 별도로 붙어요. 최종 금액은 결제 전 확인 화면에서 확정돼요.</p>
      <p v-if="state === 'ready' && hiddenBySize" class="mb-3 rounded-xl bg-surface-sunken px-4 py-2.5 text-sm text-ink-muted">{{ pax }}명이 탈 수 없는 소형 차량 {{ hiddenBySize }}대는 목록에서 뺐어요.</p>

      <ResultsState :state="state" :count="sorted.length" icon="transfer" :empty-title="hiddenBySize ? `${pax}명이 함께 탈 수 있는 차량이 없어요` : '조건에 맞는 공항 이동 상품이 없어요'" :empty-hint="hiddenBySize ? '인원을 나눠 두 대로 예약하거나 인원을 줄여 보세요.' : '공항 이름을 확인하거나 목적지 없이 검색해 보세요.'" error-title="공항 이동 상품을 불러오지 못했어요" @retry="load">
        <template #empty-actions><button v-if="q.destination" type="button" class="btn-secondary" @click="patch({ destination: '', dest: '' })">목적지 없이 보기</button></template>
        <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="t in sorted" :key="t.id">
            <article class="card group relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-pop">
              <SmartImg :src="t.image_url" :alt="t.service_title" icon="transfer" img-class="aspect-[16/10] w-full object-cover" />
              <div class="flex flex-1 flex-col p-4">
                <p class="text-xs font-semibold text-primary">{{ t.airport_code }} 출발</p>
                <h2 class="mt-0.5 font-bold leading-snug text-ink"><NuxtLink :to="detailLink(t)" class="after:absolute after:inset-0 group-hover:text-primary">{{ t.service_title }}</NuxtLink></h2>
                <p v-if="t.destination_area" class="mt-2 flex items-start gap-1 text-xs text-ink-muted"><AppIcon name="map-pin" :size="14" class="mt-px text-ink-subtle" /><span class="line-clamp-2">{{ t.destination_area }}</span></p>
                <ul class="mt-2 flex flex-wrap gap-1.5 text-xs text-ink-muted">
                  <li v-if="t.max_passengers" class="flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5"><AppIcon name="users" :size="12" />최대 {{ t.max_passengers }}명</li>
                  <li v-if="t.max_luggage" class="flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5"><AppIcon name="briefcase" :size="12" />수하물 {{ t.max_luggage }}개</li>
                  <li v-if="Number(t.flight_tracking)" class="rounded-md bg-surface-sunken px-2 py-0.5">항공편 추적</li>
                </ul>
                <div class="mt-auto flex items-end justify-between gap-2 border-t border-line pt-3">
                  <div><p class="text-lg font-extrabold text-ink tabular">{{ currency.formatKRW(t.price_krw) }}</p><p class="text-2xs text-ink-subtle">차량 1대 편도</p></div>
                  <button v-if="t.bookable !== false && q.date" type="button" class="btn-primary relative z-[1]" @click="book(t)">선택</button>
                  <span v-else-if="t.bookable === false" class="text-xs font-semibold text-warning">직접 예약 불가</span>
                </div>
              </div>
            </article>
          </li>
        </ul>
      </ResultsState>
    </div>
  </div>
</template>
