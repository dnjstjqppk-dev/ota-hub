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

[x] 23. 코인조정 Idempotency-Key 미전송 → 완료 (6c / `UsersView.vue` 코인 조정 시 `adm_coin_*` 키 생성·전송; 서버 멱등 리플레이로 중복적용 방지)
[x] 24. 제휴사 등록 UI 없음 → 완료 (6c / `AffiliateView.vue` 레지스트리 탭 추가: 등록·시크릿 로테이션·활성 토글, 시크릿 write-only). E2E #24 검증
[x] 25. entities/contracts 화면 없음 → 완료 (6c / `EntitiesView.vue` 신규 + `/entities` 라우트·내비: 완성게이트·계약승격·변경이력). E2E #25 검증
[x] 26. 호텔 rooms 미전송 영구 견적불가 → 완료 (6c / `ProductsView.vue` 객실관리 UI + `partner.ts` 상품 GET 상세/PATCH rooms + 마켓 HOTEL rooms 게이트). E2E #26 통과
[x] 27. EXTERNAL_LINK_ONLY 링크 없음 → 완료 (6c / 0036 `suppliers.outlink_partner_id` + `affiliateOutlinkMap` ACTIVE·https 게이트 방출 + `DetailBookingCard` 외부예약 버튼 + 공급사 매핑 UI; 미매핑·비활성은 링크 없이 정직 문구). E2E #27 통과
[x] (`806b37c`) 28. `user/OnboardingModal.vue:33-36` — 결제즉시 바우처 약속 vs PENDING → 확정후발券 문구로 수정 [S]
[x] (`806b37c`) 29. `user/OnboardingModal.vue:39` — 가입쿠폰팩 약속 vs 지급로직 없음 → 삭제 또는 지급구현 [S]
[x] 30. 최저가비교 SEO 허위 → 완료 (6c / `app.vue` JSON-LD 최저가·비교 문구 삭제, 실비교 전까지 미표방)
[x] 31. sustainability 허위 뱃지·노선 → 완료 (6c / `sustainability.vue` 미검증 에코뱃지·신칸센/유로스타 문구 삭제, 사실 기반으로 재작성)

### 보안·권한

[x] 32. STAFF API키 발급 권한상승 → 완료 (6d / `partner.ts` API키 POST/DELETE에 needOwner, STAFF는 OWNER_ONLY). E2E staff-vs-owner 통과
[x] 33. 프로필 은행계좌 전 STAFF 노출 → 완료 (6d / OWNER 외 ****+뒤4자리 마스크). E2E 통과
[x] 34. 웹훅 전 STAFF 가능 → 완료 (6d / 웹훅 GET/PUT/rotate OWNER 전용). E2E 통과
[x] 35. JWT localStorage 7일 → 완료 (6d / HttpOnly jar 3종 발급+메모리 토큰, localStorage 영속 제거; 쿠키 단독 인증. 잔여: 활성세션 XSS 시 메모리 토큰 노출 가능 — 7일 영속 탈취는 제거, CSRF 토큰은 후속 범위)
[x] 36. 공개 카탈로그 원가/마진 노출 → 완료 (6d / `marketplace.ts` 공개 SELECT allowlist: supply_cost/commission/payout/margin/external_sku/source_url/registered_by/supplier_id 숨김, retail_price/seller_name 유지). E2E 통과
[x] 37. 비밀번호 변경 API 없음 → 완료 (6d / POST `/api/v1/auth/me/password` 현비번 검증+정책+세션파기+requireRelogin+jar 삭제 + 유저 프로필 UI. 파트너 프로필 비번 UI 없음 → 범위 외)

### 이행·공급

