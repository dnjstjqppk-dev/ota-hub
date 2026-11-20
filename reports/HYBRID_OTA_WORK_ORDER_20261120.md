# 하이브리드 OTA 수익화 파이프라인 구현 기록 (WORK ORDER, 2026-11-20)

## 0. 스택 정정 (작업 지시 대비 실측)
- 지시서는 Go Fiber + PostgreSQL + Nuxt 3을 전제했으나 실제 스택은
  **Cloudflare Workers + D1 + Nuxt 4** (`frontend-user` Nuxt ^4.6.1)이다.
- 전 페이즈를 실 스택 기준으로 구현했다. Go 코드는 오프라인 유틸리티 전용이다.

## 1. Phase별 구현 결과
- **P1 법무·결제 라우팅:** 푸터에서 `여행업 등록`·`영업보증보험` 2개 세그먼트 삭제,
  통신판매업 표기로 전환. `TradeTypeBadge.vue`(직접판매·즉시바우처 vs 제휴 연결),
  `checkout-modes.ts` + `strategies/` 4파일 전략 패턴
  (DIRECT_PG | AFFILIATE_REDIRECT | HYBRID_FILTERED).
  ACTIVITY는 `is_voucher_only=false`만 제휴 전환 (마이그레이션 0054).
- **P2 도매·무인발권:** `wholesale-{config,client,esim,voucher,pricing,artefacts}.ts`
  + `wholesale-verify.ts` (Pre-Checkout 500ms 검증, 드리프트 시 PRICE_CHANGED).
  기존 PG 웹훅→정산→발권 체인 승계, WHOLESALE_ISSUED 이메일 발송,
  `/my/bookings`에 LPA·PDF 링크 렌더링 (마이그레이션 0055).
- **P3 딥링크·Sub-ID:** `deeplink-params.ts`(정준 파라미터),
  `partner-links.ts`(6사 매핑 + HMAC Sub-ID),
  `dashboard.ts`(어드민 CVR·정산 대시보드), travelpayouts 시드 (0056).
  자체 결제창 3층 차단(견적 409 · 예약버튼 v-if · 체크아웃 가드).
- **P4–6 SEO·렌더·색인:** `useSeoPage.ts` 동적 head(canonical·hreflang·OG),
  `SeoFaq`·`SeoCompareTable`·`SeoImage` 시맨틱 컴포넌트,
  `/sitemap-index.xml` + 도메인별 분할, `/llms.txt`·`/llms-full.txt` 동적 라우트,
  IndexNow 큐 (0057), robots.txt 정비.

## 2. 직접 검증 (2026-11-20, 부모 세션)
- 신규 유닛 테스트 32/32 통과
  (`checkout-modes`·`wholesale`·`affiliate-deeplink`·`seo-phase`·`outlink`·`seo`).
- `tsc -p worker/tsconfig.json` clean, `check:branding` PASS(542파일).
  - 브랜딩 위반 1건(`partner-links.ts` 주석의 제휴사 직명 표기)을 수정 후 재통과.
  - 구 `.wrangler/tmp` 번들(재생성 가능 임시 파일) 삭제.
- 신규 25개 파일 줄 수: 21개 50~80줄, 4개 50줄 미만(Seo 3종·useOutlinkQuery),
  80줄 초과 0개.
- 푸터에 `여행업`·`보증보험`·`준비 중` 잔존 0건, SEO 라우트 배선 코드 확인.
- GOVERNANCE.md·BRANDING.md는 루트에 실존 (조사 보고의 `부존재` 서술은 오기).

## 3. 미완료·후속 (사업·운영 결정 필요)
- E2E(`api.e2e.mjs`, wrangler+D1 필요) 미실행, curl 실렌더 검증 미실행.
- eSIM 직판 게이트 유지 (사업 결정 후 전환), 도매·제휴 실계약값 미입력
  (벤더 base/key·SKU·마진, 파트너 marker/secret → 전부 unsellable/BLOCKED).
- 알림톡 sender 미구축(이메일만), QR은 텍스트+PDF 링크 표시.
- `EntitiesView`의 `travel_agency_license_no` 필수 요구 2건 잔존 (정책 결정 필요).
- 사업자 실값(상호·대표·사업자번호·통신판매업번호) 미확정.
