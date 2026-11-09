# OTA 전수 감사 — 빠진 것 전부 (2026-11-09)

> 대상: `main@f0a2d31`. 방법: 6개 병렬 감사(worker-api·worker-data·frontends·tests-ops·security·go-backend)
> + 크리틱 반증(2건 기각·수건 축소·중복 제거) + 본 세션 직접 재확인 6건.
> 결과: **blocker 1 + major 53 + minor 38**. 아래 `[B]/[M]/[m]` + 파일:행 + 심볼.
> (m): 본 세션이 직접 본문을 읽고 확인한 항목.

## [B] Blocker 1건

- (m) [B] `scripts/migrate-d1.js:3-12,337-341` runD1이 `--remote ota_production` 고정.
  파트너 3행(`ptn_htl_01/tour/car_01`)을 **동일 PBKDF2 해시+솔트**로 시드하고,
  매 실행마다 `ON CONFLICT pw reset`. 완화: package.json·CI·훅에서 참조 안 함(수동 실행 전용).

## 돈·정산·코인 (장부 무결성)

- [M] `worker/src/services/marketplace-service.ts:72-100,140-163` 귀속 정보 없는 상품의
  seller/commission을 합성해 `createOrderSettlement`로 **가짜 정산행 영속화**.
- [M] `worker/src/services/booking-service.ts:740-744,768-772` issue()가 정산행을
  배치 밖 `catch+warn`으로 생성. 결제済 예약이 정산행 없이 조용히 누락, 크론 백필 없음.
- [M] `worker/src/services/booking-service.ts:802-837` processRefund가 REFUNDED를
  절대 안 찍음(유일 UPDATE는 `marketplace.ts:81-85` →SETTLED). 환불済 주문이 지급 가능 상태로 잔류.
- [M] `worker/src/routes/admin.ts:803-806` 코인 조정 CAS가 `meta.changes` 미확인인데
  항상 ledger INSERT → 동시 수정 시 잔액·원장 괴리.
- [M] `worker/src/routes/admin.ts:770-813` 코인 조정에 Idempotency-Key 없음. 재시도 시 이중 적용.
- [M] `worker/src/*` 하한가/최저가 로직 전무. `pricing.ts:174` PROMO_MIN_ORDER만 존재.
  WO-OTA "재고 홀딩+하한가"의 하한가 절반에 코드 없음.
- [M] `worker/src/routes/partner.ts:500` `partner_settlement_batches`에 INSERT가
  레포 전체에 없음. 파트너 정산 조회는 항상 빈 결과.
- [m] `worker/src/services/marketplace-service.ts:151` `settlement.booking_item_id`를
  `item_${itemId}`로 날조. 실제 `bki_*` ID와 매칭 불가.

## 보안·인증·PII

- (m) [M] `worker/src/routes/partner.ts:272-276` 프로필 GET이 `SELECT *`+spread로
  **password_hash를 클라이언트에 반환**. 테스트 커버리지 없음.
- (m) [M] `worker/src/routes/webhooks.ts:21-55` 서명/시크릿/IP 검증 전무.
  미인증 호출이 payment_events 오염 + orderId 존재 오라클. 완화: 돈은 PG 조회로만 확정.
- [M] `worker/src/routes/bookings.ts` rateLimit 호출 0. 견적/예약/결제확인/취소 무제한.
  `user.ts:113-126` 쿠폰 클레임이 PROMO_NOT_FOUND vs ALREADY_CLAIMED 오라클 누출.
- [M] `worker/src/routes/partner.ts:108,122` staffRole은 로그인 시 세팅되나 어디에서도
  미검사. STAFF가 은행정보 PATCH·스태프 관리·주문 확정/거절 전부 가능.
- [M] `worker/src/lib/auth.ts:44-48` requireUser가 DB 재조회 안 함. 정지 수단 없음
  (`admin.ts:778-780`), JWT TTL 7일(`crypto.ts:124`). 강등된 ADMIN이 통과(`bookings.ts:56`).
- [M] `worker/src/lib/crypto.ts:86-94` 레거시 고속 SHA-256 + 고정 솔트(`_gft_salt_2026`)
  여전히 수락. 로그인한 유저만 재해시.
