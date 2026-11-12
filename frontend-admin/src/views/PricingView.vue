<script setup lang="ts">
/**
 * Exchange rates (GET /fx-rates). Payment is always in KRW; these rates only convert the KRW total into a
 * display currency, and each quote stores the rate it used (quotes.fx_rate_snapshot).
 */
import { computed, onMounted, ref } from 'vue'
import { api, toast } from '../composables/session'
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

// #85: manual rate edits (PUT /admin/fx-rates). Only changed rows are sent.
const edits = ref<Record<string, string>>({})
const saving = ref(false)
const changedRates = computed(() => list.data.value
  .filter((r: any) => {
    const raw = edits.value[r.currency]
    return raw !== undefined && raw.trim() !== '' && Number(raw) !== Number(r.rate_to_krw)
  })
  .map((r: any) => ({ currency: r.currency, symbol: r.symbol, rate_to_krw: Number(edits.value[r.currency]) })))
async function saveRates() {
  const rates = changedRates.value
  if (!rates.length) { toast('바뀐 환율이 없어요.', 'info'); return }
  const bad = rates.find((r) => !Number.isFinite(r.rate_to_krw) || r.rate_to_krw <= 0)
  if (bad) { toast(`${bad.currency} 환율은 0보다 큰 숫자여야 해요.`, 'danger'); return }
  saving.value = true
  try {
    const r = await api('/admin/fx-rates', { method: 'PUT', json: { rates } })
    toast(`${r.updated}개 통화 환율을 저장했어요.`)
    edits.value = {}
    await list.reload()
  } catch (e) { toast((e as Error).message, 'danger', 6000) } finally { saving.value = false }
}
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
              <td class="text-right">
                <input v-model="edits[r.currency]" :placeholder="String(r.rate_to_krw)" inputmode="decimal" class="input tabular !w-32 !py-1 text-right" :aria-label="`${r.currency} 환율`" />
              </td>
              <td class="text-right tabular">{{ conv(r.rate_to_krw) === null ? '—' : `${r.symbol}${conv(r.rate_to_krw)!.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}` }}</td>
              <td class="whitespace-nowrap text-xs text-ink-muted tabular">{{ dateTime(r.updated_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-3 flex items-center gap-3">
        <button type="button" class="btn-primary btn-sm" :disabled="saving || !changedRates.length" @click="saveRates">
          {{ saving ? '저장 중…' : `환율 저장${changedRates.length ? ` (${changedRates.length}건)` : ''}` }}
        </button>
        <p class="text-2xs text-ink-subtle">환율 자동 갱신은 아직 지원하지 않아요. 자금팀 고시값을 직접 입력해 저장하세요.</p>
      </div>
    </StatePanel>
  </div>
</template>
