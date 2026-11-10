# Go-Live Checklist — PG 계약 후 바로 장사하기

> 전제: `main` 최신이 CI로 배포되어 있고, `node scripts/verify-production.js` 41/41이다.
> (기본 dry-run: T41 실정산은 `VERIFY_LIVE_SETTLE=1`을 붙여야 수행. 어드민 비번은
> `TEST_ADMIN_PASSWORD` 환경변수로 전달. CI는 유닛·E2E·타입체크·마이그레이션 검증을 통과해야 배포한다.)
> 아래 순서는 의존성 순서다. 각 단계의 확인 명령을 통과해야 다음으로 간다.

## 0. 직영 공급사 준비 (코드 배포 후 1회)

마이그레이션 `0020_direct_sales_supplier.sql`은 배포 시 자동 적용되지 않는다.
수동 적용 후 행 존재를 확인한다.

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

## 4. 메일 발송 (Resend)

없으면 예약확정·비밀번호 메일이 outbox에 적재만 된다. 키 등록 후 크론(5분)이
밀린 메일을 자동 발송한다.

```powershell
npx wrangler secret put RESEND_API_KEY
```

`EMAIL_FROM`은 `wrangler.jsonc` vars에 확정 발신자로 교체 후 재배포.
확인: `/health` → `emailProvider: RESEND`.

## 5. 오류 알림 (Sentry)

```powershell
# GitHub repo Secret: SENTRY_DSN (프론트 3종 빌드에 주입)
npx wrangler secret put SENTRY_DSN   # 워커 런타임용
```

확인: `/health` → `errorReporting: SENTRY`.

## 6. PG 연결 — 토스 테스트키로 먼저 검증 (계약 직후)

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

## 7. PG 실키로 전환 (장사 시작)

상점관리자에서 라이브키(`live_sk_`, `live_ck_`) 발급 후 같은 자리에 교체.

확인: `/health` → `paymentProvider: toss:LIVE`. 첫 실결제 1건은 소액 테스트
상품으로 결제→확정→취소·환불 풀루프를 돌리고, 토스 상점관리자 입금/취소 내역과
대사한 뒤 정상 상품 판매를 연다.

## 8. 토스 웹훅 등록 (선택이나 권장)

상점관리자 웹훅 URL에 등록:

```text
https://ota-hub.dnjstjqppk.workers.dev/api/v1/webhooks/toss
```

웹훅은 힌트일 뿐 돈은 항상 PG 조회로 확정하므로(Dual-write 방지),
등록 전에도 결제는 정상 동작한다. 등록 후에는 PG 응답 유실 건이 자동 화해된다.

## 9. 개통 후 상시 확인

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