- [m] `worker/src/routes/partner.ts:186-204` 파트너 비번리셋이 `meta.changes` 미확인.
  동시 이중 사용 시 2회 리셋.
- [m] `worker/src/env.ts:19` SANDBOX_WEBHOOK_SECRET 선언만 있고 검증 경로 전무.
- [m] 파트너 비번 정책 8자·복잡도 없음 vs 유저 10자+영문+숫자. MFA 전무.
- [m] `worker/src/services/booking-service.ts:1049` serializeBooking이 viewer 무시.
  어드민 예약 목록이 customer_email 노출(상세는 감사되는데 목록은 미감사).
- [m] `wrangler.jsonc:29` 운영 CORS에 `http://localhost:*` 포함 + `http.ts:54` 하드코딩 폴백.
- [m] `worker/src/lib/sentry.ts:33-38` 스크럽이 메일·시크릿쿼리만. 여권/전화/JWT 미포함.
- [m] logout·비번리셋에 토큰 폐기 없음. 7일 JWT + requireUser 미재조회로 탈취 세션 장기 유효.

## 이행·공급사·LIVE 게이트

- [M] `worker/src/suppliers/adapter.ts:114-118`에 `api` 구현이 없는데
  `admin.ts:263`은 LIVE+api 허용. 결제 후 book() FAILED → 자동 전액환불.
- [M] `worker/src/suppliers/adapter.ts:92-94` direct_contract ticket() 항상 FAILED.
  운영자 CONFIRM 후 PNR void + 전액환불. **1P 항공은 발권 불가**.
- [M] `worker/src/routes/admin.ts:277-300` PATCH entities/:id E2E 0건.
  개통 1단계(ACTIVE 전환) 게이트가 테스트 없이 매달림.
- [M] `worker/src/routes/marketplace.ts:36-96` 정산 settle 포함 E2E 0건.
- [m] GET entities 목록도 전 스위트 커버리지 0 (읽기 전용이라 minor).

## 죽은 기능·무효 스위치 (WO-OTA 판정 영향)

- [M] 어필리에이트 영구 사망: `affiliate_partners_config`에 INSERT가 레포 전체에 없음.
  `/out/*` 항상 404, postback 항상 UNKNOWN_PARTNER. (개통 리포트 WO-OTA 07 근거 흔들림)
- [M] 최저가 알림 발화 불가: POST는 저장만(`user.ts:44-56`). 비교·크론·템플릿 전무.
  (WO-OTA 02 근거 흔들림)
- [M] ESIM/보험 견적 불가: `pricing.ts:10` 7개 도메인만, `catalog.ts:68-152` case 없음.
  airalo 어댑터는 미배선 데드코드.
- [M] 파트너/ingest/마켓 호텔 예약 불가: INSERT가 rooms_json 누락(기본 `[]`),
  loadProduct ROOM_REQUIRED throw. PATCH로 객실 추가도 불가.
- [M] `worker/src/routes/catalog.ts:516-522` 슬롯 3개 하드코딩(날조 booked_count/가격).
  예약 플로우는 읽지 않음. E2E 0건.
- [M] `worker/src/routes/partner.ts:373,407` 파트너 재고 쓰기만 하고 견적/예약이
  읽지 않음. 파트너 캘린더 수정은 효과 0.
- [M] 4개 도메인(항공/열차/픽업/패키지) is_active 무시. 목록 `WHERE 1=1`,
  상세·loadProduct도 미검사. 어드민 판매중지 silently 무효.
- [M] FX 읽기전용+고정: 쓰기 API·갱신잡 없음. 0001 시드 고정환율. 견적은 저장값 스냅샷.
- [m] `trip_moments.likes_count` 증가 엔드포인트 없음. 항상 0.
- [m] SMS/KAKAO outbox 데드: CHECK는 허용하나 발송은 EMAIL만. 행은 PENDING 영구.
- [m] `entity_change_log` 쓰기 전용. 조회 API 없음.
- [m] `saved_travelers`가 예약에 안 쓰임. CRUD만 있고 import 없음.
- [m] COMPLETED 상태로 전이시키는 writer가 없음. 데드 터미널 상태.

