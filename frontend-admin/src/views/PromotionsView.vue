<script setup lang="ts">
/**
 * Promotion codes (GET /admin/promotions, PATCH /admin/promotions/:id). Codes are applied by the quote
 * engine (worker/src/services/booking-service.ts), so turning one off stops new quotes from using it.
 */
import { onMounted, ref } from 'vue'
import { api, toast } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateOnly, krw, num } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'
import StatusBadge from '../components/StatusBadge.vue'

const list = useResource(async () => (await api('/admin/promotions')).promotions || [], [] as any[])
onMounted(list.reload)

const now = Date.now()
const expired = (p: any) => !!p.valid_until && Date.parse(p.valid_until) < now
const notStarted = (p: any) => !!p.valid_from && Date.parse(p.valid_from) > now
function state(p: any): { label: string; tone: any } {
  if (!p.is_active) return { label: '꺼짐', tone: 'neutral' }
  if (expired(p)) return { label: '기간 만료', tone: 'neutral' }
  if (notStarted(p)) return { label: '시작 전', tone: 'info' }
  return { label: '사용 가능', tone: 'success' }
}
const benefit = (p: any) => (p.discount_type === 'PERCENTAGE' ? `${num(p.discount_value)}% 할인${p.max_discount_krw ? ` (최대 ${krw(p.max_discount_krw)})` : ''}` : `${krw(p.discount_value)} 할인`)

const showCreate = ref(false)
const form = ref({ code: '', title: '', discountType: 'FIXED_AMOUNT', discountValue: '', minOrderAmountKrw: '', maxDiscountKrw: '', validFrom: '', validUntil: '' })
const createBusy = ref(false)
const createError = ref('')

function openCreate() {
  form.value = { code: '', title: '', discountType: 'FIXED_AMOUNT', discountValue: '', minOrderAmountKrw: '', maxDiscountKrw: '', validFrom: '', validUntil: '' }
  createError.value = ''
  showCreate.value = true
}

async function create() {
  createBusy.value = true
  createError.value = ''
  try {
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    await api('/admin/promotions', {
      method: 'POST',
      json: {
        code: form.value.code,
        title: form.value.title,
        discountType: form.value.discountType,
        discountValue: num(form.value.discountValue),
        minOrderAmountKrw: num(form.value.minOrderAmountKrw),
        maxDiscountKrw: num(form.value.maxDiscountKrw),
        validFrom: form.value.validFrom || undefined,
        validUntil: form.value.validUntil || undefined
      }
    })
    toast(`${form.value.code.toUpperCase()} 코드를 발급했어요.`)
    showCreate.value = false
    list.reload()
  } catch (e) { createError.value = (e as Error).message } finally { createBusy.value = false }
}

const busy = ref('')
async function toggle(p: any) {
  const next = !p.is_active
  if (!confirm(`${p.code} 코드를 ${next ? '켤까요' : '끌까요'}? ${next ? '' : '이후 새 견적에서 이 코드를 쓸 수 없어요.'}`)) return
  busy.value = p.id
  try {
    await api(`/admin/promotions/${encodeURIComponent(p.id)}`, { method: 'PATCH', json: { isActive: next } })
    toast(`${p.code}를 ${next ? '켰어요' : '껐어요'}.`)
    list.reload()
  } catch (e) { toast((e as Error).message, 'danger') } finally { busy.value = '' }
}
</script>

<template>
  <div>
    <PageHeader title="프로모션" description="할인 코드를 발급하고 켜고 꺼요. 코드는 견적 단계에서 서버가 검증해 적용해요.">
      <button type="button" class="btn-primary btn-sm" @click="openCreate">새 코드 발급</button>
    </PageHeader>
    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="등록된 프로모션이 없어요." @retry="list.reload()">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>코드</th><th>혜택</th><th class="text-right">최소 주문</th><th>기간</th><th>상태</th><th class="w-px"></th></tr></thead>
          <tbody>
            <tr v-for="p in list.data.value" :key="p.id">
              <td><p class="font-mono font-semibold">{{ p.code }}</p><p class="max-w-[280px] truncate text-2xs text-ink-subtle">{{ p.title }}</p></td>
              <td class="text-sm">{{ benefit(p) }}</td>
              <td class="text-right tabular">{{ p.min_order_amount_krw ? krw(p.min_order_amount_krw) : '—' }}</td>
              <td class="whitespace-nowrap text-xs tabular">{{ dateOnly(p.valid_from) }} ~ {{ dateOnly(p.valid_until) }}</td>
              <td><StatusBadge v-bind="state(p)" /></td>
              <td><button type="button" class="btn-secondary btn-sm" :disabled="busy === p.id" @click="toggle(p)">{{ p.is_active ? '끄기' : '켜기' }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </StatePanel>
    <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="새 프로모션 코드 발급">
      <form class="card w-full max-w-md space-y-4 p-6" @submit.prevent="create">
        <h2 class="text-base font-bold text-ink">새 코드 발급</h2>
        <p v-if="createError" class="rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger" role="alert">{{ createError }}</p>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="promo-code">코드 *</label><input id="promo-code" v-model="form.code" class="input font-mono uppercase" required minlength="4" maxlength="32" placeholder="SUMMER-10" /></div>
          <div><label class="label" for="promo-title">제목 *</label><input id="promo-title" v-model="form.title" class="input" required maxlength="200" placeholder="여름 성수기 할인" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="promo-type">할인 방식</label><select id="promo-type" v-model="form.discountType" class="input"><option value="FIXED_AMOUNT">정액 (원)</option><option value="PERCENTAGE">정률 (%)</option></select></div>
          <div><label class="label" for="promo-value">할인값 *</label><input id="promo-value" v-model="form.discountValue" type="number" min="0" step="any" class="input tabular" required placeholder="10000" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="promo-min">최소 주문금액 (원)</label><input id="promo-min" v-model="form.minOrderAmountKrw" type="number" min="0" step="any" class="input tabular" placeholder="0" /></div>
          <div><label class="label" for="promo-max">최대 할인액 (원)</label><input id="promo-max" v-model="form.maxDiscountKrw" type="number" min="0" step="any" class="input tabular" placeholder="0 = 상한 없음" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="label" for="promo-from">시작일</label><input id="promo-from" v-model="form.validFrom" type="date" class="input" /></div>
          <div><label class="label" for="promo-until">종료일</label><input id="promo-until" v-model="form.validUntil" type="date" class="input" /></div>
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary btn-sm" @click="showCreate = false">취소</button>
          <button type="submit" class="btn-primary btn-sm" :disabled="createBusy">{{ createBusy ? '발급 중…' : '발급하기' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
