<script setup lang="ts">
/**
 * Coupons (design system "Horizon"). Shows only coupons the user actually claimed (GET /user/coupons) and
 * promotions that are live and not yet claimed. Claiming goes through the server, which rejects unknown,
 * expired or duplicate codes — the page shows that answer verbatim instead of inventing a coupon.
 */
import { computed, ref } from 'vue'
import { apiFetch, formatKrw } from '~/composables/useApi'

useHead({ title: '쿠폰' })
const mine = ref<any[]>([])
const available = ref<any[]>([])
const state = ref<'loading' | 'ready' | 'error'>('loading')
const code = ref('')
const busy = ref('')
const msg = ref<{ ok: boolean; text: string } | null>(null)

async function load() {
  state.value = 'loading'
  const r = await apiFetch('/user/coupons')
  if (!r.ok) { state.value = 'error'; return }
  mine.value = r.data.coupons || []
  const now = new Date().toISOString()
  available.value = (r.data.availablePromotions || []).filter((p: any) => (!p.valid_until || p.valid_until > now) && !String(p.title || '').includes('[테스트]'))
  state.value = 'ready'
}
const claimable = computed(() => available.value.filter((p) => !mine.value.some((c) => c.coupon_code === p.code)))

async function claim(c: string) {
  const v = c.trim().toUpperCase()
  if (!v) return
  busy.value = v; msg.value = null
  const r = await apiFetch('/user/coupons/claim', { method: 'POST', body: { code: v } })
  busy.value = ''
  if (!r.ok) { msg.value = { ok: false, text: r.data.error || '쿠폰을 받지 못했어요.' }; return }
  msg.value = { ok: true, text: `‘${r.data.coupon?.title || v}’ 쿠폰을 받았어요. 결제할 때 코드 ${v}를 입력하면 적용돼요.` }
  code.value = ''
  await load()
}
const benefit = (c: any) => (c.discount_type === 'PERCENTAGE' ? `${c.discount_value}% 할인` : `${formatKrw(Number(c.discount_value))} 할인`)
function conditions(c: any) {
  return [c.max_discount_krw ? `최대 ${formatKrw(Number(c.max_discount_krw))}` : '', Number(c.min_order_amount_krw) ? `${formatKrw(Number(c.min_order_amount_krw))} 이상 결제 시` : '', c.valid_until ? `${String(c.valid_until).slice(0, 10)}까지` : '기한 없음'].filter(Boolean).join(' · ')
}
</script>

<template>
  <MyShell title="쿠폰" subtitle="받은 쿠폰은 결제 화면에서 코드를 입력하면 적용돼요." @ready="load">
    <form class="card flex flex-col gap-2 p-4 sm:flex-row" novalidate @submit.prevent="claim(code)">
      <label class="flex-1"><span class="sr-only">쿠폰 코드</span><input v-model="code" class="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm uppercase text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:shadow-focus" placeholder="쿠폰 코드 입력" /></label>
      <button type="submit" class="btn-primary" :disabled="!code.trim() || !!busy">쿠폰 받기</button>
    </form>
    <p v-if="msg" :class="['mt-3 rounded-xl px-4 py-2.5 text-sm font-medium', msg.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger']" :role="msg.ok ? 'status' : 'alert'">{{ msg.text }}</p>

    <h2 class="mb-3 mt-8 text-lg font-bold text-ink">내 쿠폰</h2>
    <ResultsState :state="state" :count="mine.length" icon="gift" empty-title="받은 쿠폰이 없어요" :empty-hint="claimable.length ? '아래에서 지금 받을 수 있는 쿠폰을 확인해 보세요.' : ''" error-title="쿠폰을 불러오지 못했어요" @retry="load">
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="c in mine" :key="c.id" class="card flex overflow-hidden">
          <div class="flex w-28 shrink-0 flex-col items-center justify-center bg-primary-soft px-3 text-center text-primary"><span class="text-lg font-extrabold leading-tight">{{ benefit(c) }}</span></div>
          <div class="min-w-0 flex-1 p-4">
            <p class="font-semibold text-ink">{{ c.title }}</p>
            <p class="mt-1 text-xs text-ink-muted">{{ conditions(c) }}</p>
            <p class="mt-2 text-xs text-ink-subtle">코드 <b class="tabular text-ink">{{ c.coupon_code }}</b></p>
          </div>
        </li>
      </ul>
    </ResultsState>

    <template v-if="state === 'ready' && claimable.length">
      <h2 class="mb-3 mt-8 text-lg font-bold text-ink">지금 받을 수 있는 쿠폰</h2>
      <ul class="grid gap-3 sm:grid-cols-2">
        <li v-for="p in claimable" :key="p.id" class="card flex items-center gap-4 p-4">
          <div class="min-w-0 flex-1">
            <p class="font-semibold text-ink">{{ p.title }}</p>
            <p class="mt-1 text-xs text-ink-muted">{{ benefit(p) }} · {{ conditions(p) }}</p>
          </div>
          <button type="button" class="btn-secondary shrink-0" :disabled="busy === p.code" @click="claim(p.code)">받기</button>
        </li>
      </ul>
    </template>
  </MyShell>
</template>