## 테스트·CI·배포 파이프라인

- (m) [M] `.github/workflows/deploy.yml`에 E2E 단계 없음. 60개 E2E는 CI에서 미실행.
  verify-production도 배포 후 미실행. 41종 게이트는 수동 전용인데 GO_LIVE 전제로 깔림.
- (m) [M] deploy.yml·`build-and-deploy.js`에 D1 마이그레이션 단계 없음.
  운영 스키마는 수동 적용만. 코드가 스키마보다 앞서 배포될 수 있음.
- [M] `package.json`에 typecheck/lint 게이트 없음(tsc/eslint 부재).
  wrangler esbuild가 타입 미검사 스트립. TS 에러가 조용히 운영행.
- (m) [M] `.githooks/post-commit:19-20`이 매 커밋마다 운영 배포. 브랜치 체크·테스트 없음.
  완화: SKIP_DEPLOY·[skip deploy] 탈출구 있음. 본 세션에서 설치됨 확인(core.hooksPath).
- [M] `scripts/verify-production.js:973-979` T41이 **실운영 payout을 settle**.
  dry-run 플래그 없음.
- (m) [M] `scripts/verify-production.js:192` 운영 어드민 비번 폴백 하드코딩
  (`AdminProdPass#2026_SecureKey`, Go `handlers.go:564`와 동일 문자열). 미설정 시 실로그인 시도.
- [M] `scripts/verify-production.js:294-301` T12의 2xx 성공 분기가 assert 없음.
  운영이 예기치 판매해도 통과.
