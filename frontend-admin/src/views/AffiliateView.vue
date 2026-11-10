<script setup lang="ts">
/**
 * Affiliate funnel (GET /admin/affiliate/summary|clicks|conversions) plus the
 * partner registry (#24: POST/PATCH /admin/affiliate/partners).
 * Clicks are written by /out/* redirects, conversions by signed postbacks; the
 * registry tab registers partners and rotates their postback secrets. Secrets
 * are write-only — the list never shows them, so a new secret is displayed
 * exactly once at creation/rotation time.
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { krw, dateTime } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'
import PageNav from '../components/PageNav.vue'

const route = useRoute()
const router = useRouter()
const qv = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
function patch(change: Record<string, string>) {
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...change })) if (typeof v === 'string' && v) next[k] = v
  router.replace({ query: next })
}
const tab = computed(() => (qv('tab') === 'conversions' ? 'conversions' : qv('tab') === 'partners' ? 'partners' : 'clicks'))
const q = computed(() => qv('q'))
const partner = computed(() => qv('partner'))
const status = computed(() => qv('status'))
const page = computed(() => Math.max(1, parseInt(qv('page') || '1', 10) || 1))
const draft = ref(q.value)
watch(q, (v) => { draft.value = v })

const summary = useResource(async () => (await api('/admin/affiliate/summary')).summary || { clicks: 0, conversions: 0, gmv: 0, commission: 0 },
  { clicks: 0, conversions: 0, gmv: 0, commission: 0 } as any)
const total = ref(0)
const totalPages = ref(1)
const list = useResource(async () => {
  const p = new URLSearchParams()
  if (q.value) p.set('q', q.value)
  if (partner.value) p.set('partner', partner.value)
  if (status.value) p.set('status', status.value)
  p.set('page', String(page.value))
  p.set('pageSize', '20')
  const j = await api(`/admin/affiliate/${tab.value}?${p}`)
  total.value = j.total || 0
  totalPages.value = j.totalPages || 1
  return (tab.value === 'clicks' ? j.clicks : j.conversions) || []
}, [] as any[])
watch([tab, q, partner, status, page], () => { if (tab.value === 'partners') partners.reload(); else list.reload() })
onMounted(() => { summary.reload(); list.reload(); partners.reload() })

// #24: partner registry.
const partners = useResource(async () => (await api('/admin/affiliate/partners')).partners || [], [] as any[])
const pform = reactive({ partnerId: '', name: '', deepLinkTemplate: 'https://', affiliateId: '', secretKey: '' })
const pbusy = ref(false)
const lastSecret = ref<{ id: string; secret: string } | null>(null)
function genSecret() {
  pform.secretKey = `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`.slice(0, 48)
}
async function registerPartner() {
  if (!pform.partnerId.trim() || !pform.name.trim() || !pform.affiliateId.trim()) { toast('제휴사 ID·이름·어필리에이트 ID를 입력해 주세요.', 'danger', 6000); return }
  if (!pform.secretKey) genSecret()
  pbusy.value = true
  try {
    const r = await api('/admin/affiliate/partners', { method: 'POST', json: { partnerId: pform.partnerId.trim(), name: pform.name.trim(), deepLinkTemplate: pform.deepLinkTemplate.trim(), affiliateId: pform.affiliateId.trim(), secretKey: pform.secretKey } })
    lastSecret.value = { id: r.id, secret: pform.secretKey }
    pform.partnerId = ''; pform.name = ''; pform.deepLinkTemplate = 'https://'; pform.affiliateId = ''; pform.secretKey = ''
    toast(`제휴사 '${r.id}'를 등록했어요. 시크릿은 지금 한 번만 표시됩니다.`)
    partners.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { pbusy.value = false }
}
async function togglePartner(p: any) {
  pbusy.value = true
  try {
    await api(`/admin/affiliate/partners/${encodeURIComponent(p.partner_id)}`, { method: 'PATCH', json: { isActive: !p.is_active } })
    toast(`제휴사 '${p.partner_id}'를 ${p.is_active ? '비활성화' : '활성화'}했어요.`)
    partners.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { pbusy.value = false }
}
async function rotateSecret(p: any) {
  if (!confirm(`'${p.partner_id}'의 포스트백 시크릿을 교체할까요? 기존 키로 서명한 전환은 즉시 거부됩니다.`)) return
  const secret = `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`.slice(0, 48)
  pbusy.value = true
  try {
    await api(`/admin/affiliate/partners/${encodeURIComponent(p.partner_id)}`, { method: 'PATCH', json: { secretKey: secret } })
    lastSecret.value = { id: p.partner_id, secret }
    toast('시크릿을 교체했어요. 새 키는 지금 한 번만 표시됩니다.')
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { pbusy.value = false }
}

const CLICK_STATUS = ['', 'CLICKED', 'REDIRECTED', 'CONVERTED', 'EXPIRED']
const CONV_STATUS = ['', 'CONFIRMED', 'PENDING', 'REJECTED', 'REVERSED']
function statusTone(s: string) {
  if (s === 'CONVERTED' || s === 'CONFIRMED') return 'success'
  if (s === 'REJECTED' || s === 'REVERSED' || s === 'EXPIRED') return 'danger'
  return 'neutral'
}
const convRate = computed(() => {
  const s = summary.data.value
  return s.clicks ? ((s.conversions / s.clicks) * 100).toFixed(1) : '0.0'
})
</script>

<template>
  <div>
    <PageHeader title="제휴 전환" description="아웃링크 클릭부터 제휴사 확정 전환까지의 퍼널을 조회해요." />

    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="rounded-card border border-line bg-surface p-4"><p class="text-2xs text-ink-subtle">클릭</p><p class="text-xl font-black tabular text-ink">{{ summary.data.value.clicks }}</p></div>
      <div class="rounded-card border border-line bg-surface p-4"><p class="text-2xs text-ink-subtle">전환 ({{ convRate }}%)</p><p class="text-xl font-black tabular text-ink">{{ summary.data.value.conversions }}</p></div>
      <div class="rounded-card border border-line bg-surface p-4"><p class="text-2xs text-ink-subtle">전환 GMV</p><p class="text-xl font-black tabular text-ink">{{ krw(summary.data.value.gmv) }}</p></div>
      <div class="rounded-card border border-line bg-surface p-4"><p class="text-2xs text-ink-subtle">예상 커미션</p><p class="text-xl font-black tabular text-ink">{{ krw(summary.data.value.commission) }}</p></div>
    </div>

    <div class="mb-4 flex gap-1.5" role="group" aria-label="제휴 화면">
      <button type="button" class="chip" :aria-pressed="tab === 'clicks'" @click="patch({ tab: '', page: '' })">클릭 로그</button>
      <button type="button" class="chip" :aria-pressed="tab === 'conversions'" @click="patch({ tab: 'conversions', page: '' })">전환 로그</button>
      <button type="button" class="chip" :aria-pressed="tab === 'partners'" @click="patch({ tab: 'partners', page: '' })">제휴사 등록</button>
    </div>

    <div v-if="tab === 'partners'" class="mb-4 space-y-4">
      <div v-if="lastSecret" class="rounded-card border border-warning bg-warning-soft p-4" role="status">
        <p class="text-sm font-black text-ink">'{{ lastSecret.id }}' 시크릿 (지금 한 번만 표시돼요. 잃어버리면 교체하세요.)</p>
        <p class="mt-1 select-all font-mono text-sm font-bold text-ink">{{ lastSecret.secret }}</p>
        <button type="button" class="mt-2 text-xs font-bold text-primary underline" @click="lastSecret = null">닫기</button>
      </div>
      <form class="rounded-card border border-line bg-surface p-4" @submit.prevent="registerPartner">
        <p class="mb-3 text-sm font-black text-ink">새 제휴사 등록</p>
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label class="block"><span class="field-label">제휴사 ID (소문자·숫자·-_)</span><input v-model="pform.partnerId" class="input mt-1 w-full" placeholder="klook" autocomplete="off" /></label>
          <label class="block"><span class="field-label">이름</span><input v-model="pform.name" class="input mt-1 w-full" placeholder="Klook" /></label>
          <label class="block lg:col-span-2"><span class="field-label">딥링크 템플릿 (https, {click_id}·{item_id} 치환)</span><input v-model="pform.deepLinkTemplate" class="input mt-1 w-full font-mono text-xs" placeholder="https://www.klook.com/ko/activity/{item_id}/?aid=38291&aff_sub={click_id}" /></label>
          <label class="block"><span class="field-label">어필리에이트 ID</span><input v-model="pform.affiliateId" class="input mt-1 w-full" placeholder="AID-KLOOK-38291" autocomplete="off" /></label>
          <label class="block"><span class="field-label">포스트백 시크릿 (24자 이상, 비워두면 자동 생성)</span>
            <span class="mt-1 flex gap-2"><input v-model="pform.secretKey" class="input w-full font-mono text-xs" placeholder="자동 생성됨" autocomplete="off" /><button type="button" class="btn-secondary shrink-0" @click="genSecret">생성</button></span>
          </label>
        </div>
        <button type="submit" class="btn-primary mt-4" :disabled="pbusy">{{ pbusy ? '등록 중…' : '제휴사 등록' }}</button>
      </form>
      <StatePanel :state="partners.state.value" :error="partners.error.value" :empty="!partners.data.value.length" empty-text="등록된 제휴사가 없어요." @retry="partners.reload()">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>제휴사 ID</th><th>이름</th><th>어필리에이트 ID</th><th>상태</th><th>수정 시각</th><th class="text-right">관리</th></tr></thead>
            <tbody>
              <tr v-for="p in partners.data.value" :key="p.partner_id">
                <td class="font-mono text-xs">{{ p.partner_id }}</td>
                <td class="font-medium">{{ p.name }}</td>
                <td class="font-mono text-xs text-ink-muted">{{ p.affiliate_id }}</td>
                <td><StatusBadge :tone="p.is_active ? 'success' : 'neutral'" :label="p.is_active ? 'ACTIVE' : 'INACTIVE'" /></td>
                <td class="whitespace-nowrap text-xs text-ink-muted">{{ dateTime(p.updated_at) }}</td>
                <td class="whitespace-nowrap text-right">
                  <button type="button" class="btn-ghost text-xs" :disabled="pbusy" @click="togglePartner(p)">{{ p.is_active ? '비활성화' : '활성화' }}</button>
                  <button type="button" class="btn-ghost text-xs" :disabled="pbusy" @click="rotateSecret(p)">시크릿 교체</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </StatePanel>
    </div>

    <div v-else class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="lg:w-72">
        <label class="sr-only" for="affiliate-search">로그 검색</label>
        <input id="affiliate-search" v-model="draft" type="search" placeholder="클릭·주문 ID, 제휴사" class="input w-full" @keydown.enter="patch({ q: draft.trim(), page: '' })" @change="patch({ q: draft.trim(), page: '' })" />
      </div>
      <input :value="partner" type="text" placeholder="제휴사 코드 (예: klook)" aria-label="제휴사 코드" class="input lg:w-52" @change="(e) => patch({ partner: (e.target as HTMLInputElement).value.trim(), page: '' })" />
      <select :value="status" aria-label="상태" class="input lg:w-40" @change="(e) => patch({ status: (e.target as HTMLSelectElement).value, page: '' })">
        <option v-for="s in (tab === 'clicks' ? CLICK_STATUS : CONV_STATUS)" :key="s" :value="s">{{ s || '전체 상태' }}</option>
      </select>
    </div>

    <StatePanel v-if="tab !== 'partners'" :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="조건에 맞는 로그가 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table v-if="tab === 'clicks'" class="table">
          <thead><tr><th>클릭 ID</th><th>상품</th><th>제휴사</th><th>서브 ID</th><th>상태</th><th>발생 시각</th></tr></thead>
          <tbody>
            <tr v-for="c in list.data.value" :key="c.click_id">
              <td class="font-mono text-xs">{{ c.click_id }}</td>
              <td><p class="max-w-[260px] truncate font-medium">{{ c.item_title || c.item_id }}</p><p class="font-mono text-2xs text-ink-subtle">{{ c.domain_type }} · {{ c.item_id }}</p></td>
              <td class="font-mono text-xs">{{ c.partner_name }}</td>
              <td class="font-mono text-xs text-ink-muted">{{ c.sub_id || '—' }}</td>
              <td><StatusBadge :tone="statusTone(c.status)" :label="c.status" /></td>
              <td class="whitespace-nowrap text-xs text-ink-muted">{{ dateTime(c.created_at) }}</td>
            </tr>
          </tbody>
        </table>
        <table v-else class="table">
          <thead><tr><th>제휴 주문번호</th><th>제휴사</th><th class="text-right">결제액</th><th class="text-right">커미션</th><th>상태</th><th>발생 시각</th></tr></thead>
          <tbody>
            <tr v-for="c in list.data.value" :key="c.id">
              <td><p class="font-mono text-xs">{{ c.order_id }}</p><p class="font-mono text-2xs text-ink-subtle">{{ c.click_id }}</p></td>
              <td class="font-mono text-xs">{{ c.partner_name }}</td>
              <td class="text-right font-semibold tabular">{{ krw(c.amount) }} <span class="text-2xs text-ink-subtle">{{ c.currency }}</span></td>
              <td class="text-right font-semibold tabular">{{ krw(c.commission) }}</td>
              <td><StatusBadge :tone="statusTone(c.status)" :label="c.status" /></td>
              <td class="whitespace-nowrap text-xs text-ink-muted">{{ dateTime(c.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <PageNav :page="page" :total-pages="totalPages" :total="total" @go="(p) => patch({ page: p === 1 ? '' : String(p) })" />
    </StatePanel>
  </div>
</template>
