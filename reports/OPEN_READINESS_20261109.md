# OTA 오픈 가능 수준 판정 — 2026-11-09

> 대상: `main` 최신(전수감사 6건 조치 포함) + 운영 D1 정리·0021 적용 후.
> 모든 수치는 본 세션에서 직접 실행·관측.
> 선행 보고서: [Phase 5 상용화 판정](PHASE5_COMMERCIALIZATION.md) (조건부 GO)

## 1. 판정: 조건부 GO 유지 (코드 완성, 외부 연동이 블로커)

3포털 코드·테스트·배포는 전부 녹색이다. 그러나 실제 돈이 오가는 정식 오픈은
아래 블로커(외부 자격·계약)가 막고 있다. 파일럿(폐쇄·지인) 수준은 가능.

## 2. 게이트 증거 (본 세션 관측)

| 게이트 | 결과 | 근거 |
|---|---|---|
| 유닛 | 63/63 | `npm test` |
| 로컬 E2E | 73/73 ×2회 | `npm run test:e2e` 연속 2회 (감사 2차 +10종, fday 재실행 입증) |
| 타입체크 | exit 0 | `npm run typecheck` |
| 레드드릴 | RED→GREEN ×3 | 1P 게이트, 세션파기 초단위(`reset_at+1`), 항공재고 오염(fday) |
| Go 백엔드 | PASS | `go test ./backend/...` (루트 `./...`는 워크스페이스 경로 오류) |
| 브랜딩 가드 | PASS | "getfortrip" 엄격 스캔 |
| 3포털 빌드 | exit 0 | `node scripts/build-all.js` (admin/partner Vite + Nuxt) |
| 운영 검증 | 41/41 | `scripts/verify-production.js` (배포 후, T41 dry-run 기본) |
| CI | success | run 42586073260 (a690f7d, gate E2E 63/63) |
| 3포털 루트 | 200 | hub/admin/partner |

## 3. WO-OTA 10종 매핑 (전부 통과 테스트에 귀속)

| ID | 기능 | 검증 |
|---|---|---|
| 01 | 위시리스트 서버 동기화 | E2E wishlist |
| 02 | 최저가 알림 | E2E user data |
| 03 | 비밀번호 재설정 | E2E auth reset (single-use) |
| 04 | 여권/쿠폰 지갑 | E2E flight passport + coins/coupons |
| 05 | 취소·위약금 정산 | E2E cancellation 3종 |
| 06 | 실투숙 인증 리뷰 | E2E reviews |
| 07 | 제휴 아웃링크 | 운영 T-제휴 + E2E postback |
| 08 | 사이트맵 + JSON-LD | E2E sitemap + 운영 T20 |
| 09 | 재고 홀딩 + 하한가 | E2E inventory + quote |
| 10 | 레이트리밋 + CORS | E2E 전역 + 운영 T22 |

## 4. 본 세션 변경 (후속 3: 감사 잔여 전부 해소 — 미커밋, 사용자 승인 대기)

상세: [전수 감사 리포트](FULL_AUDIT_20261109.md) `조치 현황 (2차)`.
돈·장부 8건 + 보안 13건 + 죽은기능 6종 부활(2종 정책대기) + 프론트 3건 +
E2E 63→73 + Go/문서/스키마 + 마이그레이션 0022~0026(로컬 적용済).
게이트: 유닛 63/63 · E2E 73/73 연속 2회 · tsc 0 · 빌드 0 · Go · 브랜딩.
신규 수정 2건(세션파기 `reset_at+1`, 항공날짜 `fday`)은 RED→GREEN 입증.
미실시: 운영 D1 0022~0026 적용, 운영 verify, T41 실정산.

## 4a. 이전 변경 (후속 2: 전수감사 6건 조치 — `a690f7d` 커밋·배포済)

상세: [전수 감사 리포트](FULL_AUDIT_20261109.md) (blocker 1 + major 53 + minor 38 중
상위 6건 조치). 게이트: 유닛 63/63 · E2E 63/63(신규 3종) · tsc 0 · Go · 브랜딩 · 3포털 빌드.

- [B] `scripts/migrate-d1.js` 실행 거부 스텁화 + `0021` 방어 마이그레이션
  (로컬·운영 적용, 운영 no-op 확인) + 스냅샷 해시 스크럽.
- 파트너 프로필 `password_hash` 누출 제거 + 회귀 테스트 (레드→그린 입증).
- 토스 웹훅 응답 제네릭화(주문 오라클 제거) + verify/Go 하드코딩 비번 제거.
  운영 검증은 이제 `TEST_ADMIN_PASSWORD` 필수, T41 실정산은 `VERIFY_LIVE_SETTLE=1` opt-in.
- CI를 gate→deploy 분리: 유닛·E2E·타입체크·마이그레이션 검증 통과 후 배포.
- LIVE+api 판매 차단 + 항공×직계약 409 (견적·예약·목록·상세).
- 구 GO 판정문 보관 처리 + `PAYMENT_PROVIDER=toss` 선언 (키 없이 DISABLED 유지).

## 4b. 이전 변경 (`f0a2d31` 커밋済: 토스 계약·직판·계약 API)

