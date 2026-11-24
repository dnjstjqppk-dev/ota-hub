# Go-Live Checklist — PG 계약 후 바로 장사하기

> 전제: `main` 최신이 CI로 배포되어 있고, 운영 verify 50/50이다:
> `BASE_URL=https://ota-hub.dnjstjqppk.workers.dev VERIFY_ACK_PROD=1 TEST_ADMIN_PASSWORD='...' node scripts/verify-production.js`.
> (기본 엄격 모드: 스킵이 있으면 실패. T41 실정산 없이 통과하려면 `VERIFY_ALLOW_SKIP=1`,
> 실정산까지 수행하려면 `VERIFY_LIVE_SETTLE=1`을 붙인다. 운영 기본값은 읽기전용 변형
> (T34/T36/T40은 스테이징 또는 `VERIFY_ALLOW_MUTATION=1`에서만 실제 변경). 스크립트 기본
> 타깃은 로컬 개발 서버라 운영 실행은 반드시 BASE_URL+VERIFY_ACK_PROD 명시(미확인 시 거부).
> 실행 후 생성된 탐색 계정은 자동 정리(탈퇴 불가분은 리포트로 보고). CI는 유닛·E2E·타입체크·
> 마이그레이션 검증을 통과해야 배포하고, 배포 직후 무인증 스모크(`scripts/smoke-production.js`)를 실행한다.)
> 아래 순서는 의존성 순서다. 각 단계의 확인 명령을 통과해야 다음으로 간다.

## 0. 직영 공급사 준비 (코드 배포 후 1회)

Cloudflare Workers 유료 플랜이 필요하다. 비밀번호 해시(PBKDF2
100k)는 무료 플랜 10ms CPU 예산을 초과할 수 있어 로그인·가입이
실패할 수 있다. 기본값을 낮추는 대신 유료 플랜을 전제로 한다
(측정치·근거: `worker/src/lib/crypto.ts` C9 주석).

