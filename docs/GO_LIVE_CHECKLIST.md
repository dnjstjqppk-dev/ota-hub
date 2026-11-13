# Go-Live Checklist — PG 계약 후 바로 장사하기

> 전제: `main` 최신이 CI로 배포되어 있고, 운영 verify 47/47이다:
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
(Invoke-RestMethod https://ota-hub.dnjstjqppk.workers.dev/api/v1/health).checks.sellerEntityActive
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

확인: `/health` → `piiEncryptionKey: True`.

## 4. 도메인 연결 (메일·PG보다 먼저)

메일 링크(재설정·예약확정)는 `PUBLIC_SITE_URL`으로 나가고, Resend 발신
도메인 인증도 DNS를 요구한다. 미연결 상태에서 메일·PG를 먼저 열면 링크가
죽은 도메인을 가리킨다(#63). DNS부터 연결한다.

```powershell
# Cloudflare 대시보드 → 각 워커 → Settings → Domains & Routes → Add Custom Domain:
#   ota-hub     → getfortrip.com (+ www)
#   ota-admin   → admin.getfortrip.com
#   ota-partner → partner.getfortrip.com
```

그 뒤 `wrangler.jsonc` vars가 실도메인을 가리키는지 확인하고 재배포
(`PUBLIC_SITE_URL=https://getfortrip.com`,
`PARTNER_SITE_URL=https://partner.getfortrip.com` — 현재 선언済,
`ALLOWED_ORIGINS`에 실도메인 포함 확인).

확인: 3개 실도메인 루트 200 + `/api/v1/health` 200.

## 5. 메일 발송 (Resend)

없으면 예약확정·비밀번호 메일이 outbox에 적재만 된다. 키 등록 후 크론(5분)이
밀린 메일을 자동 발송한다. 4단계에서 연결한 도메인으로 Resend 발신 인증을
먼저 마쳐야 수신이 스팸 처리되지 않는다.

```powershell
npx wrangler secret put RESEND_API_KEY
```

`EMAIL_FROM`은 `wrangler.jsonc` vars에 확정 발신자로 교체 후 재배포.
확인: `/health` → `emailProvider: RESEND`.

## 6. 오류 알림 (Sentry)

```powershell
# GitHub repo Secret: SENTRY_DSN (프론트 3종 빌드에 주입)
npx wrangler secret put SENTRY_DSN   # 워커 런타임용
```

확인: `/health` → `errorReporting: SENTRY`.

## 7. PG 연결 — 토스 테스트키로 먼저 검증 (계약 직후)

상점관리자에서 테스트키(`test_sk_`, `test_ck_`)를 발급받아 등록한다.
테스트 결제는 DB에 `mode=SANDBOX`로 찍혀 실매출과 구분된다.

```powershell
# PAYMENT_PROVIDER=toss 는 wrangler.jsonc vars에 선언済 (키 없이는 DISABLED 유지)
npx wrangler secret put TOSS_SECRET_KEY   # test_sk_... 입력
```

`TOSS_CLIENT_KEY`(`test_ck_...`)는 공개키라 `wrangler.jsonc` vars에 넣고 재배포.
확인 순서:

1. `/health` → `paymentProvider: toss:SANDBOX`, `/api/v1/payments/config` → `enabled: true`.
2. 실카드가 아닌 토스 테스트결제로 1건 결제 → 운영자 확정(어드민 주문 상세) →
   바우처 발급 → 취소·환불까지 수행.
3. 어드민 정산/원장에서 해당 건이 SANDBOX로 구분되는지 확인.

## 8. PG 실키로 전환 (장사 시작)

상점관리자에서 라이브키(`live_sk_`, `live_ck_`) 발급 후 같은 자리에 교체.

확인: `/health` → `paymentProvider: toss:LIVE`. 첫 실결제 1건은 소액 테스트
상품으로 결제→확정→취소·환불 풀루프를 돌리고, 토스 상점관리자 입금/취소 내역과
대사한 뒤 정상 상품 판매를 연다.

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