- **토스 계약 테스트** (`worker/test/unit/toss.test.ts` 신규 7종): 로컬 스텁
  상대로 confirm/환불/조회 요청 형태·응답 매핑 검증. `TOSS_API_BASE`는
  development/test에서만 스텁을 향하고 프로덕션은 항상 실 API로 고정.
  개통 당일에는 실키만 넣으면 됨 (코드 변경 불필요).
- **직영(1P) 공급사** (`worker/migrations/0020_direct_sales_supplier.sql`):
  `ptn_direct_01` + 자사계약 `ect_direct_01`(PENDING) 시드.
  NOT_INTEGRATED로 심어지므로 시드만으로 판매 불가.
- **계약 API** (`POST/PATCH /api/v1/admin/contracts`): PG·SUPPLIER·
  정산계좌·보험·기타 등록 + 상태 전이. 공급사 LIVE 전환은 ACTIVE
  SUPPLIER 계약을 요구 (E2E 1P 테스트 + 레드드릴로 입증).
- **개통 체크리스트** (`docs/GO_LIVE_CHECKLIST.md`): PG 계약 후 장사까지
  0→8단계. 마이그레이션 0020 수동 적용·사업자 ACTIVE·직판 LIVE·PII·
  메일·Sentry·토스 테스트키→라이브키·웹훅 순서.
- 로컬 D1 보정: 0020이 구버전으로 적용돼 있어 `ect_direct_01` 행을
  파일 내용대로 수동 삽입 (미커밋 마이그레이션이라 파일 자체는 단일 버전 유지).

## 4b. 이전 변경 (`c7817f0` 커밋済)

- `c7817f0` Sentry 무의존 리포터: 워커(`worker/src/lib/sentry.ts`) +
  어드민/파트너(`src/sentry.ts`) + 유저(`plugins/sentry.client.ts`).
  DSN 미설정 시 조용히 비활성. PII(메일·시크릿 쿼리) 스크럽.
  `GET /api/v1/health`에 `errorReporting: SENTRY/NOT_CONFIGURED` 추가.
- CI: `SENTRY_DSN` 시크릿 → `VITE_SENTRY_DSN`·`NUXT_PUBLIC_SENTRY_DSN` 주입.
  워커는 `wrangler secret put SENTRY_DSN` 필요 (아래 잔여).
- 운영 D1 QA 잔재 190행 삭제 (사용자 84+예약 18 / 파트너 22+프로필 22+
  스태프 22 / 마켓 3+1+4 / 액티비티 3+12). 최종: users 2, partners 4,
  bookings 2, activities 6(시드), mkt 9. 감사로그·카탈로그·시드 유지.

## 5. 블로커 (정식 오픈 전 필수 — 코드 밖)

운영 `/health` 실측 기준 (본 세션 변경과 무관한 기존 상태):

1. **결제 비활성** — `paymentProvider: DISABLED`. Toss 실가맹점 등록 후
   `TOSS_SECRET_KEY` + `PAYMENT_PROVIDER=toss` 필요.
2. **여권 암호화키 없음** — `piiEncryptionKey: false`. 여권 포함 예약(항공)이
   503으로 막힌다. `PII_ENC_KEY`(32바이트 base64) 등록 필요.
3. **판매주체 미가동** — `sellerEntityActive: false`. `business_entities`에
   ACTIVE 행 없음. 실정산 전 실사업자 등록·활성 필요.
4. **메일 미설정** — `emailProvider: NOT_CONFIGURED`. Resend 키 필요.
5. **오류알림 미가동** — `errorReporting: NOT_CONFIGURED`. Sentry DSN 필요
   (GitHub Secret + `wrangler secret put SENTRY_DSN`). 코드는 금일 배포済.
6. **실공급사 계약 없음** — 카탈로그는 목시드. 미계약 상품 409 차단 중.
7. **약관 법무 검토 미완** — Legal v2.0 문구 counsel review 필요.
8. **도메인 미연결** — workers.dev 3URL 운영 중, getfortrip.com 예정.
9. **운영 파트너 실정보 미등록** — `ptn_mw62m1m2_yaoxd` 회사명·사업자번호
   플레이스홀더. 실정보 수령 시 SQL 업데이트.

## 6. 포털별 상태

- **사용자**: 빌드·200·결제/예약/취소/리뷰/코인 E2E + 운영 41종 녹색.
  항공 여권예약만 PII 키 없어 503 (블로커 2).
- **관리자**: 200, 카탈로그 CRUD/bulk·제휴·법무 E2E + 운영 녹색.
- **파트너**: 200, 주문/정산/웹훅/API키 E2E + 운영 녹색.

## 7. 다음 액션

0. 미커밋 델타 커밋·배포 (사용자 승인 후) → 운영에 0020 수동 적용
   (`docs/GO_LIVE_CHECKLIST.md` 0단계). 상세 순서는 해당 문서 0→8단계.
1. Toss 실가맹 + `PII_ENC_KEY` + 실사업자 ACTIVE → 결제/여권/정산 파일럿.
2. Sentry DSN 2곳 등록 → `/health` errorReporting: SENTRY 확인.
3. Resend + 도메인 + 법무 확정 → 정식 오픈 게이트 재측정.