배포 파이프라인(`scripts/build-and-deploy.js`)이 D1 마이그레이션을 코드보다 먼저
원격 적용하고 저널 5행을 출력해 검증한다(#51). `SKIP_D1_MIGRATE=1`로 건너뛴 경우에만
아래를 수동 실행한다.

```powershell
npx wrangler d1 migrations apply ota_production --remote
npx wrangler d1 execute ota_production --remote --command "SELECT id, adapter, integration_status FROM suppliers WHERE id = 'ptn_direct_01';"
# 기대: ptn_direct_01 | direct_contract | NOT_INTEGRATED
```

> 0027(수용량) 주의: `daily_capacity`가 NULL인 액티비티·픽업·패키지는
> 견적·예약이 409로 거부된다. 마이그레이션 백필(30/10/16)은 그 시점 행에만
> 적용되므로, 운영 상품의 실수용량을 어드민 카탈로그에서 반드시 검토·설정한다.
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT COUNT(*) FROM activities WHERE daily_capacity IS NULL) AS act, (SELECT COUNT(*) FROM transfers WHERE daily_capacity IS NULL) AS trf, (SELECT COUNT(*) FROM packages WHERE daily_capacity IS NULL) AS pkg;"
> # 기대: 전부 0 (판매 개시 전)
> ```
>
> 0037(이행 정합) 주의: 판매 경로 없는 1P 4행(ESIM·보험·항공·철도)이 PAUSED로
> 공개 카탈로그에서 내려간다(정산 귀속은 상태 무관이라 영향 없음). trains·packages에
> partner_id가 생기지만 기존 행은 NULL(미배선)이라 견적이 409로 거부된다.
> 철도·패키지 판매 개시 전 공급사 계약 후 행별 partner_id를 반드시 배선한다.
> (0037이 OFF로 두었던 자동화 플래그 4종은 0038에서 레지스트리에서 삭제된다.
> 아래 0038 확인 쿼리로 대체한다.)
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT COUNT(*) AS paused FROM marketplace_catalog_items WHERE id IN ('mkt_esim_jp_01','mkt_ins_standard','mkt_flt_ke723','mkt_trn_ktx_025') AND status = 'PAUSED';"
> # 기대: paused 4
> ```
>
> 0038(운영 정합) 주의: 강제되지 않던 플래그 12종(ESIM·보험·AI번역·실시간재고·
> 즉시확정·자동발주 2종·자동취소환불·자동정산 3종·공급사API)이 레지스트리에서
> 삭제된다. 토글이 아무 코드도 거치지 않았으므로 동작 변화는 없다.
> FLIGHT_BOOKING의 죽은 선행조건도 함께 제거된다. PARTNER_SELF_PRODUCT_REGISTRATION
> 행이 없을 때만 백필된다(운영자 토글은 보존). 크론 하트비트 테이블이 생기며
> `/health`의 `checks.cron`으로 최근 실행·stale을 감시한다.
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT COUNT(*) FROM feature_flags) AS flags, (SELECT COUNT(*) FROM feature_flags WHERE key IN ('ESIM','TRAVEL_INSURANCE','AI_TRANSLATION','REALTIME_INVENTORY_SYNC','AUTO_BOOKING_CONFIRMATION','PARTNER_AUTO_DISPATCH','AUTO_BOOKING_DISPATCH','AUTO_CANCEL_REFUND','AUTO_SETTLEMENT','AUTO_PARTNER_SETTLEMENT','AUTO_SUPPLIER_SETTLEMENT','SUPPLIER_API_INTEGRATION')) AS theater, (SELECT COUNT(*) FROM feature_flags WHERE key = 'PARTNER_SELF_PRODUCT_REGISTRATION') AS selfreg, (SELECT name FROM sqlite_master WHERE name = 'cron_heartbeats') AS heartbeat;"
> # 기대: flags 13, theater 0, selfreg 1, heartbeat cron_heartbeats
> ```
>
> 0039(환불 단일화) 주의: 예약당 PENDING 환불 1건 강제 유니크 인덱스가
> 생긴다. 적용 전 중복 PENDING이 있으면 인덱스 생성 자체가 실패하므로
> 반드시 먼저 해소한다(한 건이 끝날 때까지 기다리거나 중복분을 만료).
> 이후 동시 환불 시도는 409 REFUND_IN_PROGRESS로 거부된다.
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT booking_id, COUNT(*) c FROM refunds WHERE status = 'PENDING' GROUP BY booking_id HAVING c > 1;"
> # 기대: 0행
> ```
>
> 0040(인덱스·귀속) 주의: 조회 인덱스 3종 추가와 함께 실존 파트너가
> 아닌 bookings.partner_id·flights.partner_id가 NULL로 정리된다(편도).
> 항공 공급사 해석은 폴백(ptn_flt_01)으로 동일하게 유지되므로 판매·정산
> 귀속은 변하지 않는다. transfers의 'unassigned_transfer' 표식은 의도된
> 미배정 표시라 유지된다.
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT COUNT(*) FROM flights WHERE partner_id IS NOT NULL AND partner_id NOT IN (SELECT id FROM partners)) AS dangling_flights, (SELECT COUNT(*) FROM bookings WHERE partner_id IS NOT NULL AND partner_id NOT IN (SELECT id FROM partners)) AS dangling_bookings;"
> # 기대: 둘 다 0
> ```
>
> 0041(어드민 MFA) 주의: `admin_mfa_secrets` 테이블이 생긴다. 기존 어드민은
> TOTP 등록 전까지 종전대로 로그인되며, 등록·확정 후 12시간 토큰+MFA가
> 적용된다. 운영 작업 없음(어드민별 등록은 콘솔에서).
>
> 0042(슬롯 클레임) 주의: `booking_items`에 nullable 2컬럼+인덱스,
> `activity_time_slots`에 갱신시각 1컬럼이 추가된다. 기존 행 영향 없음.
>
> 0043(데드테이블 제거) 주의: 무참조 `partner_cancellations`가 DROP된다.
> 쓰는 코드가 없어 손실 행은 없으나 되돌릴 수 없으니 적용 전 백업을 확인한다.
>
> 0044(정수 합계 백필) 주의: `total_minor` NULL 행이 REAL `total_price`에서
> 채워진다. 이후 목록·상세는 정수 컬럼만 읽는다. 적용 후 NULL 잔여 확인:
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT COUNT(*) AS null_minor FROM bookings WHERE total_minor IS NULL;"
> # 기대: 0
> ```
>
> 0045(분석 이벤트) 주의: `analytics_events` 테이블이 생긴다. 7개 도메인
> 목록/상세·예약생성과 함께 적재되며 90일 보존 후 유지보수가 삭제한다.
> 기존 행 영향 없음. 운영 작업 없음.
>
> 0046(잡 큐) 주의: `job_queue` 테이블+인덱스 2종이 생긴다. 공급사 타임아웃
> 예약이 크론 펌프로 재시도·보상되기 시작한다(최대 5회·백오프, 소진 시
> 전액 자동환불 + 데드레터 감사). 기존 행 영향 없음. 적용 후 확인:
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT name FROM sqlite_master WHERE name = 'job_queue') AS q, (SELECT COUNT(*) FROM job_queue WHERE status = 'DEAD') AS dead;"
> # 기대: q job_queue, dead 0 (누적 시 어드민 /admin/jobs로 확인)
> ```
>
> 0047(상용화 감사) 주의: reviews 컬럼 6종 + 신규 테이블 5종(문의 스레드·
> 예약 메시지·읽음 상태·마케팅 슬롯·소셜 계정 연결). 가산형이라 기존 행 영향
> 없음. 적용 후 확인:
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT name FROM sqlite_master WHERE name = 'marketing_slots') AS mkt, (SELECT name FROM sqlite_master WHERE name = 'booking_messages') AS msg, (SELECT name FROM sqlite_master WHERE name = 'support_ticket_messages') AS tkt;"
> # 기대: mkt marketing_slots, msg booking_messages, tkt support_ticket_messages
> ```
>
> 0048(장애 기록) 주의: `incidents` 테이블+인덱스가 생긴다. 공개 `/status`와
> SLO 대시보드가 읽는다. 기존 행 영향 없음. 적용 후 확인:
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT name FROM sqlite_master WHERE name = 'incidents') AS i, (SELECT COUNT(*) FROM incidents WHERE status = 'OPEN') AS open;"
> # 기대: i incidents, open 0 (OPEN이 있으면 /status가 degraded/outage)
> ```
>
> 0049(검색 FTS) 주의: `catalog_fts` 가상 테이블 + 도메인별 동기화 트리거
> 21종이 생기고 기존 상품이 백필된다. 이후 상품 CUD는 트리거가 자동 반영.
> 적용 후 확인:
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT COUNT(*) FROM catalog_fts) AS fts, (SELECT COUNT(*) FROM (SELECT id FROM hotels UNION ALL SELECT id FROM flights UNION ALL SELECT id FROM trains UNION ALL SELECT id FROM cars UNION ALL SELECT id FROM transfers UNION ALL SELECT id FROM activities UNION ALL SELECT id FROM packages)) AS base;"
> # 기대: fts == base (행수 일치 — 불일치 시 트리거 누락 의심)
> ```
>
> 0050(사기심사) 주의: `fraud_reviews` 테이블+인덱스 2종이 생긴다(가산형).
> `FRAUD_REVIEW=1`을 켜기 전에는 행이 쌓이지 않는다.
>
> 0051(NDC·GDS 기반) 주의: `suppliers` 테이블이 재구축된다(adapter CHECK에
> ndc·gds 추가 — 0034와 동일한 방식). 행 복사가 포함되니 적용 전후 행수를
> 대조한다. 신규 `airport_mappings`(20행)·`airline_mappings`(10행)·
> `fare_cache`+인덱스는 가산형. 적용 후 확인:
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT COUNT(*) FROM suppliers) AS sup, (SELECT COUNT(*) FROM airport_mappings) AS ap, (SELECT COUNT(*) FROM airline_mappings) AS al, (SELECT name FROM sqlite_master WHERE name = 'fare_cache') AS fc;"
> # 기대: sup 적용 전과 동일, ap 20, al 10, fc fare_cache
> ```
>
> 롤백 시: 재구축 전 백업에서 `suppliers` 복원 (단순 DROP 불가).
>
> 0052(웨어하우스·추천) 주의: `fact_daily`·`reco_pairs`·`reco_popular`·
> `experiment_assignments`·`reco_exposures` 5종 + 인덱스 5종이 생기고
> `RECO_V1` 플래그가 ON으로 시드된다(가산형). 기존 행 영향 없음.
> 첫 배치는 크론이 자정 후 자동 수행(어제분) — 당일 확인이 필요하면
> 어드민 `POST /api/v1/admin/warehouse/rollup {"date":"YYYY-MM-DD"}`.
> 적용 후 확인:
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT name FROM sqlite_master WHERE name = 'fact_daily') AS f, (SELECT is_enabled FROM feature_flags WHERE key = 'RECO_V1') AS reco;"
> # 기대: f fact_daily, reco 1
> ```
>
> 0053(마크업·봇·다이제스트) 주의: `pricing_decisions`·`review_digests`·
> `bot_reports` 3종 + `support_tickets.handoff_at` +
> `settlements.markup_minor` + 플래그 2종(`DYNAMIC_MARKUP`·`CS_BOT`,
> OFF 시드). 전부 가산형. 플래그를 켜기 전에는 가격·응대 동작이
> 기존과 동일하다. 켤 때는 DYNAMIC_MARKUP부터 1개씩, 지표 API로
> 양팔을 확인하면서 올린다. AI 바인딩(`wrangler.jsonc`에
> `"ai": { "binding": "AI" }`)은 스테이징 실측 후 운영자가 추가한다.
> 적용 후 확인:
>
> ```powershell
> npx wrangler d1 execute ota_production --remote --command "SELECT (SELECT COUNT(*) FROM pricing_decisions) AS pd, (SELECT is_enabled FROM feature_flags WHERE key = 'DYNAMIC_MARKUP') AS mk, (SELECT is_enabled FROM feature_flags WHERE key = 'CS_BOT') AS bot;"
> # 기대: pd 0, mk 0, bot 0
> ```

