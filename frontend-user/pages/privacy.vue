<script setup lang="ts">
import { BRAND } from '~/config/brand'
const VERSION = '2.0'
const EFFECTIVE = '2026년 11월 7일'
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-12 space-y-8">
    <div class="space-y-2 border-b border-slate-200 dark:border-slate-700 pb-6">
      <span class="text-xs font-bold text-trip-blue">Privacy Policy · v{{ VERSION }}</span>
      <h1 class="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{{ BRAND.name }} 개인정보 처리방침</h1>
      <p class="text-xs text-slate-400">시행일: {{ EFFECTIVE }}</p>
    </div>

    <div class="prose prose-slate dark:prose-invert max-w-none text-xs leading-relaxed text-slate-700 dark:text-slate-200 space-y-6">
      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">1. 개인정보의 수집 및 이용 목적</h2>
        <p>
          {{ BRAND.name }} Inc.(이하 "회사")는 호텔, 항공권, 기차, 렌터카, 투어 상품 예약 및 발권, 본인 확인, 결제 및 정산, 고객 상담을 위해 최소한의 개인정보를 수집합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">2. 수집하는 개인정보 항목</h2>
        <ul class="list-disc list-inside space-y-1">
          <li><strong>회원 가입 시:</strong> 성명, 이메일 주소, 휴대전화번호, 비밀번호(암호화 저장)</li>
          <li><strong>여행 예약 및 발권 시:</strong> 탑승객/투숙객 영문 성명, 생년월일, 성별, 국적, 여권번호 및 만료일(국제선 항공권 등 필수 발권 시에 한함)</li>
          <li><strong>결제 시:</strong> 카드사명, 결제 승인 기록(신용카드 번호는 PCI-DSS 준수 PG사 토큰화 처리되어 회사 서버에 직접 저장되지 않음)</li>
          <li><strong>자동 수집:</strong> 접속 IP, 브라우저·기기 정보, 쿠키, 서비스 이용 기록(부정거래 탐지 및 품질 개선 목적)</li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">3. 개인정보의 제3자 제공</h2>
        <p>
          회사는 예약 이행을 위해 아래와 같이 개인정보를 제공합니다. 제공 항목: 예약자·탑승객 성명(영문 포함), 연락처, 예약번호, 여권 정보(항공 발권 시).
          제공받는 자: 예약된 상품의 항공사·호텔·철도·렌터카·현지 투어 공급사 및 결제대행사(토스페이먼츠).
          이용 목적: 예약 확정·발권·결제 승인. 보유·이용 기간: 각 수탁사의 이용약관 및 관계 법령에 따름.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">4. 개인정보의 보유 및 파기</h2>
        <ul class="list-disc list-inside space-y-1">
          <li><strong>예약·결제 기록:</strong> 전자상거래법상 5년 (계약·청약철회·대금결제·공급 기록)</li>
          <li><strong>소비자 불만·분쟁 처리 기록:</strong> 3년</li>
          <li><strong>접속 로그:</strong> 통신비밀보호법상 3개월</li>
          <li><strong>회원 정보:</strong> 회원 탈퇴 시 즉시 파기 (단, 위 법정 보존 항목 제외)</li>
        </ul>
        <p>
          보유 기간이 끝난 개인정보는 복구 불가능한 방법으로 지체 없이 파기합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">5. 쿠키 및 트래킹 로그 운영</h2>
        <p>
          회사는 로그인 유지·보안·예약 흐름 유지를 위한 필수 쿠키와, 이용자 편의를 위한 기능성 쿠키(통화·언어·최근 검색)를 사용합니다.
          제휴 링크 클릭 추적에는 개인 식별이 아닌 클릭 ID와 서브 ID만을 기록합니다. 상세 내용은 쿠키 정책을 따릅니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">6. 이용자의 권리와 행사 방법</h2>
        <p>
          이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요청할 수 있습니다.
          마이페이지 또는 고객센터 이메일({{ BRAND.supportEmail }})로 요청하시면 본인 확인 후 지체 없이 조치합니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">7. 기술적·관리적 보호 조치</h2>
        <p>
          회사는 이용자의 개인정보를 전송 구간 및 저장소 전반에서 TLS 256-bit 표준 암호화 알고리즘으로 보호하며, 침입탐지 시스템 및 데이터베이스 접근 권한 통제를 엄격히 시행하고 있습니다.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-black text-slate-900 dark:text-slate-100">8. 개인정보 보호책임자</h2>
        <p>
          개인정보 보호책임자: {{ BRAND.companyName }} 고객지원팀 · 연락처: {{ BRAND.supportEmail }}.
          그 밖에 개인정보 침해 신고는 개인정보보호위원회(privacy.go.kr)·한국인터넷진흥원(118)으로 하실 수 있습니다.
        </p>
      </section>
    </div>
  </div>
</template>
