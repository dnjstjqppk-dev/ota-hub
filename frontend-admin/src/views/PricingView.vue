<script setup lang="ts">
/**
 * Exchange rates (GET /fx-rates). Payment is always in KRW; these rates only convert the KRW total into a
 * display currency, and each quote stores the rate it used (quotes.fx_rate_snapshot).
 */
import { computed, onMounted, ref } from 'vue'
import { api } from '../composables/session'
import { useResource } from '../composables/useResource'
import { dateTime, krw } from '../composables/format'
import PageHeader from '../components/PageHeader.vue'
import StatePanel from '../components/StatePanel.vue'

const list = useResource(async () => (await api('/fx-rates')).rates || [], [] as any[])
onMounted(list.reload)

const amount = ref('100000')
const krwAmount = computed(() => Math.max(0, Number(amount.value.replace(/,/g, '')) || 0))
const conv = (rate: number) => (Number(rate) > 0 ? krwAmount.value / Number(rate) : null)
const oldest = computed(() => list.data.value.map((r: any) => r.updated_at).filter(Boolean).sort()[0])
</script>

<template>
  <div>
    <PageHeader title="환율" description="결제는 항상 원화로 이뤄지고, 환율은 다른 통화로 금액을 보여줄 때만 써요. 견적마다 사용한 환율이 함께 저장돼요." />
    <StatePanel :state="list.state.value" :error="list.error.value" :empty="!list.data.value.length" empty-text="등록된 환율이 없어요." @retry="list.reload()">
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <div class="w-48">
          <label for="fx-amount" class="label">원화 금액으로 확인</label>
          <input id="fx-amount" v-model="amount" inputmode="numeric" class="input tabular" />
        </div>
        <p class="pb-2 text-xs text-ink-subtle">{{ krw(krwAmount) }} 기준 환산 · 가장 오래된 갱신 {{ dateTime(oldest) }}</p>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>통화</th><th class="text-right">1단위 = 원</th><th class="text-right">환산 금액</th><th>갱신</th></tr></thead>
          <tbody>
            <tr v-for="r in list.data.value" :key="r.currency">
              <td><span class="font-mono font-semibold">{{ r.currency }}</span> <span class="text-ink-subtle">{{ r.symbol }}</span></td>
              <td class="text-right tabular">{{ Number(r.rate_to_krw).toLocaleString('ko-KR', { maximumFractionDigits: 4 }) }}</td>
              <td class="text-right tabular">{{ conv(r.rate_to_krw) === null ? '—' : `${r.symbol}${conv(r.rate_to_krw)!.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}` }}</td>
              <td class="whitespace-nowrap text-xs text-ink-muted tabular">{{ dateTime(r.updated_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-2xs text-ink-subtle">환율 자동 갱신과 수정은 아직 지원하지 않아요.</p>
    </StatePanel>
  </div>
</template>