- [M] notices 표면 커버리지 0: `admin.ts:354,357,883-891`, `catalog.ts:471`.
- [M] `user.ts:64,83,100` PII 암호화 여권지갑 E2E 0건. 503 경로 미행사.
- [m] E2E 0건 라우트: feature-flags(+admin), suppliers/registry, esim/insurance plans,
  payments/config, partner/profile, admin/ingest, marketplace/*, `/out/` 성공계.
  후자는 운영검증에만 있어 회귀가 운영에서만 발견됨.
- [m] 전 스위트 0건: GET fx-rates, GET user/coupons, POST auth/logout, 410 스텁.
- [m] T36(826-829)·T41(971-972)은 조건 미충족 시 조용히 스킵인데 41/41에 카운트.
- [m] T11은 409/400 둘 다 허용(어느 가드가 쐈는지 마스킹). T27은 workers.dev 하드코딩.
- [m] `api.e2e.mjs:794` 페이지 겹침 검사가 `total>2` 안에서만. `:909/916/924` 이중형태 허용.
- [m] `worker/test/unit`은 9파일만. `src/lib`+`src/services` 유닛 0. E2E에만 의존.
- (m) [m] `dev-seed.mjs:39` 랜덤 어드민 비번 vs E2E 기본값 불일치.
  완화: 스크립트 헤더에 `[adminPassword]` 인자 문서화됨. E2E 헤더에는 언급 없음.

## 프론트 3포털

- [M] `frontend-user/stores/currency.ts:23` fetchRates가 `json.data`를 읽는데
  워커는 `{success,rates}` 반환. 환율 영영 미갱신 + 폴백 포트 8080(현행 8787과 불일치).
- [m] `frontend-user/pages/checkout/index.vue:352` display 분기는 데드
  (displayCurrency 미전송 → 항상 null). `/100`은 0소수 통화에서 오답.
- [m] 운영 호스트 하드코딩(시크릿 없음·env 재정의 가능) 5곳. Sentry DSN은 env 전용으로 양호.
- [m] `frontend-user/stores/wishlist.ts:129-162` add/removePriceAlert 데드코드.
  initWishlist 가드가 서버 비움 후에도 로컬 잔재 유지.

## Go 백엔드 (배포 배선상 데드 + 워커와 괴리)

- [M] Go는 배포 배선상 데드: Dockerfile·매니페스트 없음. build·wrangler·CI가 Go 참조 안 함.
- [M] 엔벨로프 괴리: Go `{code,data,timestamp}` vs 워커 `{success,...}`. 동일 경로 다른 형태.
- [M] 예약 모순: Go는 POST calculate·pay 서빙, 워커는 둘 다 410. Go에 quotes·payments/confirm 없음.
- [M] Go 전용 표면이 워커에 없음: /filters*, /sse/events, /webhook/ingest, /curated/*, admin transition.
- [M] Go에 워커 상거래 표면 없음: auth·위시·여권·쿠폰·마켓·웹훅·어드민/파트너 ops 전무.
- [M] 경로+인증 괴리: Go `/partner/bookings` vs 워커 `/partner/orders`.
  Go `/bookings/user/{userId}` 미인증 vs 워커 본인+인증.
- [M] `frontend-admin/vite.config.ts:20`이 /api를 Go :8080으로 프록시.
  로컬 개발은 Go 형태, 운영은 워커 형태를 받음.
- [M] 툴체인: go.work 1.27 vs go.mod 1.23 vs CI 1.23.
- [M] `backend/.env.example`이 읽지 않는 값 문서화 + 실제 읽는 값(JWT_SECRET 등) 누락.
- [M] 27개 Go 핸들러 무테스트.
- [m] Go aggregator·Store 일부 메서드 데드. ARCHITECTURE GCoins 명세·구현 불일치(구현끼리는 일치).
- [m] 잔재: `reports/generate_audit_suite.js`·CSV의 :8080 전제, `backend/api.exe` 11MB.
- [m] 헬스체크 형태 괴리: Go `{status:UP}` vs 워커 `{status,checks}`.

## 데이터·스키마·시드

- [M] 카탈로그/프로모/어필/유저 시드 0건. fresh DB는 목록 빈칸·상세 404·쿠폰 데드.
- [M] 0005 마켓 시드 dangling: `sup_airalo_01` 등이 suppliers에 없음. FK 없이 조용.
- [M] 크론 중복 실행 무잠금: runMaintenance + 수동 POST 충돌 시 전체 중단.
  outbox/웹훅 flush는 SELECT-후-UPDATE라 중복 발송 가능.
- [M] 데드 테이블: `idempotency_keys`, `partner_cancellations`. src 참조 0.
- [m] fresh DB는 ent DRAFT·전 공급사 NOT_INTEGRATED라 전 판매 SALES_NOT_ENABLED. 수동 PATCH 필요.
- [m] `bookings.partner_id` 의미 혼용(FK 없음). 직판 예약은 파트너 웹훅 미발송.
- [m] FK 없는 dangling 체인 전반(quotes·bookings·items·ledger·marketplace·settlements).
- [m] 0004 `ing_sample_02` PUBLISHED인데 published_item_id NULL. 영원히 발행 불가.
- [m] 무제한 증가: quotes·holds·api_calls·payment_events·클릭·outbox에 prune 없음.
- [m] 레거시 `*_krw` 주석과 실제(마이너 단위 정수 기록) 모순. KRW라서 우연히 일치.

## 문서·설정 모순

- (m) [M] `reports/GO_LIVE_CHECKLIST.md`(10-18)가 15/15 GO 선언.
  `docs/GO_LIVE_CHECKLIST.md`(수동 0-8단계)·본 개통리포트(조건부 GO)와 정면 모순.
- (m) [M] `wrangler.jsonc:28-32`에 EMAIL_FROM·TOSS_CLIENT_KEY·PAYMENT_PROVIDER 없음.
  개통문서가 지시하는 운영 설정이 레포에 재현 불가.
- (m) [M] 포트 괴리: README·E2E 기본 `:8799`인데 레포 어디에도 --port 설정 없음.
  PUBLIC_SITE_URL은 :8787.
- [M] README:40이 `ota_production --local` 시드 지시. dev-seed는 ota_local 사용.
  0001~0008 자동적용 주장도 구버전(현행 0020).
- [m] ALLOWED_ORIGINS가 파일마다 다름. CI node 22 vs .node-version 24.

## 크리틱이 기각한 것 (오탐, 조치 불필요)

- TRANSFER 하드코딩 주장: `catalog.ts:128`이 `t.partner_id`를 읽음. 기각.
- worker-data 무테스트 주장: unit 9파일+E2E 존재. 기각.
- REALTIME/AUTO 플래그·affiliate/marketplace E2E 카운트 인용: 미검증으로 제외.

## 미검증 범위 (이번 감사에서 못 본 것)

- 운영 D1 실내용·대시보드·DNS·Go 호스트 트래픽. T41의 운영 행생성 절반.
- 마이그레이션 재실행·부분실패·D1 배치 원자성. `rotate-partner-password` 미감사.
- Go 내부(jwt 등)·admin 라우터 전체·토큰 저장소·클라이언트 Sentry 스크럽.
- CatalogView collectBody vs catalogSpec 필드 단위 대조(spot-check만).

## 다음 액션 제안 (순서)

1. [B] `migrate-d1.js` 무력화: --remote 기본 제거 또는 파일 삭제 + 운영 파트너 비번 로테이션.
2. [M] 파트너 프로필 password_hash 누출 제거 + 회귀 테스트.
3. [M] 토스 웹훅 서명 검증(또는 IP ALLOW) + verify 스크립트 하드코딩 비번 제거.
4. [M] T41 dry-run화 + CI에 E2E·마이그레이션·타입체크 게이트 추가.
5. [M] 1P 항공 발권 불가·LIVE+api 허용 범위 결정(코드 or 정책).
6. 문서 모순 해소: `reports/GO_LIVE_CHECKLIST.md` 폐기·보관 처리 + wrangler vars 확정.

## 조치 현황 (2026-11-09 후속 세션 — 6건 전부 완료, 미커밋)

- #1 [B] 해소: `scripts/migrate-d1.js` → 실행 거부 스텁. 신규 `0021`이 4a78ff 해시 무력화
  (로컬+운영 적용. 운영 3행은 이미 0010-DISABLED라 0021은 no-op 확인).
  `database/d1_schema.sql`의 공유 해시 4행 스크럽 + `ON CONFLICT DO NOTHING`화.
  잔여: untracked 사용자 파일 `temp_master_prompt.md:1181-1187`에 제3 변형 해시 존재.
  사용자 소유 파일이라 미수정 — 직접 삭제 권장. 이를 심는 레포 코드는 없음.
- #2 [M] 해소: `partner.ts` 프로필 GET 명시 컬럼(비밀번호·레거시 키 제외).
  로그인·대시보드 응답은 누출 없음 확인. E2E 회귀 테스트 추가 (역검증 레드→그린 입증).
- #3 [M] 해소: 토스 웹훅 미서명 확인(외부 문서 대조) — PG 조회가 곧 검증임을 주석 명시.
  미지정 주문 응답을 제네릭으로 통일(중복 분기 포함) + 오라클 회귀 테스트.
  `verify-production.js`·Go `handlers.go`의 하드코딩 어드민 비번 제거 (env 필수).
- #4 [M] 해소: T41 기본 dry-run (`VERIFY_LIVE_SETTLE=1` 시에만 실정산, 스킵 카운트 분리).
  CI를 gate→deploy 2단계로 분리: 브랜딩·Go·유닛·타입체크·마이그레이션 검증·E2E 전부
  통과해야 배포. `npm run typecheck` 신설 (기존 타입에러 2건 수정) + typescript devDep.
  `docs/GO_LIVE_CHECKLIST.md` 전제·6단계 문구 갱신.
- #5 [M] 해소(코드): `bookabilityOf`에서 LIVE+api 판매 차단 + 항공×직계약은
  견적·예약 양쪽 게이트에서 409. 목록·상세 플래그도 동일 규칙. E2E 2종 추가.
  어드민 LIVE 표시는 계약 상태로 유지 (주석 명시).
- #6 [M] 해소: 구 GO 판정문 보관 처리 (`reports/archive/*_SUPERSEDED.md` + 인용 금지문).
  `wrangler.jsonc`에 `PAYMENT_PROVIDER=toss` 선언 (키 없이 DISABLED 유지 확인).
  TOSS_CLIENT_KEY·EMAIL_FROM은 실값 없어 미선언 (문서 4·6단계가 담당).

검증: 유닛 63/63 · E2E 63/63 · tsc 0 · 브랜딩 PASS · Go ok · 3포털 빌드 exit 0.
