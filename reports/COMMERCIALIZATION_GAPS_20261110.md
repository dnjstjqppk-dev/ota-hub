# OTA 상용화 갭 전수 목록 — 2026-11-10

> 방법: 8개 영역 병렬 감사(구현·테스트 본문 직접 열람) + 크리틱 반증(20건 기각·중복 제거, 1건 강등) + 합성.
> 입력 202건 → 생존 182건 (P0 12 · P1 57 · P2 76 · P3 37).
> 규모: [S] 소 / [M] 중 / [L] 대. `(직접확인)` = 본 세션이 코드 원문을 직접 재확인.
> 외부 블로커(키·계약·도메인·법무)는 [오픈 판정](OPEN_READINESS_20261109.md) §5 별도 유지.
> 추가: [ADDENDUM](COMMERCIALIZATION_GAPS_20261110_ADDENDUM.md) 26건(A·B·C).
>
> ## 조치 현황
>
> - **Phase 1 (`8a2a54a`)**: #1·#2 코인복원(`coinRestoreStmtsOnce`+FAILED 3경로), #3 정산void(`supplierGone`),
>   #6 수용량(0027 목시드 한정 백필+`assertInventoryConfigured`+어드민/등록), #4 캘린더(`default`+일자별 요금),
>   #5 safety 번호삭제. E2E 75→78, 유닛 64→66. tsc--noEmit 0·unit 66/66·E2E 78/78.
>   스위트-로트 수정(before 홀드정리, sql 재시도). ⚠ 운영 0027 적용 후 실수용량 검토 필요.
> - **Phase 2 (`806b37c`)**: #7 news 날조삭제, #8 신고번호 삭제, #9 about 재작성, #10·#11·#12 FAQ 정정,
>   번외 #28·#29 온보딩·#58 환불문구·#61 최저가문구(i18n 4종·SEO)·#124 푸터·C10 GDS 상수.
>   build-all 0·branding PASS.

## P0 — 출시 블로커 12건 (돈 유실·불법 표시·무제한 판매)

[x] (`8a2a54a`) 1. `worker/src/services/booking-service.ts:840` processRefund — 공급사/발권 실패·REJECT 전액환불 시 코인 미복원. 고객 코인(1=1원) 영구 유실 → processRefund 성공 배치에 복원 추가 [M] (직접확인)
[x] (`8a2a54a`) 2. `worker/src/services/booking-service.ts:680,1010` — FAILED 3경로(PG 금액불일치·중재 NOT_CAPTURED·미지급 REJECT) 홀드만 풀고 코인 미복원 → 3개 배치에 복원 추가 [M] (직접확인)
[x] (`8a2a54a`) 3. `worker/src/services/booking-service.ts:944,888` — 수수료/환불불가 취소 시 정산행 PENDING 전액 유지(전액환불만 void). 취소 건에 판매자 전액 지급 = 순손실 → 모든 공급사-취소 주문에 정산 void/감액 [M] (직접확인)
[x] (`8a2a54a`) 4. `frontend-partner/.../InventoryCalendarView.vue:97` — PUT이 unit_id='standard' 기록·price_override 전송하지만 서버는 exact/'default'만 읽고 override 미사용. 마감일 계속 판매 → 'default'/room id 기록 + override 반영 [M]
[x] (`8a2a54a`) 5. `frontend-user/pages/safety.vue:39-47` — 24/7 긴급데스크·1588-0000 허위 표시(실체는 티켓+mailto). 긴급전화 오표시 → 번호 삭제·실채널/시간 명시 [S]
[x] (`8a2a54a`) 6. `worker/src/services/catalog.ts:129-150` + `booking-service.ts:197-208` — ACTIVITY/TRANSFER/PACKAGE capacity=null이라 holdTargets=[]로 견적·예약 재고가드 전부 스킵. LIVE 시 무제한 유료 오버셀 → 일자별 수용량+원자적 홀드 또는 판매금지 유지 [L] (직접확인)
[x] (`806b37c`) 7. `frontend-user/pages/news.vue:9-24` — 날조 보도자료 3건(140만 직계약·B2B허브·GDS/철도 연동완료). 연동 실체 없음 → 삭제 또는 정직한 상태로 교체 [S]
[x] (`806b37c`) 8. `frontend-user/config/brand.ts:32` + 푸터 + terms — 통신판매업 신고번호를 기정사실 표시. 실체 근거 0 → 실등록 확인 전까지 삭제 [S]
[x] (`806b37c`) 9. `frontend-user/pages/about.vue:16,36-49` — 직접결제·100%보장·즉시PNR·24/7 허위. PENDING 모델·항공판매불가·티켓전용과 모순 → 실체대로 재작성 [S]
[x] (`806b37c`) 10. `frontend-user/pages/faq.vue:31-34` — 전카드+간편6종+다통화 허위(CARD-only·KRW·샌드박스) → CARD-only KRW + 미개통 상태 명시 [S]
[x] (`806b37c`) 11. `frontend-user/pages/faq.vue:21-24` — 결제즉시 자동발권·1~10분 이메일 허위(발권없음·메일미설정) → 운영자확정 흐름 + 메일없음 명시 [S]
[x] (`806b37c`) 12. `frontend-user/pages/faq.vue:41-44` — 5% 자동적립·무제한 현금사용 허위(적립없음·상한있음) → 이벤트/지원 적립+상한대로 수정 [S]