## 1. 판매주체 ACTIVE (사업자 정보 필요)

어드민 콘솔 Suppliers/Entities 화면 또는 API로 실정보를 입력하고 ACTIVE로 전환한다.
ACTIVE에 필수인 5종: 사업자등록번호, 관광사업(여행업) 등록번호,
통신판매업 신고번호, 대표자, 고객센터 연락처.

```powershell
# 예시 (ADMIN 토큰 필요)
$body = @{ legal_name = "..."; business_registration_no = "..."; travel_agency_license_no = "..."
  ecommerce_registration_no = "..."; representative_name = "..."; cs_phone = "..."
  cs_email = "..."; status = "ACTIVE" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri https://ota-hub.dnjstjqppk.workers.dev/api/v1/admin/entities/ent_primary `
  -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" -Body $body
```

확인:

```powershell
(Invoke-RestMethod 'https://ota-hub.dnjstjqppk.workers.dev/api/v1/health?verbose=1' -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" }).checks.sellerEntityActive
# 기대: True
```

## 2. 직영 계약 활성화 + 상품 등록 + LIVE 전환

1. 자사 직영 계약 활성화 (시드 `ect_direct_01`, PENDING으로 심어져 있음):

```powershell
Invoke-RestMethod -Method Patch -Uri https://ota-hub.dnjstjqppk.workers.dev/api/v1/admin/contracts/ect_direct_01 `
  -Headers @{ Authorization = "Bearer $ADMIN_TOKEN" } -ContentType "application/json" `
  -Body '{"status":"ACTIVE"}'
```

2. 어드민 카탈로그에서 상품 등록. `partner_id`는 반드시 `ptn_direct_01`.
   (호텔은 `rooms_json`에 객실·재고 포함. 재고 없는 객실은 품절 처리된다.)
3. 어드민 Suppliers에서 `ptn_direct_01` → `integrationStatus: LIVE`.
4. 공개 카탈로그에서 해당 상품의 `bookable: true`, `fulfilment_mode: "LIVE"` 확인.

롤백: 같은 스위치를 `NOT_INTEGRATED`로 되돌리면 즉시 판매중지(견적 409).

## 3. 여권 암호화키 (항공 판매 시 필수)

없으면 여권 포함 예약이 503이다. 32바이트 base64 키를 생성해 시크릿 등록.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npx wrangler secret put PII_ENC_KEY
```

확인(어드민 토큰 필요): `/api/v1/health?verbose=1` → `piiEncryptionKey: True`.

## 4. 도메인 연결 (메일·PG보다 먼저)

메일 링크(재설정·예약확정)는 `PUBLIC_SITE_URL`으로 나가고, Resend 발신
도메인 인증도 DNS를 요구한다. 미연결 상태에서 메일·PG를 먼저 열면 링크가
죽은 도메인을 가리킨다(#63). DNS부터 연결한다.

```powershell
# Cloudflare 대시보드 → 각 워커 → Settings → Domains & Routes → Add Custom Domain:
#   ota-user    → getfortrip.com (+ www)   # TG-15: SSR 포털이 apex 담당
#   ota-admin   → admin.getfortrip.com
#   ota-partner → partner.getfortrip.com
# 같은 화면 → Add Route (apex의 API 경로만 hub로):
#   getfortrip.com/api/* → ota-hub
# (구 절차의 "apex → ota-hub"는 TG-15 이전 토폴로지라 폐기 — 2026-11-24.
#  SSR 포털을 apex에 두지 않으면 검색·공유·브랜드 URL이 workers.dev에 남는다.)
```

그 뒤 vars가 실도메인을 가리키는지 확인하고 재배포:
- 루트 `wrangler.jsonc`: `PUBLIC_SITE_URL=https://getfortrip.com` (이미 선언됨),
  `PARTNER_SITE_URL`을 `https://partner.getfortrip.com`으로 변경
  (현재 선언값은 `ota-partner` workers.dev),
  `ALLOWED_ORIGINS`에 실도메인 4종 포함 확인 (이미 선언됨).
- `frontend-user/wrangler.jsonc`: `NUXT_PUBLIC_API_BASE`를 `/api/v1`로 변경
  (브라우저는 apex route 경유 same-origin 호출. SSR은 서비스 바인딩 그대로 —
  `00.hub-binding.server.ts`, P0-1).
- admin/partner 포털은 `VITE_API_BASE_URL` 미설정 시 workers.dev hub를 계속
  호출한다 (CORS 허용済). 실도메인 API로 옮기려면 빌드 시
  `VITE_API_BASE_URL=https://getfortrip.com/api/v1` 주입 후 재배포.

확인: 3개 실도메인 루트 200 + `https://getfortrip.com/api/v1/health` 200
+ 카탈로그 목록/상세 200 (route 경유 확인).

## 5. 메일 발송 (Resend)

없으면 예약확정·비밀번호 메일이 outbox에 적재만 된다. 키 등록 후 크론(5분)이
밀린 메일을 자동 발송한다. 4단계에서 연결한 도메인으로 Resend 발신 인증을
먼저 마쳐야 수신이 스팸 처리되지 않는다.

```powershell
npx wrangler secret put RESEND_API_KEY
```

`wrangler.jsonc` vars에 발신자를 **추가** 후 재배포 (시크릿 아님 — 주소는 공개 정보):
`"EMAIL_FROM": "getfortrip <noreply@getfortrip.com>"` (도메인 인증된 발신자로 교체).
확인(어드민 토큰 필요): `/api/v1/health?verbose=1` → `emailProvider: RESEND`.

## 6. 오류 알림 (Sentry)

```powershell
# GitHub repo Secret: SENTRY_DSN (프론트 3종 빌드에 주입)
npx wrangler secret put SENTRY_DSN   # 워커 런타임용
```

확인(어드민 토큰 필요): `/api/v1/health?verbose=1` → `errorReporting: SENTRY`.

릴리스 태그는 배포 시 git sha로 자동 주입된다(워커 `--var` + 포털 빌드 env). 별도 등록 불필요.

## 7. PG 연결 — 토스 테스트키로 먼저 검증 (계약 직후)

상점관리자에서 테스트키(`test_sk_`, `test_ck_`)를 발급받아 등록한다.
테스트 결제는 DB에 `mode=SANDBOX`로 찍혀 실매출과 구분된다.

```powershell
# PAYMENT_PROVIDER=toss 는 wrangler.jsonc vars에 선언済 (키 없이는 DISABLED 유지)
npx wrangler secret put TOSS_SECRET_KEY   # test_sk_... 입력
```

`TOSS_CLIENT_KEY`(`test_ck_...`)는 공개키라 `wrangler.jsonc` vars에 넣고 재배포.
확인 순서:

1. (어드민 토큰) `/api/v1/health?verbose=1` → `paymentProvider: toss:SANDBOX`, `/api/v1/payments/config` → `enabled: true`.
2. 실카드가 아닌 토스 테스트결제로 1건 결제 → 운영자 확정(어드민 주문 상세) →
   바우처 발급 → 취소·환불까지 수행.
3. 어드민 정산/원장에서 해당 건이 SANDBOX로 구분되는지 확인.

## 8. PG 실키로 전환 (장사 시작)

상점관리자에서 라이브키(`live_sk_`, `live_ck_`) 발급 후 같은 자리에 교체.

확인(어드민 토큰): `/api/v1/health?verbose=1` → `paymentProvider: toss:LIVE`. 첫 실결제 1건은 소액 테스트
상품으로 결제→확정→취소·환불 풀루프를 돌리고, 토스 상점관리자 입금/취소 내역과
대사한 뒤 정상 상품 판매를 연다.

## 7S. 글로벌 PG — Stripe 테스트 (해외카드 판매 시)

대시보드에서 테스트키(`sk_test_`, `pk_test_`) 발급. `wrangler.jsonc` vars의
`PAYMENT_PROVIDER`를 `stripe`로 바꾸고 재배포 (토스와 stripe 중 하나만 활성 —
동시 운영은 후속 과제).

```powershell
npx wrangler secret put STRIPE_SECRET_KEY   # sk_test_... 입력
```

`STRIPE_PUBLISHABLE_KEY`(`pk_test_...`)는 공개키라 vars에 넣고 재배포.
확인: `/api/v1/health?verbose=1` → `paymentProvider: stripe:SANDBOX`,
3DS 테스트 카드로 인증 리다이렉트→복귀→확정 풀루프 1건.

## 8S. Stripe 실키 + 사기심사 + 웹훅 (장사 시작)

```powershell
npx wrangler secret put STRIPE_SECRET_KEY   # sk_live_... 로 교체
npx wrangler secret put STRIPE_WEBHOOK_SECRET  # whsec_... (대시보드 웹훅 등록 후)
```

대시보드 웹훅 URL에 `https://<API 호스트>/api/v1/webhooks/stripe` 등록
(이벤트: `charge.dispute.created`, `payment_intent.succeeded`).
사기심사 켜기: vars에 `"FRAUD_REVIEW": "1"` 추가 후 재배포 — 임계(60점) 초과
시도는 결제 없이 심사 대기(PENDING)로 보류되고 어드민이
`/api/v1/admin/fraud/reviews`에서 승인·거부한다. 첫 실결제 1건은
소액 테스트 상품으로 3DS 풀루프 + 차지백 시뮬레이션(대시보드 테스트 분쟁)까지
수행하고 대시보드와 대사한다.

## 7G. NDC·GDS 샌드박스 검증 (항공사 직판·GDS 판매 시)

항공사 NDC 게이트웨이 또는 GDS(Travelport 등) 샌드박스 자격 발급 후
스테이징 워커에 등록한다. 베이스 URL은 vars, 키는 시크릿:

```powershell
# wrangler.jsonc vars (스테이징): "NDC_API_BASE": "https://ndc-sandbox.<항공사>",
# 또는 "GDS_API_BASE": "https://sandbox.<GDS>" — 실연동 1곳만 활성.
npx wrangler secret put NDC_API_KEY   # 샌드박스 키 입력
# npx wrangler secret put GDS_API_KEY # GDS 택1 시
```

어드민에서 공급사 행의 adapter를 `ndc`/`gds`로 바꾸고 계약(ACTIVE) 연결 후
LIVE 전환 → `/api/v1/flights/offers` 실조회 1건 + 테스트 PNR 발급·발권·취소
풀루프 1건 (테스트 여정). 확인: `supplier_api_calls`에 BOOK:CONFIRMED →
TICKET:ISSUED → CANCEL:CANCELLED 순서대로 적재.

## 8G. NDC·GDS 실계약 전환 + 인증 (장사 시작)

1. 실계약 체결 후 운영 키로 교체 (`wrangler secret put NDC_API_KEY` /
   `GDS_API_KEY`) + 실 베이스로 vars 변경 후 재배포.
2. 항공사별 NDC 인증: v1 와이어 포맷은 JSON 스텁 계약이라 항공사 NDC XML
   프로파일(Offer/Order servicing) 인증이 별도로 필요하다. 인증 전에는
   샌드박스 PNR만 발급하고 실재고 판매를 열지 않는다.
3. DOCS/여권 manifest: v1은 여권번호를 암호화 보관만 하고 공급사에
   전송하지 않는다. 실발권에 DOCS 전송이 필요하면 별도 보안 검토 후
   manifest 항목을 확장한다 (PII 전송 범위·보관 로그 포함).
4. BSP 정산 연동 전까지는 기존 원장(정산 경로)으로 대사한다.
5. 장애 주입 리허설: 스텁 장애 시나리오로 서킷브레이커 OPEN(503+대체편)→
   복구를 스테이징에서 1회 재현하고 `SUPPLIER_BREAKER_COOLDOWN_MS`
   (기본 5분)를 운영값으로 확정한다.

## 9. 토스 웹훅 등록 (선택이나 권장)

상점관리자 웹훅 URL에 등록:

```powershell
$secret = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
npx wrangler secret put TOSS_WEBHOOK_SECRET  # 위 $secret 입력
```

```text
https://getfortrip.com/api/v1/webhooks/toss?key=$secret
```
(4단계 도메인 연결 전 임시 검증이 필요할 때만 workers.dev URL을 쓴다.)

웹훅은 힌트일 뿐 돈은 항상 PG 조회로 확정하므로(Dual-write 방지),
등록 전에도 결제는 정상 동작한다. 등록 후에는 PG 응답 유실 건이 자동 화해되고,
토스 대시보드 직접 취소·차지백도 내부 예약·재고·코인·정산에 동기화된다.

## 10. 개통 후 상시 확인

- 어드민 대시보드: `MANUAL_REVIEW_REQUIRED` 건은 매일 처리
  (PG 응답 유실·환불 실패가 여기에 쌓인다).
- `GET /api/v1/admin/reconciliation`: 원장 불균형 0 유지.
- 크론(5분)이 만료·화해·메일발송을 수행하므로 별도 배치 불필요.

## 한눈에 보는 게이트

| 순서 | 항목 | 확인 |
|---|---|---|
| 0 | 마이그레이션 0020 적용 | `ptn_direct_01` 행 존재 |
| 1 | 사업자 ACTIVE | `sellerEntityActive: True` |
| 2 | 직영상품 LIVE | `bookable: true` + `fulfilment_mode: LIVE` |
| 3 | PII 키 | `piiEncryptionKey: True` (항공 판매 시) |
| 4 | Resend | `emailProvider: RESEND` |
| 5 | Sentry DSN | `errorReporting: SENTRY` |
| 6 | 토스 테스트키 | `toss:SANDBOX` + 테스트 풀루프 |
| 7 | 토스 라이브키 | `toss:LIVE` + 소액 실거래 풀루프 |
| 8 | 웹훅 등록 | 유실 건 자동 화해 |