[x] 38. 예약 홀드가 캘린더 무시 → 완료 (6e / 예약 시 `availableUnits` 재확인(코인·쿠폰 소비 전) + 캘린더 인식 가드 INSERT + 결제 시 재검증(마감 시 EXPIRED 전환·홀드 해제); 마감일은 부(−)재고로 판독). E2E #38 통과
[x] 39. 항공 판매경로 0 → 완료 (6e / GDS 연동 대신 판매표면 제거: 0037에서 `mkt_flt_ke723` PAUSE + `search.vue` 선택 CTA fail-closed(`bookable === true`); 머니게이트·bookable 게이트는 유지). E2E #39 통과
[x] 40. ESIM/보험 1P 허위노출 → 완료 (6e / 0037에서 2행 PAUSE — 공개 ACTIVE 목록에서 제외, 정산귀속(상태 무관)은 유지). E2E #40 통과
[x] 41. 허위 제휴 레지스트리 → 완료 (6e / 공개 `/suppliers/registry` 삭제 → 어드민 전용으로 이동 + 실명 6종 일반화(GDS_FLIGHT_01 등) + Airalo 가짜 ICCID/QR 발행 제거(전 스펙 BLOCKED); verify T37도 공개404+어드민 검증으로 교체). E2E #41 통과
[x] 42. 즉시확정 허위 뱃지 → 완료 (6e / 서버 `instant_confirmed`(행 플래그+시뮬레이터+bookable) + `instant` 필터 공급사 조인 + UI 3곳(이용권 목록·상세·홈) 이행모드 기반). 직계약은 PENDING이라 뱃지 없음. E2E #42 통과
[x] 43. TRAIN/PACKAGE 공급사 하드코딩 → 완료 (6e / 0037 `partner_id` 2종 + `loadProduct` 행별 해석(미배선은 unassigned 유지) + `mkt_trn_ktx_025` PAUSE). E2E #43 통과
[x] 44. 포스트백 무결성 → 완료 (6e / 클릭행 매칭(UNKNOWN_CLICK 404) + 정수 금액(INVALID_AMOUNT) + 통화 allowlist 6종(INVALID_CURRENCY) + 커미션 유한·≥0; #21 테스트 실클릭으로 전환). E2E #44 통과
[x] 45. PENDING 무기한 대기 → 완료 (6e / 24시간 SLA `sweepSupplierTimeouts` — REFUND_PENDING+홀드해제+전액환불, 환불재시도보다 먼저 실행해 동일 패스에 완결; `supplierTimeouts` 통계로 에스컬 가시화). E2E #45 통과
[x] 46. 허위 자동화 플래그 → 완료 (6e / 0037에서 ESIM·REALTIME_INVENTORY_SYNC·AUTO_BOOKING_CONFIRMATION·SUPPLIER_API_INTEGRATION OFF+PENDING_CONTRACT; enforced 없음 확인). E2E #46 통과
[x] 47. 클릭행 부실 기록 → 완료 (6e / CF-Connecting-IP→XFF→NULL + 도메인 allowlist(그 외 UNKNOWN) + 카탈로그 제목 해석(불가 시 NULL)). E2E #47 통과

### 운영·테스트·배포

[x] 48. verify 스킵 강성 → 완료 (6f / 스킵은 기록+사유 출력, `VERIFY_ALLOW_SKIP=1` 없으면 exit 1. T36 스킵 제거: 스테이징은 발행-or-409 once-only 입증, 운영은 읽기전용. summary에 PASS/FAILED/SKIPPED+모드 표기). 가짜 41/41 불가
[x] 49. SELF_REG 킬스위치 → 완료 (6f / 0038 WHERE-NOT-EXISTS 백필(연산자 토글 보존) + E2E OFF→503→ON. 0005 시드済이나 행 유실 DB에선 fail-open+PATCH 404였음 — 백필로 전 DB 보장)
[x] 50. 플래그 강제/제거 → 완료 (6f / 연극 12종 삭제(0038) + PARTNER_URL_INGESTION·채널 3종 강제 신설. 레지스트리는 강제 13종만, verify T32/T33·E2E #46이 집합 일치 검증)
[x] 51. 배포 D1 단계 → 완료 (6f / `build-and-deploy.js` 0단계: 원격 마이그레이션+저널 5행 검증, 실패 시 배포 중단. `SKIP_D1_MIGRATE=1` 탈출구 + `DRY_RUN=1` 리허설. 체크리스트 0단계 자동화로 갱신)
[x] 52. 배포후 스모크 → 완료 (6f / `scripts/smoke-production.js` 신규(무인증·읽기전용 11종) + 배포 파이프라인 4단계 편입 → CI deploy잡이 자동 실행. 전체 verify는 수동 유지(QA행 기입 때문))
[x] 53. verify 운영변경 제거 → 완료 (6f / T34·T36·T40 운영 기본 읽기전용 변형(안전기본값·404·400 무쓰기 검증), 스테이징에선 live 수행. `VERIFY_ALLOW_MUTATION=1` 명시 opt-in)
[x] 54. 런북 복구 절차 → 완료 (6f / 운영DB 덮어쓰기 삭제 → 신규DB 생성·임포트·행수 검증·리바인드·재배포 5단계로 교체)
[x] 55. 런북 허위 단계 → 완료 (6f / `--env maintenance` 삭제 → 롤백+킬스위치 긴급정지 절차. `HMAC_SECRET` 삭제 → JWT/worker secret·파트너 웹훅 rotate·제휴 secretKey 실절차로 교체)
[x] 56. 크론 하트비트 → 완료 (6f / 0038 `cron_heartbeats` + `runMaintenanceWithHeartbeat`(크론·어드민 공용) + `/health checks.cron`(lastRun/ok/ageSec/stale, 상태코드 불변). E2E #56 + stale 드릴)
[x] 57. ingest E2E → 완료 (6f / `INGEST_ALLOW_HOSTS`(비운영 전용, prod 무시) 심 + 픽스처 서버 E2E(201 파싱 검증) + SSRF 403 4종 + 400 2종. 번외: 127/8 루프백 홀 차단(127.0.0.2 등) + 유닛)

### 약관·문구·Go

[x] (`806b37c`) 58. `refund-policy.vue:32` — 카드3-5일/당일자동입금 보장. UNKNOWN→수동리뷰·계좌이체 수단없음 → PG의존 기간+수동경로 명시 [S]
[x] 59. 약관 eSIM/보험 제외 → 완료 (6g / terms 제2조에서 예약·결제 대상 제외+조회만 명시, refund-policy 해당 규정 "판매 개시 후 적용" 한정. 버전 유지(#58 선례: 한정 문구, 동의 고아 방지))
[x] 60. 날조 평점·리뷰 제거 → 완료 (6g / 집계는 이미 null·0이었음 확인, 미렌더 사체 리뷰 17건 전삭제(14블록). 상세는 API 검증리뷰 섹션 사용中. catalog-truth 유닛 회귀)
[x] (`806b37c`) 61. `brand.ts:23,25` — 최저가/실시간 문구. 미검증+목+수동환율 → 실피드 전까지 삭제 [S]
[x] 62. 알림 문구 조건부 → 완료 (6g / 미설정 시 정직 문구+emailDelivery:NOT_CONFIGURED, 설정 시 QUEUED. 재설정 엔드포인트와 동일 형태. E2E #62)
[x] 63. 도메인 단계 선행 → 완료 (6g / 체크리스트 새 4단계(도메인 연결)+기존 4-9→5-10 renumber, 웹훅 URL 정식도메인 기준. OPEN_READINESS "1→8단계" 표기는 Phase 7 현행화 시 반영)
[x] 64. 파트너 약관 발행+링크 → 완료 (6g / PartnerTermsView v1.0 신규(구현 기반 5조: 승인·판매·확정·정산·보안)+/terms 공개 라우트+체크박스 링크. 동의 저장은 미구현(잔여))
[x] 65. Go 파트너 하드코딩 제거 → 완료 (6g / 정적 prefix 우회 삭제(JWT만), 비번 env화(미설정 503)+로그인 시 PARTNER JWT 발급. Go 테스트 전면 갱신. AdminLogin 선례 준용)
[x] 66. Go 결제 날조 삭제 → 완료 (6g / PayBooking 410 스텁화(워커 API 안내). Go 테스트 3종 변형 410 검증)
[x] 67. Go 가격 폐기표시 → 완료 (6g / CalculatePricing Deprecation+Warning 헤더(워커 quotes 지목)+엔진 주석. 동작 불변, Go 테스트 헤더 검증)
[x] 68. 스태프 이메일 전역유니크 → 완료 (6g / UNIQUE는 0003부터 존재 확인, 초대 검사를 테넌트→전역 409로 정정+레이스 catch. E2E #68(타테넌트 409+로그인 귀속))
[x] 69. 상품가격·도메인 검증 → 완료 (6g / POST에 PATCH와 동일 int>=0 + 3종 allowlist(HOTEL/CAR/ACTIVITY, UI와 일치). 0원 명시 허용(falsy 함정 제거). E2E #69)

## P2 — 하드닝 76건

### 돈 정합·경합

[x] 70. `booking-service.ts:675` — Toss confirm 키가 confirm_{bookingId} 고정. paymentKey 변경 재시도 거부 → 시도별 키 [S] 완료 (P2a / confirm_{paymentId} 시도별 키 + 샌드박스 멱등키 강제(Toss 동형). 기존 decline→재시도 테스트가 입증. 레드드릴: 구 키 복원 시 402 실패 확인 후 복원·녹색)
[x] 71. `booking-service.ts:796` — 정산은 paid_minor(할인후) vs 원장은 총액기준. 할인주문마다 불일치 → 단일기준(총액) [S] 완료 (P2a / issue 양 경로 정산 기준을 gross(paid+할인)로 통일. 원장 PROMOTION_EXPENSE 다리와 일치. E2E #71 쿠폰→gross 분할 assert)
[x] 72. `marketplace.ts:81,98` — SETTLED 기록과 배치롤업이 분리. 사이 크래시 시 복구불가(재시도 409) → 단일배치/보정잡 [M] 완료 (P2a / completeSettlement 멱등 추출(장부 사전확인·조건부 환수적용·결정적 배치링크·재계산 롤업) + SETTLED 미완성 시 {repaired:true} 보정 분기(완성은 기존 409 유지). 부분차감도 applied_settlement_id 추적. E2E #72 고아보정+부분추적)
[x] 73. `booking-service.ts:840,872` — PENDING 환불 가드 없이 INSERT, 절대값 기록 → 중복/오기 위험 → 가드+상대증감 [M] 완료 (P2a / 0039 예약당 PENDING 1건 유니크(409 REFUND_IN_PROGRESS) + 적용 배치 PENDING 가드 + payments/bookings 상대증감 + 외부동기화 낙관락(충돌 시 covered면 ALREADY_APPLIED) + 배치 후 void 재확인. E2E #73 동시시작 단일화)
[x] 74. `booking-service.ts:858` — 환불 UNKNOWN은 attempts만 증가, PG 조회 없음. 블라인드 재시도 → 환불조회+어드민 표시 [M] 완료 (P2a / UNKNOWN 시 provider.lookup → CANCELED 커버 시 즉시 완료(transactionKey 기록), 아니면 attempts+1 + PG_LOOKUP 노트. 샌드박스 refundghost/refundlost. GET /api/v1/admin/refunds 목록(status 필터·last_error). E2E #74 양 시나리오)
[x] 75. 코인 적립경로 전무(복원/보상/수동만) → 적립규칙 구현 또는 문구 삭제 [M] 완료 (P2a / 문구 정직 확인(faq 준비 중·help/rewards 이벤트·고객지원=어드민 수동) 후 자동적립 없이 정책 확정. E2E #75 어드민 지급→잔액+ADMIN_ADJUSTMENT 원장행)

### 인덱스·무결성

[x] 76. `booking-service.ts:233` — partner_inventory 조회 인덱스 무용 → INDEX(item,date,unit) [S] 완료 (P2b / 0040 idx_partner_inventory_item_date_unit. E2E EXPLAIN 플랜 단언)
[x] 77. `booking-service.ts:1177` — payments booking_id 부분인덱스만 → INDEX(booking_id) [S] 완료 (P2b / 0040 idx_payments_booking(SCAN 확인 후 추가). E2E 플랜 단언)
[x] 78. `booking-service.ts:1028` — price_alerts 조건 인덱스 없음 → INDEX(active,item) [S] 완료 (P2b / 0040 idx_price_alerts_active_item. E2E 플랜 단언)
[x] 79. REFERENCES 다수인데 FK pragma 미활성 → 활성화 또는 고아감사 [S] 완료 (P2b / reconciliation에 pragma_foreign_key_check 고아감사+ok 편입. 로컬은 강제됨(고아 INSERT 거부 핀)이라 감사는 타 런타임 방벽. E2E #79. 덤으로 실버그 2종 발견·수정: 정산폴백 요율 뒤집힘(공급사몫→수수료 여집합, marketplace-service:145) + 1P 무지급 정산 거부(SETTLEMENT_NOTHING_TO_PAY). B3 2종 3P 전환으로 실차감 입증)
[x] 80. `booking-service.ts:570` — partner_id=supplier.id 충돌 의존. 직판 매출이 엑스트라넷에 안보임 → 명시 귀속 [M] 완료 (P2b / 예약 생성 시 상품 소유 파트너 검증 후 저장(실파트너 아니면 NULL). 0040 기존행 백필. E2E #80 + 1P NULL 단언)
[x] 81. 16개 항공이 partners에 없는 ptn_flt_01 참조 → 시드/재배정 [S] 완료 (P2b / 항공 16행 NULL(공급사 폴백 유지라 판매·정산 동일). dev 시드+프로덕션 시드+0040+어드민 생성/벌크 NULL 스탬프. E2E #81. transfers unassigned 표식은 의도라 유지)
[x] 82. `0004:88` — activity_time_slots 쓰기 0건. 슬롯 UX 상시 빈칸 → 쓰기 추가 또는 제거 [M] 완료 (P2b / PUT /partner/activities/:id/slots 추가(본인상품·검증·booked 보존·정원가드). UNIQUE는 0004 기존 선언 활용. 유닛 2종 + E2E #82)
[x] 83. `0005:83-85` — consignment가 activities 아닌 ingestion 참조. 유령 리스팅 → 발행흐름 수정 [M] 완료 (P2b / 해소 확인: 시드 유령행은 6b 정리済, 현 발행흐름은 실 카탈로그행만 생성(CONSIGNMENT 생성경로 없음). E2E #83 핀(0행 단언))
[x] 84. `0004:56-85` — esim/보험에 공급사 연결 없음. 영구 예약불가 vs 시드 모순 → 연결 또는 리스팅 제외 [M] 완료 (P2b / 6e에서 리스팅 제외로 해소済(PAUSE, E2E #39/#40 매실행 검증). 카탈로그 플랜 표시 정직성은 #145에서 처리)

### 프론트·어드민

[x] 85. `admin/PricingView.vue:46` — FX 수정불가 표시 vs PUT 존재 → 수정폼 [S] 완료 (P2c / 행별 수정 입력+변경분 일괄 PUT 저장, 토스트. 자동갱신 미지원 문구는 유지)
[x] 86. `partner/OrdersView.vue:23-28` — AWAITING에 확정버튼(항상 409)+MANUAL 필터없음 → 버튼게이트+필터 [S] 완료 (P2c / 확정은 SUPPLIER_BOOKING_PENDING에만(유일 합법 엣지), 거절은 미결제 제외(AWAITING→FAILED 엣지 없음), 미결제행 '결제 대기 중' 표시, MANUAL_REVIEW_REQUIRED 필터 추가)
[x] 87. `partner/ProfileView.vue:54-60` — 항상 bank* 전송, STAFF 저장불가 → 변경분만 전송 [S] 완료 (P2c / 스냅샷 diff 전송+마스킹값 역쓰기 방지+미변경 안내. E2E #32-34에 스태프 연락처 단독 저장 200·bank키 403 보강)
[x] 88. 슬롯 API 있는데 선택 UI 없음. 시간없는 판매 → 선택기 또는 API 제거 [M] 완료 (P2c / 선택기 채택: 상세 카드에 일자별 슬롯 칩(잔여석·매진 비활성)+선택을 checkout ?slotStart로 전달, 체크아웃에 '요청 시간대·확정 아님' 표시+요청사항 프리필. 원자적 슬롯확정은 #104 범위)
[x] 89. `GlobalHeader.vue:145-155` — t() 호출 0인데 로케일 전환기. 가짜 i18n → 구현/제거 [S] 완료 (P2c / 구현: 기존 4개원어 사전을 네비·로그인 버튼에 연결(t(c.key)), things-to-do 키 4개원어 추가. 유닛 locale.test.mjs(키 전수 해석·폴백))
[x] 90. `deals.vue:81-92` — 혜택값 숨김·"최대 W0" 표시 → 혜택 렌더·0 숨김 [S] 완료 (P2c / 혜택 본문(%/원)+0인 min/max 구간 숨김. 유닛 deals.test.mjs)
[x] 91. `careers.vue:4-42` — 가짜 채용공고 4건+mailto → 삭제/실ATS [S] 완료 (P2c / 가짜 4건·mailto 삭제, 정직한 빈 상태+1:1 문의 링크로 교체(ATS 없음, 라우트 유지))
[x] 92. `checkout/index.vue:71-76` — 저장승객 미조회. 재입력 강제 → 선택기 [M] 완료 (P2c / 행별 저장승객 불러오기(이름·생년월일·성별·국적·여권만료 채움, 여권번호는 마스킹이라 직접입력 안내). 유닛 checkout-travelers.test.mjs)
[x] 93. `partner/SettlementsView.vue:78-95` — 합계 기준이 조건부 전환. 불일치 금액 → 단일기준 [S] 완료 (P2c / 조건부 재계산 삭제, 서버 own-bookings 합계 단일 기준(라벨과 일치). 미사용 pendingPayoutKrw 제거)

### 보안 하드닝

[x] 94. `webhooks.ts:57,66` — bookingId 유무로 주문 오라클(낮은 위험) → 동일형태 응답 [S] 완료 (P2d / a690f7d에서 해소済(제네릭 응답+중복 동일규칙). E2E 웹훅 테스트가 매실행 검증)
[x] 95. `affiliate.ts:29` — postback 레이트리밋 없음 → 버킷 추가 [S] 완료 (P2d / affiliate_postback 60/60 파싱 전 차단. E2E #95 61번째 429)
[x] 96. `auth.ts:53` — IP기반 제한만, 계정별 잠금없음. 분산 대입 → 계정별 카운터+잠금 [M] 완료 (P2d / 이메일별 10회/15분 잠금(lib/auth 헬퍼, user+partner 로그인). 성공 시 즉시 해제, 미지정 이메일도 동일 응답(오라클 방지). E2E #96 2종)
[x] 97. `crypto.ts:89` — 레거시 단일SHA256 영구 수용 → 메일 개통 후 강제교체·거부 [M] 완료 (P2d / 파트너 로그인에 누락된 rotation 추가 + 메일 개통 시 거부 게이트(LEGACY_PASSWORD_ROTATION_REQUIRED). 거부 분기는 Resend 없어 미검증이라 원장에 명시. E2E #97 rotation + 유닛 isLegacyHash)
[x] 98. `partner.ts:69,299` — 은행/사업자번호 평문 저장·제공 → encryptField [M] 완료 (P2d / 사업자번호·계좌번호·예금주를 키 있으면 v1 암호화(없으면 평문 유지, 기존행 무백필 호환). 읽기는 복호 후 표시·마스킹, 키 없이 암호문이면 표시 마스킹/이체명세 503. E2E #98)
[x] 99. `booking-service.ts:1109` — payment_events 무정리(웹훅 600/분). 쿼터 DoS → 정리+제한하향 [S] 완료 (P2d / 30일 경과행 maintenance 정리 + toss_webhook 600→120/분. E2E #99)
[x] 100. `admin.ts:862-888` — 자금 어드민에 MFA 없음(7일 토큰) → TOTP+짧은 TTL [M] 완료 (P2d / 0041+TOTP 등록/확정/해제 API+ADMIN 로그인 게이트+어드민 토큰 12h(일반 7일 유지). 유닛 RFC벡터 + E2E #100 전주기. 콘솔 UI는 후속)
[x] 101. `http.ts:3` — CSP 없음 → 기본 CSP [S] 완료 (P2d / SECURITY_HEADERS에 default-src 'none' 등(API 응답·302·사이트맵에만 적용, SPA는 애셋 서빙이라 영향 없음). E2E #101 헤더 단언)
[x] 102. `admin.ts:153,750,817` — PII 목록 3종 감사로그 없음 → 전부 감사 [S] 완료 (P2d / dashboard·users·partners 목록 감사 추가(ADMIN_VIEW_DASHBOARD·ADMIN_LIST_USERS·ADMIN_LIST_PARTNERS). 클릭/전환은 PII 미반환이라 제외. E2E #102)
[x] 103. `partner.ts` 쓰기 5종 — 레이트리밋 없음 → 경로별 제한 [S] 완료 (P2d / 리소스별 7버킷(profile·products·inventory·orders·staff·keys·webhook, 각 120/60). E2E #103)

### 이행 하드닝

[x] 104. `catalog.ts:405-416` — booked_count SELECT 전용(행은 없음). 슬롯 확정경합 대비 → slot id+원자증가 [M] 완료 (P2e / 슬롯 예약 정식 지원: 견적 slotStart→슬롯가(SLOT_ADULT/CHILD 라인)+예약 시 원자 청구+booking_items.slot_id 기록+13개 종료경로 해제+10분 스위프. 0042. E2E #104 5종(가격·경합·해제·PRICE_CHANGED·거부형태)+유닛)
[x] 105. `booking-service.ts:773-775` — 5자리 바우처 충돌 시 결제후 500 → 긴 코드+재시도 [S] 완료 (P2e / 16hex+충돌 시 재발급 3회 재시도(저널·정산 재생성). 유닛 형식+유일성, E2E #105 전수 유일 sweeping)
[x] 106. `booking-service.ts:757` — PENDING 참조번호가 CAS 밖 → 배치 편입 [S] 완료 (P2e / 버전가드 배치 편입+충돌 시 최신상태 반환. E2E #106 pending 참조 적재)

### 테스트·CI·관측

[x] 107. E2E 0: GET /admin/bookings/:id (PII+원장+감사) → 마스킹+감사 E2E [M] 완료 (P2e / E2E #107: 여권 플레이스홀더·어드민 전체/고객 마스킹 오프라인·원장 포함·ADMIN_VIEW_BOOKING 감사)
[x] 108. E2E 0: 파트너 ingest+draft 조회(SSRF 인접) → E2E+403 [M] 완료 (P2e / 파트너 자사 드래프트 목록+단건 신설(타사 404)+E2E #108(픽스처 수집·소유격리·SSRF 403))
[x] 109. E2E 0: PATCH flags/:key → 로컬 E2E+유닛 [M] 완료 (P2e / E2E는 #49/#50에서 이미 수행, 유닛 flags.test.mjs 신규(의존성 양방향·감사·무변경))
[x] 110. 유닛 0: flag/idempotency/auth-rateLimit/RBAC/crypto/pagination → 집중 유닛 [M] 완료 (P2e / pagination·idempotency·rate-limit·rbac·flags 5종 신규+crypto 기존. _fakedb 공용)
[x] 111. E2E: moments 승인경로·/admin/login 별칭 미검증 → E2E 또는 별칭삭제 [S] 완료 (P2e / 별칭은 기존 검증됨. E2E #111: 게시→차단→승인(featured)→차단→복원 전주기)
[x] 112. `deploy.yml:53-54` — 게이트가 user만 빌드. 콘솔은 배포에서 실패 → 3포털 빌드 [S] 완료 (P2f / 게이트를 `node scripts/build-all.js`로 교체. build-all 0)
[x] 113. `deploy.yml` — 프론트 타입체크/린트/감사/E2E 없음 → 포털별 게이트 [M] 완료 (P2f / `npm audit --omit=dev --audit-level=critical` 4곳(root+3포털) 게이트 + 포털별 `test` 스크립트 + root `test`에 admin/partner 편입. unit 114/114)
[x] 114. `verify-production.js:20,47,556` — 기본이 운영+확인없음+정리없음 → 스테이징+확인+정리 [S] 완료 (P2f / 기본 타깃을 로컬(:8799)로, 운영은 BASE_URL+VERIFY_ACK_PROD(또는 TTY PROCEED) 명시 시에만 + 탐색 계정 자동 정리(탈퇴 불가분은 리포트). 체크리스트·런북 호출식 갱신)
[x] 115. `DATABASE_BACKUP_RECOVERY_REPORT.md:14` — 8테이블 주장 vs 50+·자동화없음 → 재작성+정기export+훈련 [M] 완료 (P2f / 보고서 재작성(70 실측) + `scripts/backup-d1.js`(export+테이블 대조+머니 테이블 행 확인) + `db-backup.yml` 주간 스케줄 + 로컬 드릴 실행(70/70 OK))
[x] 116. `DEPLOYMENT_ROLLBACK_RUNBOOK.md:102` — 22/22 vs 실제 41 → 41/41 수정 [S] 완료 (P2f / 22/22→41/41 + 운영 호출식에 BASE_URL+VERIFY_ACK_PROD 반영)
[x] 117. `flag-service.ts:41` — 미지정 키 true 반환(fail-open) → fail-closed+로그 [S] 완료 (P2f / 미지정 키 fail-closed + `UNKNOWN_FLAG:` warn + 유닛 뒤집음(기대 false). E2E 151/151 녹색으로 회귀 없음)
[x] 118. FLIGHT 죽은 선행조건 → 완료 (6f에서 조기 해소 / 0038이 REALTIME 행 삭제 + `requires_flags='[]'` 정리. E2E #46이 빈 배열 검증)
[x] 119. `index.ts:168,178` — 결제/환불/정산 실패 Sentry·구조로그 없음 → 캡처+로그 [M] 완료 (P2f / `moneyLog` 구조 로그 8곳(결제 3·환불 3·정산 2) + 유닛(JSON 1행·svc/event). 예외는 기존 Sentry 전역 캐치)
[x] 120. `email-service.ts:26` — 환불/취소 템플릿 없음·5회후 침묵 FAILED → 템플릿+데드레터 알림 [M] 완료 (P2f / 환불/취소 템플릿은 기존(C3) 확인·유닛 핀 + 데드레터 감사 신설(UNRENDERABLE·RETRIES_EXHAUSTED) + 유닛 2종)
[x] 121. admin/partner SPA 테스트 0건 → 핵심흐름 테스트 [M] 완료 (P2f / SFC 3종(admin Pricing + partner Orders/Profile, 컴파일+행위) + 포털 test 스크립트 + root test 편입. unit 114/114)

### Go·문구·API 표면

[x] 122. JWT 폴백·SSE/IDOR·하드코딩 수치 → 완료 (P2g / 폴백 시크릿 삭제(JWT_SECRET 32자+ 미설정 시 fail-closed, 로그인은 503) + SSE 인증(헤더·?token=, ACAO * 제거) + 예약 3종 소유자·어드민 게이트(401/403/404) + 파트너 대시보드·정산 실계산(월매출·대기·상품수·평점·요율별 정산, 디렉토리 공유) + Go 테스트 5종. 번외 FINDING: CreateDraftBooking UnixNano ID가 Windows 시계 granularity에서 충돌 가능 — 테스트는 sleep 우회, 스토어 수정은 후속)
[x] 123. 미인증 ingest·하드코딩·바이너리·nil-deref → 완료 (P2g / ingest·resync 어드민 전용 + .env.example 문서(어드민JWT·과금·제휴ID 5종) + api.exe 삭제(untracked build artifact) + resync nil-referral 409 + Go 테스트 2종. 번외: 규칙기반 합성 토큰 카운트 150/420→0)
[x] (`806b37c`) 124. 푸터/privacy — 절대적 토스 문구(계약전) → 계약후 한정/게이트 [S]
[x] 125. 일괄 세금10%·TLS 문구 → 완료 (P2g / terms 제6조 도메인별(호텔·렌터카·공항이동 10%, 항공·철도·이용권·패키지 면세, TAX_BPS와 일치) + privacy §8 전송구간 암호화 운영환경 한정)
[x] 126. MANUAL_REVIEW 연락·이중청구 약속 → 완료 (P2g / 예약 내역 확인 안내로 교체 — 리뷰 해소 경로에 고객 통지가 없음 확인)
[x] 127. 로그아웃 1개 쿠키 → 완료 (P2g / 3개 jar 전삭제(jsonCookies+clearAllAuthCookies, user·admin·partner 로그아웃 공통) + E2E #127(CORS 포함 3종·3개))
[x] 128. PARTNER /me → 완료 (P2g / GET·PATCH requireUser(DB 검증 역할 게이트) + E2E #128 401 핀. 정정: 현 코드도 null 가드로 401이라 500은 미재현 — 감사는 구 리비전 관측 추정, 처방 하드닝은 적용)
[x] 129. dev-outbox 미인증 → 완료 (P2g / requireAdmin(리셋 링크는 bearer secret) + E2E 기존 4곳 ADMIN 토큰 + E2E #129(401/403/200))
[x] 130. limit 파싱 → 완료 (P2g / clampLimit 1..100(기본 50, 호텔·항공 2곳 — trains 이하 5종은 고정 50이라 해당 없음) + E2E #130)
[x] 131. 슬롯 정규식 하이픈 → 완료 (P2g / [A-Za-z0-9_-]+ + E2E #131(하이픈 ID 슬롯 서빙))
[x] 132. /out/ 무제한 → 완료 (P2g / affiliate_out 120/60 + itemId 필수 400 + E2E #132(400/404/429))
[x] 133. 포스트백 커미션 검증 → 완료 (코드는 6e 이전부터 차단済(`affiliate.ts` INVALID_PAYLOAD) / 6f에서 E2E #133 3종 assert(음수·비수치 400 + 정상 200) 추가 입증)
[x] 134. 승객정보 미검증·무제한 → 완료 (P2g / 생년월일·여권만료 실재날짜, 성별 MALE·FEMALE·OTHER, 국적 영문3자 + 20명 상한 409 + E2E #134)
[x] 135. 공지 PATCH 무시 성공 → 완료 (P2g / 제목·본문 수락(POST 동일 규칙, 감사 포함) + E2E #135)
[x] 136. 프로모 PATCH 무시 성공 → 완료 (P2g / isActive·usageLimit 외 키 400 IMMUTABLE_FIELD + E2E #136)
[x] 137. entities 상태 자유입력 → 완료 (P2g / DRAFT·ACTIVE·SUSPENDED·RETIRED allowlist(CHECK 미러, 소문자 정규화) + 콘솔 CLOSED→RETIRED(구 옵션은 500 유발) + E2E #137)
[x] 138. 파트너 가입 무검증 → 완료 (P2g / EMAIL_RE + 사업자번호 10자리(C2 동일) + 복호비교 유니크 409(랜덤IV라 평문 비교, 소규모·저빈도라 스캔 허용) + 픽스처 고유번호화(bizNo) + E2E #138)
[x] 139. 3P 가격·도메인 무검증 → 완료 (P2g / HOTEL·ACTIVITY allowlist + 정수 0..10억(#69 동일형, 0원 허용) + E2E #139)
[x] 140. 파트너 정산 마진노출 → 완료 (P2g / 안전 프로젝션(자신의 gross·수수료·입금·환수차감 유지, supply_cost·net_platform_profit·supplier·귀속·지급수단 제외) + E2E #140)
[x] 141. 공개 GET 무제한 → 완료 (P2g / catalog_read 600/60(카탈로그 전표면)·market_read 300/60·flags_read 300/60 + E2E #141(12표면 200·충전429). 레지스트리는 #41 이후 어드민 전용이라 범위 외)
[x] 142. 인증 읽기/쓰기 무제한 → 완료 (P2g / user_read 600/60(위시·승객·쿠폰·리뷰·모먼트·문의·예약3종)·user_write 120/60(위시·승객·좋아요취소)·market_write 120/60(3P 등록) + E2E #142(충전·루프429). 어드민 표면은 범위 외)
[x] 143. money 유닛 0·verify confirm/cancel 없음 → 완료 (P2g / money-handlers.test.ts 7종(confirm·cancel 가드·preview·voucher·충돌·하한가·정산분개) + verify T42(가드+샌드박스 전주기))
[x] 144. 롱테일 미탐지 → 완료 (P2g / verify T43~T47(리셋침묵·위시/알림·리뷰/모먼트·티켓/웹훅·프로모/프로필, 읽기전용 변형 포함) + 파트너 승인 프로브 C1/C2 수리(직행 ACTIVE 409 해소) + 정리 탈퇴에 비밀번호 추가(400 누수 해소). 로컬 verify 잔여 실패 T11·T13·T14·T20·T31·T38·T39는 기존 드리프트(P2g 범위 외))
[x] 145. esim/보험 구매가능 표시 → 완료 (P2g / purchasable:false+purchase_notice(UI 문구와 일치) + E2E #145)

## P3 — 마이너 37건

[x] 146. 합계 미결제 포함 → 완료 (P3a / 대시보드·정산 SUM(paid_minor)로, E2E는 선결제 후 단언으로)
[x] 147. confirm 멱등키 없음 → 완료 (P3a / 선택적 Idempotency-Key+리플레이+422＋형식검증 + E2E #147)
[x] 148. ALTER 가드 없음 → 완료 (P3a / worker/migrations/README.md — SQLite에 ADD COLUMN IF NOT EXISTS가 없어 추적 1회 적용(journal+배포게이트)으로 보장함을 문서화)
[x] 149. 전 공급사 simulator → 완료 (P3a / dev-seed를 4개 레거시(ptn_htl·flt·car·tour_01)로 범위지정 — 직영·sup_*·unassigned_*는 시드 어댑터 유지 + E2E #149)
[x] 150. partner_cancellations 데드테이블 → 완료 (P3a / 0043 DROP — 전수 무참조 확인, 라이브 취소경로는 bookings+refunds)
[x] 151. REAL 이중기록 → 완료 (P3a / 0044 total_minor 백필 + base·tax·fee·cancel·refund REAL 쓰기 중단 + 목록 fallback 제거. total_price(NOT NULL)·discount(단일실효)는 유지·주석 + E2E #151)
[x] 152. "정상판매중" 정적문구 → 완료 (P3a / 중립 라벨로 교체 — 대시보드는 판매여부를 모름)
[x] 153. 모먼트 좋아요/사진 UI → 완료 (P3a / 좋아요 토글 + MOMENT_PHOTO 업로드·첨부 + 서버 localhost-http 허용 + E2E #153 + SFC 4종)
[x] 154. 문의 예약 연결 없음 → 완료 (P3a / 예약 선택필드+연결 표시(서버 소유검증 기존) + SFC 2종)
[x] 155. workers.dev 하드코딩 → 완료 (P3a / API_BASE_URL에서 origin 도출)
[x] 156. 데드 픽스처 → 완료 (P3a / initialBookings.ts 삭제 — 무참조 확인, 카탈로그 8종은 라이브라 유지)
[x] 157. 폴백환율 침묵변환 → 완료 (P3a / ratesLoaded+ratesStale+미로드 시 KRW 안전표시 + 순수 convertKrw 유닛 3종)
[x] 158. eSIM FAQ 판매전제 → 완료 (P3b / 판매준비중 문구로 교체)
[x] 159. router.back 이탈 → 완료 (P3b / patch({out:''}) 2곳 — 딥링크·새로고침 진입도 이탈 없음)
[x] 160. 항공편명 입력 약속 → 완료 (P3b / 실재 요청사항 필드로 안내 완화)
[x] 161. 죽은 기본 id 페이지 → 완료 (P3b / 리다이렉트 스텁 7종 삭제 — 무링크 확인, detail·my/bookings 유지)
[x] 162. /health 설정노출 → 완료 (P3b / 공개는 status·database·jwtSecret·time만, 상세요소는 verbose=1+어드민 + E2E #162 + verify T01 누출 단언 + 체크리스트 확인절차 토큰화)
[x] 163. 리셋 파트너토큰 소모 → 완료 (P3b / 유저 리셋에 partner_id IS NULL + E2E #163(미소모 후 파트너 리셋 200))
[x] 164. 관대한 견적·결제 제한 → 완료 (P3b / quotes 300→30·payments 120→60 + E2E #164(루프·충전429))
[x] 165. PATCH 대문자 404 → 완료 (P3b / 제휴사·법무 slug 소문자 정규화 + E2E #165)
[x] 166. T31 번호누락 → 완료 (P3b / 28절 2테스트 분리→29 신설, 구29·30→30·31 — 런타임 번호와 일치)
[x] 167. 동시성 없음 → 완료 (P3b / production-deploy 그룹 cancel-in-progress)
[x] 168. T12 무assert → 완료 (P3b / 성공분기 totalMinor>0 단언)
[x] 169. 체크리스트 드리프트 → 완료 (P3b / EMAIL_FROM 추가절차 명시 + PARTNER_SITE_URL 선언값 정정 + 0041~0044 운영주의 추가)
[x] 170. /admin/login USER 수락 → 완료 (P3b / 비어드민 403 ADMIN_ONLY + E2E #170)
[x] 171. :id가 410 가림 → 완료 (P3c / 410 2종을 :id 앞으로 이동 + E2E #171)
[x] 172. days NaN 200 → 완료 (P3c / clampLimit(raw,5,90) + E2E #172)
[x] 173. 에러코드 불일치 → 완료 (P3c / EMAIL_TAKEN→EXISTS·PROMOTION→PROMO·400 NOT_FOUND 3종→404·코인부족→409·직원비활성/웹훅시크릿→403 + E2E #173)
[x] 174. OPENAPI 누락 → 완료 (P3c / Auth 5종·상품/주문/스태프 상세·슬롯·웹훅 3종 추가 + E2E #174)
[x] 175. /out/ 중복 버전 → 완료 (P3c / 정식 /api/v1/out + bare 308 리다이렉트 + E2E #175 + verify T18 갱신)
[x] 176. 미변경행 updated 카운트 → 완료 (P3c / UPDATE 발행분만 카운트 + E2E #176)
[x] 177. 파트너 감사누락 → 완료 (P3c / 로그인실패·대시보드 감사 + E2E #177)
[x] 178. 공개 인텔 → 완료 (P3c / 공개 플래그는 boolean map만(registry 삭제, 무소비 확인) + E2E #178. 레지스트리·health는 #41·#162 해소済)
[x] 179. 남용방어 불균형 → 완료 (P3c / requireAdmin·requirePartner에 admin·partner 300/60 (API키 경로 포함) + E2E #179. "+400"은 해석 불가라 선례값 적용으로 기록)
[x] 180. 파트너 PATCH 형식 미검증 → 완료 (P3c / 연락처·계좌·세금메일 형식검증(이름은 자유) + E2E #180)
[x] 181. 디스패치 순서 결합 → 완료 (P3c / 명명 라우터테이블+2건 우선순위 문서화 — 동작 불변, 전체 E2E로 증명)
[x] 182. 위시/알림 검증 → 완료 (P3c / 위시 도메인 allowlist+가격 정수검증 + E2E #182. 알림은 이미 엄격 검증됨 확인)

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

