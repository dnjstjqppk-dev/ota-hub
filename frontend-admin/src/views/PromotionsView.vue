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
    <PageHeader title="프로모션" description="할인 코드를 켜고 꺼요. 코드는 견적 단계에서 서버가 검증해 적용해요." />
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
      <p class="mt-2 text-2xs text-ink-subtle">새 코드 발급은 아직 화면에서 지원하지 않아요.</p>
    </StatePanel>
  </div>
</template>
