<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { CATEGORIES, SUPPORT_LINKS } from '~/config/navigation'
import { useCompany } from '~/composables/useCompany'

const year = new Date().getFullYear()
const co = useCompany()
</script>

<template>
  <footer class="mt-24 border-t border-line bg-surface pb-28 pt-14 md:pb-12">
    <div class="mx-auto max-w-7xl px-4 lg:px-6">
      <div class="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div class="max-w-sm space-y-4">
          <NuxtLink to="/" class="inline-block" :title="BRAND.name">
            <img src="/logo.svg" alt="getfortrip" class="h-8 w-auto dark:hidden" width="132" height="32" />
            <img src="/logo-white.svg" alt="getfortrip" class="hidden h-8 w-auto dark:block" width="132" height="32" />
          </NuxtLink>
          <p class="text-sm leading-relaxed text-ink-muted">항공권부터 호텔, 현지 이동까지. 결제 전 최종 금액을 확정하고, 공급사 확정이 끝난 예약만 확정으로 안내합니다.</p>
          <a :href="`mailto:${BRAND.supportEmail}`" class="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-primary">
            <AppIcon name="mail" :size="18" />{{ BRAND.supportEmail }}
          </a>
        </div>

        <nav aria-label="여행 상품">
          <h2 class="mb-4 text-sm font-bold text-ink">여행 상품</h2>
          <ul class="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm text-ink-muted md:grid-cols-1">
            <li v-for="c in CATEGORIES" :key="c.key"><NuxtLink :to="c.to" class="hover:text-primary">{{ c.label }}</NuxtLink></li>
          </ul>
        </nav>

        <nav aria-label="고객 지원">
          <h2 class="mb-4 text-sm font-bold text-ink">고객 지원</h2>
          <ul class="space-y-2.5 text-sm text-ink-muted">
            <li v-for="l in SUPPORT_LINKS" :key="l.to"><NuxtLink :to="l.to" class="hover:text-primary">{{ l.label }}</NuxtLink></li>
            <li><NuxtLink to="/my/bookings" class="hover:text-primary">예약 조회</NuxtLink></li>
            <li><NuxtLink to="/safety" class="hover:text-primary">안전 여행 가이드</NuxtLink></li>
          </ul>
        </nav>

        <nav aria-label="회사">
          <h2 class="mb-4 text-sm font-bold text-ink">getfortrip</h2>
          <ul class="space-y-2.5 text-sm text-ink-muted">
            <li><NuxtLink to="/about" class="hover:text-primary">회사 소개</NuxtLink></li>
            <li><NuxtLink to="/news" class="hover:text-primary">뉴스룸</NuxtLink></li>
            <li><NuxtLink to="/careers" class="hover:text-primary">채용</NuxtLink></li>
            <li><a :href="BRAND.partnerConsoleUrl" class="inline-flex items-center gap-1 hover:text-primary">파트너 콘솔 <AppIcon name="external" :size="14" /></a></li>
          </ul>
        </nav>
      </div>

      <div class="mt-12 flex flex-col gap-4 border-t border-line pt-6 text-xs leading-relaxed text-ink-subtle md:flex-row md:items-start md:justify-between">
        <div class="space-y-1">
          <p>{{ co.orPending(co.name || BRAND.companyName) }} · 대표 {{ co.orPending(co.ceo) }} · {{ co.orPending(co.address) }}</p>
          <p>사업자등록번호 {{ co.orPending(co.bizNo) }} · 통신판매업 신고 {{ co.orPending(co.mailOrderNo) }} · 여행업 등록 {{ co.orPending(co.travelNo) }}</p>
          <p>영업보증보험 {{ co.orPending(co.insurance) }} · 호스팅 제공 {{ co.hosting }}</p>
          <p>고객센터 {{ co.orPending(co.csPhone) }} ({{ co.orPending(co.csHours) }}) · {{ BRAND.supportEmail }}</p>
          <p>결제는 결제대행(PG)사를 통해 처리되며, getfortrip은 카드 번호를 저장하지 않습니다. 외화 표시는 참고용 환산 금액입니다.</p>
          <p>판매 형태에 따라 계약 당사자가 달라요. 회사 직판 상품은 회사가 판매자이고, 중개 상품은 공급사가 판매자이며 회사는 통신판매를 중개하고, 제휴 링크로 이동한 거래는 해당 제휴사의 약관이 적용됩니다. 주문별 판매 형태는 예약 상세에서 확인해 주세요.</p>
          <p>© {{ year }} {{ co.orPending(co.name || BRAND.companyName) }}</p>
        </div>
        <div class="flex shrink-0 gap-5 font-medium text-ink-muted">
          <NuxtLink to="/terms" class="hover:text-ink">이용약관</NuxtLink>
          <NuxtLink to="/privacy" class="font-bold text-ink hover:text-primary">개인정보 처리방침</NuxtLink>
          <NuxtLink to="/cookies" class="hover:text-ink">쿠키 설정</NuxtLink>
        </div>
      </div>
    </div>
  </footer>
</template>