## P1 — 상용 갭 57건

### 돈·정산

[x] 13. 코인=전액 CHECK 500 → 완료 (6a / `booking-service.ts` ZERO_TOTAL_UNSUPPORTED 400 + `checkout/index.vue` 최소1원 자동보정·안내). 0원 PG 경로가 없어 정직 차단. E2E #13 통과
[x] 14. 쿠폰 검사·복원·상한 없음 → 완료 (6a / `loadPromotion` 클레임 필수 + 예약 원자 소비/보상 + 9개 취소경로 복원 + `usage_limit/used_count`(0034) + 어드민 상한 API + 멱등 선확인). E2E #14 통과
[x] 15. 상품등록 공급사행 미생성 → 완료 (6a / `marketplace.ts` 등록 시 공급사행 자동생성(direct_contract/NOT_INTEGRATED, 정산율 변환) + `sellable:false` 정직 응답; 운영자 LIVE 후 견적). E2E #15 통과
[x] 16. tiers 미반영 → 완료 (469200e Phase 5 C6 / `pricing.ts` TIERED + 스냅샷 + `computeCancellation`, 유닛 C6). 6a에서 대조 검증
[x] 17. settle 분개 누락 → 완료 (6a / 0034 OPERATING_CASH·SELLER_CLAIM_RECEIVABLE + `settlementPaidOut`/`recoveryClaimRaised` + 정산주문 reversal 스킵 + 고객취소 park 선행 + `payableStranded` recon). E2E B3/B4 확장 + ledger 통과

### 데이터·시드

