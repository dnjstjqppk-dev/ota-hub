# TG-17 글로벌 PG + FDS — 계획·수용기준 (2026-11-16)

> 백로그: [TG-17](TRIP_GRADE_BACKLOG.md) — Adyen/Stripe + 3DS + 사기 탐지 +
> 차지백 프로세스. 수용: 테스트 카드 결제·환불·차지백 E2E. 의존 TG-11.
> 정찰: `PaymentProvider` 인터페이스(`worker/src/payments/provider.ts:34`,
> confirm/refund/lookup + CAPTURED/FAILED/UNKNOWN), Toss는 스텁 계약 테스트
> 패턴(실키는 외부), 샌드박스 시나리오 키(`sbx_<scenario>_<rnd>`).

## 1. 기판 결정: Stripe 어댑터 + 규칙 FDS + 3DS 분기

- 첫 글로벌 PG는 **Stripe**(테스트키, PaymentIntent + 3DS `requires_action`).
  Adyen은 인터페이스 뒤 2순위 (동일 모양이라 추가 어댑터 1파일).
- 실키 없이 검증: Toss와 동일한 스텁 계약 패턴 — `STRIPE_API_BASE` 스텁 +
  시나리오 키(`stt_<scenario>_<rnd>`). E2E는 스텁 대상으로 녹색.
- FDS는 규칙 엔진 v1(velocity·금액·디바이스·지리) + 리뷰 큐 — ML 아님(§3).
  차단이 아니라 `MANUAL_REVIEW_REQUIRED` 편입 (오탐은 사람이 풀기).

## 2. 범위 (v1)

1. `stripeProvider` (confirm/3DS-action/refund/lookup/dispute-lookup) +
   `PAYMENT_PROVIDER=stripe` 배선 + `/payments/config` 공개키 노출.
2. 3DS: `requires_action` → 클라이언트 리다이렉트 URL 반환 → return 콜백
   (`/api/v1/payments/stripe/return`) → 확정. E2E tg17a (스텁 3DS 왕복).
3. FDS 규칙: 시간당 시도·일일 금액·카드 BIN 국가 불일치·쿠폰 남용 점수화 →
   임계 초과 시 리뷰 큐(`fraud_reviews`, 신규 마이그레이션 `0050`) +
   어드민 승인/거부 API. E2E tg17b.
4. 차지백: Stripe dispute webhook → 예약·원장·정산 동기화 (토스 차지백
   동기화와 동일 함수 재사용) + 어드민 차지백 목록. E2E tg17c.
5. 통화: USD·JPY·EUR 결제 통화(환율 TG 기존) + 원장 통화 기록.
6. PG 스키마 이식 + 체크리스트 0단계에 0050 주의 + GO_LIVE 7·8단계에
   Stripe 키 절차 추가.

## 3. 비목표 (명시)

- 실가맹 계약·실키·라이브 전환 없음 — 스텁 계약까지 (키는 사용자).
- Adyen 실연동 없음 — 인터페이스 자리만 (후속 1파일).
- ML 사기 탐지 없음 — 규칙 v1 + 리뷰 큐 (TG-21에서 고도화).
- Apple Pay·Google Pay·편의점 결제 없음 — 카드 + 3DS v1.

## 4. 수용기준 → 작업 → 증거

| # | 수용기준 | 작업 | 증거 |
|---|---|---|---|
| A1 | 테스트 카드 결제·환불 (백로그 수용) | stripe 어댑터 + 스텁 | E2E tg17a (스텁 왕복·환불) |
| A2 | 차지백 E2E (백로그 수용) | dispute webhook + 동기화 | E2E tg17c (차지백→예약·원장 반영) |
| A3 | 3DS 왕복 | return 콜백 | E2E tg17a (requires_action→확정) |
| A4 | FDS 리뷰 편입 | 규칙 + 큐 + 어드민 | E2E tg17b (남용→리뷰→승인/거부) |
| A5 | Toss 무회귀 | provider 분기 불변 | 격리 E2E 전수 녹색 |
| A6 | 계약 테스트 | 스텁 형상 8종 | 유닛(stripe.test.ts) |

## 5. 레드드릴

1. 스텁 500 → UNKNOWN → 화해 큐 (유닛 + E2E).
2. 동일 키 재확정 → 리플레이 (멱등, #70 패턴).
3. FDS 임계 초과 주문 → 자동 차단이 아닌 리뷰 편입 단언 (E2E tg17b).

## 6. 게이트·잔여

- 게이트: 격리 E2E 전수 + 유닛 + `tsc` + 브랜딩 + 빌드 + 감사.
  (이번 세션 규율: 커밋·푸시는 전 작업 종료 후 1회.)
- 잔여(TG-17 후속으로 백로그에 기록): Adyen 어댑터, 실키 전환 런북 실행,
  ML FDS(TG-21), 지갑 결제.
