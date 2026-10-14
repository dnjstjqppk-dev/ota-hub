<template>
  <footer class="bg-trip-navy text-slate-300 pt-16 pb-12 mt-20 border-t border-slate-800">
    <div class="max-w-7xl mx-auto px-4 space-y-12">
      <!-- 4열 링크 그리드 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 text-xs">
        <div class="space-y-3">
          <h4 class="text-white font-bold text-sm">트립닷컴 소개</h4>
          <ul class="space-y-2 text-slate-400">
            <li><a href="#" class="hover:text-white">회사 소개</a></li>
            <li><a href="#" class="hover:text-white">채용 정보</a></li>
            <li><a href="#" class="hover:text-white">뉴스룸</a></li>
            <li><a href="#" class="hover:text-white">지속 가능 여행</a></li>
          </ul>
        </div>

        <div class="space-y-3">
          <h4 class="text-white font-bold text-sm">고객 지원</h4>
          <ul class="space-y-2 text-slate-400">
            <li><NuxtLink to="/help" class="hover:text-white">24/7 고객센터</NuxtLink></li>
            <li><a href="#" class="hover:text-white">코로나19 여행 알림</a></li>
            <li><a href="#" class="hover:text-white">취소 및 환불 규정</a></li>
            <li><a href="#" class="hover:text-white">안전 여행 가이드</a></li>
          </ul>
        </div>

        <div class="space-y-3">
          <h4 class="text-white font-bold text-sm">파트너십</h4>
          <ul class="space-y-2 text-slate-400">
            <li><a href="#" class="hover:text-white">호텔 파트너 등록</a></li>
            <li><a href="#" class="hover:text-white">제휴 마케팅 프로그램</a></li>
            <li><a href="#" class="hover:text-white">기업 출장 관리 솔루션</a></li>
            <li><a href="#" class="hover:text-white">여행사 전용 포털</a></li>
          </ul>
        </div>

        <div class="space-y-3">
          <h4 class="text-white font-bold text-sm">보안 및 결제 인증</h4>
          <p class="text-slate-400 leading-relaxed text-[11px]">
            Trip.com은 IATA 공식 공인 여행사이며, PCI-DSS 레벨 1 최고 등급 보안 규격을 준수합니다.
          </p>
          <div class="flex flex-wrap gap-2 pt-2">
            <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">VISA</span>
            <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">Mastercard</span>
            <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">네이버페이</span>
            <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">카카오페이</span>
            <span class="px-2 py-1 bg-slate-800 rounded text-[10px] text-slate-300 font-bold">토스페이</span>
          </div>
        </div>
      </div>

      <!-- 하단 저작권 -->
      <div class="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
        <div>
          Copyright © 2026 Trip.com Travel Singapore Pte. Ltd. All rights reserved.
        </div>
        <div class="flex items-center gap-6">
          <a href="#" class="hover:text-slate-300">개인정보 처리방침</a>
          <a href="#" class="hover:text-slate-300">이용약관</a>
          <a href="#" class="hover:text-slate-300">쿠키 설정</a>
        </div>
      </div>
    </div>
  </footer>
</template>