[x] 18. 유령 마켓상품 → 완료 (6b / 0035에서 mkt_htl_shilla_01·ing_sample 2건 삭제 + E2E #18 무결성 테스트). ESIM/INS는 #40 범위
[x] 19. 시드 OR REPLACE 덮어씀 → 완료 (6b / `seed-d1-production.js` ON CONFLICT 콘텐츠 전용 upsert + `seed_catalogs_remote.sql` 재생성 + 유닛 seed 테스트). 운영컬럼(is_active·가격·재고·평점집계) 보호
[x] 20. unassigned_transfer 판매자 없음 → 설계상 해소 확인 + dev 정합 (6b / 마이그레이션 원상태 adapter='none'/NOT_INTEGRATED로 prod 판매불가; `dev-seed.mjs` simulator 일괄전환에서 unassigned 3종 제외로 dev도 동일). 허위 판매자 행 추가 대신 미계약 판매 차단 유지
[x] 21. postback 이중 커미션 → 완료 (6b / 0035 `idx_affiliate_conv_once` + `affiliate.ts` OR IGNORE + E2E #21 순차·동시 중복 테스트)
[x] 22. d1_schema 폐기표시 → 완료 (6b / SUPERSEDED 헤더 + 현행 마이그레이션·export 재생성 안내; 공유해시·실시크릿 없음 확인)

### 프론트 기능 결함

23. `admin/UsersView.vue:77` — 코인조정이 Idempotency-Key 없이 전송, 서버 400. UI 조정 전부 실패 → 키 생성·전송 [S]
24. `admin/AffiliateView.vue:32-47` — 등록 UI 없음(조회만). 제휴사 등록 불가 → 레지스트리 탭 추가 [M]
25. `admin/router` — entities/contracts 화면 없음. LIVE 온보딩 불가 → UI 추가 [M]
26. `partner/ProductsView.vue:135-153` — 호텔 등록/수정이 rooms 미전송 → ROOM_REQUIRED로 영구 견적불가 → 객실관리 추가 [M]
27. `user/DetailBookingCard.vue:108` — EXTERNAL_LINK_ONLY에 링크 없음(/out/ 참조 0). 제휴수익 경로 단절 → outlink 방출+렌더 [M]
[x] (`806b37c`) 28. `user/OnboardingModal.vue:33-36` — 결제즉시 바우처 약속 vs PENDING → 확정후발券 문구로 수정 [S]
[x] (`806b37c`) 29. `user/OnboardingModal.vue:39` — 가입쿠폰팩 약속 vs 지급로직 없음 → 삭제 또는 지급구현 [S]
30. `user/nuxt.config.ts:124-139` — 최저가비교 SEO vs 미검증 참고가 → 실비교 전까지 삭제 [S]
31. `user/pages/sustainability.vue:22-33` — 에코뱃지+신칸센/유로스타 허위(QR은 GFV- 텍스트) → 미검증 삭제 [S]

### 보안·권한

32. `partner.ts:626,232` — STAFF가 API키 발급 가능, 키세션은 OWNER 기본. 권한상승 → 발급+폐기를 needOwner로 [S]
33. `partner.ts:296,551` — 프로필 은행계좌를 전 STAFF에 노출(정산은 마스킹) → OWNER 외 마스크 [S]
34. `partner.ts:649-671,640` — 웹훅 시크릿/URL/로테이션+키삭제가 전 STAFF 가능 → OWNER 전용 [S]
35. 3포털 auth 저장소 + `crypto.ts:124` — JWT localStorage 7일. XSS 1건에 탈취 → 서버가 이미 굽는 HttpOnly 쿠키로 전환 [M]
36. `marketplace.ts:17` — 공개 SELECT * 로 원가/마진/수수료 노출 → 공개 컬럼 allowlist [S]
37. `auth.ts:100-124` — 비밀번호 변경 API 없음(리셋은 메일없으면 no-op) → 로그인후 변경 API + 출시 시 메일 필수 [M]

### 이행·공급

38. `booking-service.ts:227-242,603-611` — 파트너 캘린더는 견적에서만, 예약 홀드는 카탈로그 수용량 사용. 마감일도 결제전환 → 예약 시 재확인+가드 INSERT [M]
39. `catalog.ts:202-206` — FLIGHT는 직계약/시뮬/API 전부 거부. 항공 판매경로 0 → GDS/NDC 연동 또는 판매표면 제거 [L]
40. `0005:71-72` — ESIM/보험이 1P ACTIVE로 공개노출인데 견적 409. 허위광고 → PAUSE/원가제거/어드민전용 [S]
41. `catalog.ts:526-537` + `external-adapters.ts:24-200` — Amadeus/Agoda/Viator 등 실명+지원메서드 공개, Airalo는 가짜 ICCID/QR 생성. 허위 제휴 → 어드민게이트+실명삭제 [S]
42. `things-to-do/index.vue:115` — 즉시확정 표시 vs 직계약 PENDING → 이행모드 기반 표시 [S]
43. `catalog.ts:108,146` — TRAIN/PACKAGE 공급사 하드코딩·partner_id 없음. LIVE 1회에 전량 판매 → partner_id 추가 또는 NOT_INTEGRATED 유지 [M]
44. `affiliate.ts:46-55` — 미확인 click_id 전환허용, REAL float 금액·통화 미검증 → 클릭행 매칭+정수+allowlist [M]
45. `booking-service.ts:756-759,1076-1121` — PENDING 예약에 크론 순회·에스컬·타임아웃환불 없음. 무기한 대기 → SLA+타임아웃환불 [M]
46. `0004:106-121` — 공개 플래그가 ESIM/AUTO/REALTIME을 ON+ACTIVE로 광고. 실체와 모순 → off/PENDING_CONTRACT [S]
47. `affiliate.ts:13-27` — /out/ 클릭에 제목 NULL·IP 빈문자·미검증 → CF-IP+제목해결+검증 [S]

### 운영·테스트·배포

48. `verify-production.js:830,979,1011` — T36/T41 스킵을 통과로 카운트(exit 0). 가짜 41/41 → 스킵 시 실패 또는 스테이징 게이트 [S]
49. `marketplace.ts:141` + `flag-service:41` — SELF_REG 플래그 미시드·기본 true·PATCH 404. 킬스위치 무용 → 시드 [S]
50. `feature-flag-service.ts` — 7+2개만 강제, AUTO/ESIM 등은 no-op. 토글 연극 → 강제 또는 제거 [M]
51. `build-and-deploy.js:21-31` — 배포에 D1 migrate 없음(0020 수동). 운영 드리프트 → 원격 적용+검증 단계 [M]
52. `deploy.yml:71-105` — CI가 verify 미실행. 깨진 배포 미감지 → 배포후 스모크 [M]
53. `verify-production.js:744,834,933` — T34/T36/T40이 운영 변경(자동발행 ON·임의발행·상품등록) → 스테이징/읽기전용/dry-run [M]
54. `DEPLOYMENT_ROLLBACK_RUNBOOK.md:60` — 운영DB에 export 덮어쓰기 지시. 장애 시 추가파괴 → 신규DB 생성·임포트·리바인드 [S]
55. `DEPLOYMENT_ROLLBACK_RUNBOOK.md:72,89` — 없는 --env maintenance·HMAC_SECRET 단계. 실행불가 → 삭제+실절차 문서화 [S]
56. `index.ts:175` + `sentry.ts:150` — 크론 로그만·DSN없으면 no-op·하트비트 없음. 침묵 실패 → 하트비트행+/health/알림 [M]
57. `api.e2e.mjs` — POST /admin/ingest/url E2E 0건. SSRF 인접면 미검증 → 픽스처 E2E+403 [M]

### 약관·문구·Go

[x] (`806b37c`) 58. `refund-policy.vue:32` — 카드3-5일/당일자동입금 보장. UNKNOWN→수동리뷰·계좌이체 수단없음 → PG의존 기간+수동경로 명시 [S]
59. `terms.vue:26,39` — eSIM/보험을 제공서비스로 약관 기재(견적 409와 모순) → 허가 전까지 제외 [S]
60. `hotelCatalog.ts:61-62` + 상세 — 실호텔에 날조 평점(4.9/3450건)·가짜리뷰 첫페인트 → 검증리뷰 집계만 표시 [M]
[x] (`806b37c`) 61. `brand.ts:23,25` — 최저가/실시간 문구. 미검증+목+수동환율 → 실피드 전까지 삭제 [S]
62. `user.ts:55` — 목표가 이메일알림 무조건 약속. Resend없으면 영구대기 → 조건부 또는 비활성 [S]
63. `auth.ts:110` — 메일 링크가 미연결 getfortrip.com. 체크리스트에 도메인 단계 없음 → 도메인 단계를 메일/PG 앞으로 [S]
64. `partner/RegisterView.vue:226` — 공급규정·정산정책 동의 강제인데 링크·라우트 없음. 무효동의 → 약관발행+링크 [M]
65. `backend/handlers.go:710-750,69-78` — 하드코딩 partner1234!+정적토큰. :8080 사칭 가능 → env+JWT 또는 제거 [M]
66. `backend/handlers.go:484-515` — Authorization 헤더만으로 결제 CONFIRMED 날조 → 삭제 또는 실PG검증 [M]
67. `pricing_calculator.go:46-54` — Go 세금10+수수료3 float·{code} vs 워커 0·{success}. 가격/형태 괴리 → 폐기표시 또는 정합 [M]
68. `partner.ts:101` — 스태프 로그인 이메일이 파트너 미구분. 타테넌트 접근 → 전역유니크 또는 범위로그인 [M]
69. `partner.ts:336` — 상품가격 Number 미검증(음수·NaN)·도메인 자유 → int>=0+allowlist [S]

## P2 — 하드닝 76건

### 돈 정합·경합

70. `booking-service.ts:675` — Toss confirm 키가 confirm_{bookingId} 고정. paymentKey 변경 재시도 거부 → 시도별 키 [S]
71. `booking-service.ts:796` — 정산은 paid_minor(할인후) vs 원장은 총액기준. 할인주문마다 불일치 → 단일기준(총액) [S]
72. `marketplace.ts:81,98` — SETTLED 기록과 배치롤업이 분리. 사이 크래시 시 복구불가(재시도 409) → 단일배치/보정잡 [M]
73. `booking-service.ts:840,872` — PENDING 환불 가드 없이 INSERT, 절대값 기록 → 중복/오기 위험 → 가드+상대증감 [M]
74. `booking-service.ts:858` — 환불 UNKNOWN은 attempts만 증가, PG 조회 없음. 블라인드 재시도 → 환불조회+어드민 표시 [M]
75. 코인 적립경로 전무(복원/보상/수동만) → 적립규칙 구현 또는 문구 삭제 [M]

### 인덱스·무결성

76. `booking-service.ts:233` — partner_inventory 조회 인덱스 무용 → INDEX(item,date,unit) [S]
77. `booking-service.ts:1177` — payments booking_id 부분인덱스만 → INDEX(booking_id) [S]
78. `booking-service.ts:1028` — price_alerts 조건 인덱스 없음 → INDEX(active,item) [S]
79. REFERENCES 다수인데 FK pragma 미활성 → 활성화 또는 고아감사 [S]
80. `booking-service.ts:570` — partner_id=supplier.id 충돌 의존. 직판 매출이 엑스트라넷에 안보임 → 명시 귀속 [M]
81. 16개 항공이 partners에 없는 ptn_flt_01 참조 → 시드/재배정 [S]
82. `0004:88` — activity_time_slots 쓰기 0건. 슬롯 UX 상시 빈칸 → 쓰기 추가 또는 제거 [M]
83. `0005:83-85` — consignment가 activities 아닌 ingestion 참조. 유령 리스팅 → 발행흐름 수정 [M]
84. `0004:56-85` — esim/보험에 공급사 연결 없음. 영구 예약불가 vs 시드 모순 → 연결 또는 리스팅 제외 [M]

### 프론트·어드민

85. `admin/PricingView.vue:46` — FX 수정불가 표시 vs PUT 존재 → 수정폼 [S]
86. `partner/OrdersView.vue:23-28` — AWAITING에 확정버튼(항상 409)+MANUAL 필터없음 → 버튼게이트+필터 [S]
87. `partner/ProfileView.vue:54-60` — 항상 bank* 전송, STAFF 저장불가 → 변경분만 전송 [S]
88. 슬롯 API 있는데 선택 UI 없음. 시간없는 판매 → 선택기 또는 API 제거 [M]
89. `GlobalHeader.vue:145-155` — t() 호출 0인데 로케일 전환기. 가짜 i18n → 구현/제거 [S]
90. `deals.vue:81-92` — 혜택값 숨김·"최대 W0" 표시 → 혜택 렌더·0 숨김 [S]
91. `careers.vue:4-42` — 가짜 채용공고 4건+mailto → 삭제/실ATS [S]
92. `checkout/index.vue:71-76` — 저장승객 미조회. 재입력 강제 → 선택기 [M]
93. `partner/SettlementsView.vue:78-95` — 합계 기준이 조건부 전환. 불일치 금액 → 단일기준 [S]

### 보안 하드닝

94. `webhooks.ts:57,66` — bookingId 유무로 주문 오라클(낮은 위험) → 동일형태 응답 [S]
95. `affiliate.ts:29` — postback 레이트리밋 없음 → 버킷 추가 [S]
96. `auth.ts:53` — IP기반 제한만, 계정별 잠금없음. 분산 대입 → 계정별 카운터+잠금 [M]
97. `crypto.ts:89` — 레거시 단일SHA256 영구 수용 → 메일 개통 후 강제교체·거부 [M]
98. `partner.ts:69,299` — 은행/사업자번호 평문 저장·제공 → encryptField [M]
99. `booking-service.ts:1109` — payment_events 무정리(웹훅 600/분). 쿼터 DoS → 정리+제한하향 [S]
100. `admin.ts:862-888` — 자금 어드민에 MFA 없음(7일 토큰) → TOTP+짧은 TTL [M]
101. `http.ts:3` — CSP 없음 → 기본 CSP [S]
102. `admin.ts:153,750,817` — PII 목록 3종 감사로그 없음 → 전부 감사 [S]
103. `partner.ts` 쓰기 5종 — 레이트리밋 없음 → 경로별 제한 [S]

### 이행 하드닝

104. `catalog.ts:405-416` — booked_count SELECT 전용(행은 없음). 슬롯 확정경합 대비 → slot id+원자증가 [M]
105. `booking-service.ts:773-775` — 5자리 바우처 충돌 시 결제후 500 → 긴 코드+재시도 [S]
106. `booking-service.ts:757` — PENDING 참조번호가 CAS 밖 → 배치 편입 [S]

### 테스트·CI·관측

107. E2E 0: GET /admin/bookings/:id (PII+원장+감사) → 마스킹+감사 E2E [M]
108. E2E 0: 파트너 ingest+draft 조회(SSRF 인접) → E2E+403 [M]
109. E2E 0: PATCH flags/:key → 로컬 E2E+유닛 [M]
110. 유닛 0: flag/idempotency/auth-rateLimit/RBAC/crypto/pagination → 집중 유닛 [M]
111. E2E: moments 승인경로·/admin/login 별칭 미검증 → E2E 또는 별칭삭제 [S]
112. `deploy.yml:53-54` — 게이트가 user만 빌드. 콘솔은 배포에서 실패 → 3포털 빌드 [S]
113. `deploy.yml` — 프론트 타입체크/린트/감사/E2E 없음 → 포털별 게이트 [M]
114. `verify-production.js:20,47,556` — 기본이 운영+확인없음+정리없음 → 스테이징+확인+정리 [S]
115. `DATABASE_BACKUP_RECOVERY_REPORT.md:14` — 8테이블 주장 vs 50+·자동화없음 → 재작성+정기export+훈련 [M]
116. `DEPLOYMENT_ROLLBACK_RUNBOOK.md:102` — 22/22 vs 실제 41 → 41/41 수정 [S]
117. `flag-service.ts:41` — 미지정 키 true 반환(fail-open) → fail-closed+로그 [S]
118. 0004 FLIGHT가 죽은 REALTIME 요구. 해제불가 → 선행조건 삭제 [S]
119. `index.ts:168,178` — 결제/환불/정산 실패 Sentry·구조로그 없음 → 캡처+로그 [M]
120. `email-service.ts:26` — 환불/취소 템플릿 없음·5회후 침묵 FAILED → 템플릿+데드레터 알림 [M]
121. admin/partner SPA 테스트 0건 → 핵심흐름 테스트 [M]

### Go·문구·API 표면

122. `backend/jwt.go:23-29` — 폴백 시크릿·미인증 SSE/IDOR·하드코딩 수치 → 인증/실계산 [M]
123. `backend/curation_handler.go:14-34` — 미인증 ingest(Gemini 과금)·하드코딩·api.exe·nil-deref → 인증+문서+바이너리 삭제 [M]
[x] (`806b37c`) 124. 푸터/privacy — 절대적 토스 문구(계약전) → 계약후 한정/게이트 [S]
125. `terms.vue:60` — 일괄 세금10% 별도 vs 도메인별 0 → 도메인별 문구+TLS 문구 수정 [S]
126. `BookingDetail.vue:65` — 연락·이중청구없음 약속 vs admin_note만 → 내역확인 안내로 변경 [S]
127. `auth.ts:73` — 로그아웃이 1개 쿠키만 삭제 → 3개 전부 [S]
128. `auth.ts:86` — PARTNER 토큰에 /me 500 → requireUser+가드 [S]
129. `auth.ts:145` — dev-outbox 미인증. 스테이징 수확 → 어드민/비활성 [S]
130. `catalog.ts:99,145,175,223` — limit=abc→500, -5→무제한 → 클램프 [S]
131. `catalog.ts:405` — 슬롯 정규식이 하이픈 제외 → 하이픈 허용 [S]
132. `affiliate.ts:13` — /out/ 레이트리밋 없음. INSERT 플러드 → 제한+검증 [S]
133. `affiliate.ts:53` — 커미션 음수 허용·미검증 → >=0+통화 검증 [S]
134. `user.ts:83` — 승객정보 미검증·무제한 → 형식검증+제한 [S]
135. `admin.ts:963` — 공지 PATCH가 제목/본문 무시하고 성공 → 수락 또는 400 [S]
136. `admin.ts:931` — 프로모 PATCH가 isActive 외 무시하고 성공 → 전체수정 또는 400 [S]
137. `admin.ts:305` — entities 상태 자유입력 → allowlist [S]
138. `partner.ts:37` — 가입에 이메일/사업자번호 검증·형식없음 → 검증+유니크 [S]
139. `marketplace.ts:135` — 3P 가격 NaN/도메인자유/무제한 → 검증+제한 [S]
140. `marketplace.ts:116` — 파트너 정산 SELECT * 로 마진노출 → 안전 프로젝션 [S]
141. 공개 GET(suggest·목록7·esim·보험·레지스트리·마켓·플래그) 무제한 → 읽기제한 [S]
142. 인증 읽기/쓰기(위시·승객·쿠폰·모먼트·문의·예약) 무제한 → 제한확대 [S]
143. money 경로 핸들러 유닛 0·verify에 confirm/cancel 프로브 없음 → 샌드박스 프로브 [M]
144. 롱테일 미탐지(리셋·위시·알림·리뷰·티켓·웹훅·어드민/파트너 쓰기 다수) → 프로브 확대 [M]
145. `catalog.ts:500,514` — esim/보험에 구매불가 주석 없음(409인데 구매가능 표시) → 주석 추가 [S]

## P3 — 마이너 37건

146. `partner.ts:541` — 합계가 미결제 포함 total 합산 → captured paid만 [S]
147. `booking-service.ts:47` — confirm에 Idempotency-Key 없음. 동시탭 409 → 키+리플레이 [S]
148. 마이그레이션 25건 ALTER에 IF NOT EXISTS 없음 → 가드/문서 [S]
149. `dev-seed.mjs:49` — 전 공급사를 simulator로. 구분불가 → 범위지정 [S]
150. `0003:53` — partner_cancellations 무접촉 데드테이블 → 구현/삭제 [S]
151. `0001:272-277` — REAL 레거시 금액컬럼 이중기록 → 중단+1회 백필 [S]
152. `partner/DashboardView.vue:92` — "정상판매중" 정적문구 → 도출/삭제 [S]
153. moments 좋아요/사진 UI 없음 → UI 추가 [S]
154. `help.vue:124-146` — 문의에 bookingId 없음 → 선택필드 [S]
155. `admin/CatalogView.vue:128` — workers.dev 하드코딩 → 설정연동 [S]
156. `initialBookings.ts` 등 데드 픽스처 → 삭제 [S]
157. `currency.ts:8-14` — 폴백환율 침묵변환 → 표시/실패 [S]
158. `help.vue:17` — eSIM FAQ가 판매전제 → 문구정합 [S]
159. `flights/search.vue:235,279` — router.back() 이탈 → patch [S]
160. `transfers/detail/[id].vue:19` — 항공편명 입력 약속 vs 필드없음 → 필드/완화 [S]
161. `pages/*/[id].vue` — 죽은 기본 id → 삭제 [S]
162. `/health` — 설정노출(공개) → 게이트/축소 [S]
163. `auth.ts:133` — 리셋이 파트너토큰 소모 → partner_id NULL 조건 [S]
164. `bookings.ts:18,49` — 300/120분 관대 → 30/60 [S]
165. `admin.ts:641,653` — PATCH 대문자 404 → 소문자화 [S]
166. verify-production — T31 번호누락 → 재정렬 [S]
167. `deploy.yml` — 동시성 없음 → cancel-in-progress [S]
168. verify T12 — 성공분기 무assert → totalMinor assert [S]
169. `GO_LIVE_CHECKLIST.md:78` — EMAIL_FROM 위치 오류 등 드리프트 → 수정/정리 [S]
170. `auth.ts:53` — /admin/login이 USER 수락 → 비어드민 거부 [S]
171. `bookings.ts:54,75` — :id가 410 가림 → 정확일치 우선 [S]
172. `catalog.ts:515` — days=abc→null 200 → 기본값 [S]
173. 에러코드 표기 불일치(TAKEN/EXISTS·400/401 등) → 통일 [S]
174. `partner.ts:704` — OPENAPI 5그룹 누락 → 보완 [S]
175. `affiliate.ts:13` — /out/ 중복 버전 → 정식+리다이렉트 [S]
176. `admin.ts:567` — 미변경행도 updated 카운트 → 변경만 [S]
177. 파트너 로그인실패·대시보드 감사누락 → 감사추가 [S]
178. 공개 인텔(플래그/레지스트리/health) → 필드 축소 [S]
179. 남용방어 불균형 → 제한통일+400 [S]
180. `partner.ts:305` — PATCH 형식 미검증 → 형식검증 [S]
181. `index.ts:59` — 디스패치 순서 결합 → 라우터테이블 [S]
182. `user.ts:19,44` — 위시/알림 자유입력·NaN→0 → allowlist+검증 [S]

## 기각 20건 (구현 불필요)

- data-schema#7 오탐: promotions.code는 UNIQUE라 풀스캔·코드중복 불가.
- claims-go#27 비지적: 검증OK 항목이라 제외.
- 중복 18건: money-core#7=#3계열(fulfilment#3), money-core#18=#105·106, api-surface#1·#2·#5·#6·#7·#13=security#32·33·36·34·34·94, security#19=api#130, frontends#3·#12·#13·#14·#15=claims#8·#9·#7·#10~12·#60, claims-go#7=#5(privacy 꼬리 병합), #11=#41, #14=#120, #25=#31.
- 강등 1건: fulfilment#2 P0→P2 (#104, 슬롯 행 실존 불가).

## 미확인 영역 (정직한 한계)

- 운영 D1 적용상태·프로덕션 실측·크론발화·Sentry 전달 (wrangler 인증 만료로 불가).
- Go 레거시 마이그레이션, catalog 전문, seo, 일부 서비스 본문, 시크릿/D1 설정.
- 프리젠테이셔널 컴포넌트, 약관 본문 법리, 브라우저 런타임, 일부 목록페이지·어드민/파트너 뷰, i18n en/ja/zh.
- support@/careers@/1588 DNS·소유권, FULL_AUDIT 주장 재검증, Toss 실PG 키 재사용 정책.

