<!-- frontend-user/pages/my/wishlist.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWishlistStore } from '~/stores/wishlist'
import { useCurrencyStore } from '~/stores/currency'
import { useAuthStore } from '~/stores/auth'

const wishlistStore = useWishlistStore()
const currencyStore = useCurrencyStore()
const authStore = useAuthStore()

const alertEmail = ref(authStore.user?.email || '')
const alertTarget = ref('도쿄 5성급 호텔 / 인천-나리타 왕복 항공권')
const alertPrice = ref(250000)
const alertSuccess = ref('')

onMounted(() => {
  wishlistStore.initWishlist()
  if (authStore.user?.email) {
    alertEmail.value = authStore.user.email
  }
})

const handleCreateAlert = async () => {
  if (!alertEmail.value || !alertTarget.value || alertPrice.value <= 0) return
  await wishlistStore.addPriceAlert({
    email: alertEmail.value,
    routeOrHotel: alertTarget.value,
    targetPrice: Number(alertPrice.value),
    currency: currencyStore.activeCurrency
  })
  alertSuccess.value = '최저가 가격 변동 알림이 정상 등록되었습니다!'
  setTimeout(() => { alertSuccess.value = '' }, 3000)
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-8 space-y-8">
    <div class="flex items-center justify-between border-b border-slate-200 pb-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <NuxtLink to="/my" class="hover:underline">마이 콘솔</NuxtLink> <span>›</span>
          <span class="text-slate-800 font-bold">위시리스트 & 최저가 알림</span>
        </div>
        <h1 class="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">찜한 여행 상품 & 최저가 알림 센터</h1>
      </div>
      <span class="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-black border border-rose-200">
        ❤️ 저장됨 {{ wishlistStore.count }}건
      </span>
    </div>

    <!-- 1. 찜한 상품 목록 -->
    <div class="space-y-4">
      <h2 class="text-lg font-black text-slate-900">내가 찜한 상품 (Wishlist)</h2>
      <div v-if="wishlistStore.items.length === 0" class="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-3">
        <div class="text-3xl">🤍</div>
        <div class="text-sm font-bold text-slate-800">아직 찜한 여행 상품이 없습니다.</div>
        <p class="text-xs text-slate-500">마음에 드는 호텔, 항공권, 투어 상품의 하트 아이콘을 눌러 저장해 보세요.</p>
        <div class="pt-2">
          <NuxtLink to="/hotels/list" class="inline-block px-5 py-2.5 bg-trip-blue text-white text-xs font-bold rounded-xl">
            인기 호텔 둘러보기 →
          </NuxtLink>
        </div>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div
          v-for="item in wishlistStore.items"
          :key="item.id"
          class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between p-5 space-y-4"
        >
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="px-2 py-0.5 bg-blue-50 text-trip-blue rounded text-[10px] font-black">{{ item.domainType }}</span>
              <button
                @click="wishlistStore.toggleWishlist(item)"
                class="text-xs text-rose-500 hover:underline font-bold"
              >
                ✕ 삭제
              </button>
            </div>
            <h3 class="font-black text-slate-900 text-base">{{ item.title }}</h3>
            <p v-if="item.subtitle" class="text-xs text-slate-500">{{ item.subtitle }}</p>
          </div>

          <div class="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div class="font-mono font-black text-lg text-trip-blue">
              {{ currencyStore.formatKRW(item.priceKrw || 250000) }}
            </div>
            <NuxtLink :to="item.targetUrl" class="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl">
              상세 보기 →
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 실시간 최저가 알림 (Price Alerts) -->
    <div class="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6">
      <div>
        <span class="px-2.5 py-0.5 bg-amber-50 text-amber-700 text-[11px] font-black rounded-full border border-amber-200">
          🔔 스마트 가격 추적기
        </span>
        <h2 class="text-xl font-black text-slate-900 mt-1">목표 가격 도달 시 즉시 이메일 알림 받기</h2>
        <p class="text-xs text-slate-500 mt-0.5">원하시는 항공 노선이나 호텔의 목표 금액을 설정하면 특가 발생 즉시 알려드립니다.</p>
      </div>

      <div v-if="alertSuccess" class="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold">
        ✓ {{ alertSuccess }}
      </div>

      <form @submit.prevent="handleCreateAlert" class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
        <input
          v-model="alertEmail"
          type="email"
          required
          placeholder="수신 이메일 (예: user@getfortrip.com)"
          class="p-3 border border-slate-200 rounded-xl font-medium"
        />
        <input
          v-model="alertTarget"
          type="text"
          required
          placeholder="노선 또는 호텔명 (예: 도쿄 하얏트)"
          class="p-3 border border-slate-200 rounded-xl font-medium md:col-span-2"
        />
        <div class="flex gap-2">
          <input
            v-model="alertPrice"
            type="number"
            min="1000"
            required
            placeholder="목표가(KRW)"
            class="w-full p-3 border border-slate-200 rounded-xl font-mono font-bold"
          />
          <button type="submit" class="px-4 py-3 bg-trip-blue hover:bg-blue-600 text-white font-black rounded-xl whitespace-nowrap">
            알림 등록
          </button>
        </div>
      </form>

      <div v-if="wishlistStore.alerts.length > 0" class="space-y-2 pt-2 border-t border-slate-100">
        <div
          v-for="al in wishlistStore.alerts"
          :key="al.id"
          class="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs"
        >
          <div>
            <span class="font-bold text-slate-900">{{ al.routeOrHotel }}</span>
            <span class="text-slate-400 ml-2">({{ al.email }})</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="font-mono font-bold text-emerald-600">목표가: {{ currencyStore.formatKRW(al.targetPrice) }}</span>
            <button @click="wishlistStore.removePriceAlert(al.id)" class="text-slate-400 hover:text-rose-500 font-bold">삭제</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
