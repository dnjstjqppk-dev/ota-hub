# TG-11 Queues — 계획·수용기준 (2026-11-15)

> 백로그: [TG-11](TRIP_GRADE_BACKLOG.md) — 발권·정산·알림 saga 비동기화 +
> 재시도·데드레터. 5분 크론 대체.
> 정찰: outbox 작성점(`booking-service`·`auth`·`partner`→`notification_outbox`),
> `partner_webhook_deliveries`, `runMaintenance` 펌프, 크론 `*/5` (`wrangler.jsonc:13`).

## 1. 기판 결정: D1 테이블 durable 큐

- `job_queue` 테이블(신규 마이그레이션 `0046`) + `queue-service.ts`.
- 펌프: 기존 `runMaintenance` (크론 */5 + `POST /api/v1/admin/maintenance/run`).
- 근거: 신규 바이너리 금지(TG-04 규율), 로컬 E2E 결정성(어드민 펌프 + SQL 강제到期),
  PG 이식성(TG-09 `port-schema.mjs` 경로), 기존 재시도 루프(outbox·웹훅·환불)와 동일 패턴.
- 부수 효과: 감사 지적 [M] "크론 중복 실행 무잠금"을 신규 펌프에 한해
  리스(lease) 선점으로 해소.

## 2. 범위 (v1)

1. `FULFIL_BOOK` 잡: 공급사 BOOK UNKNOWN(타임아웃) 재시도 — 지수 백오프,
   CONFIRMED→이행 계속, PENDING→DONE(오퍼레이터 소유), FAILED→보상,
   소진→보상 + DEAD.
2. `TICKET_ISSUE` 잡: 발권 UNKNOWN 재시도 — ISSUED→TICKETED, 소진→보상 + DEAD.
3. 보상(공통): 홀드·슬롯 해제 + `SUPPLIER_REJECTED` 메일 + `REFUND_PENDING` +
   전액 `startRefund`. 동기 FAILED 경로와 동일 함수로 추출해 분기 방지.
4. `GET /api/v1/admin/jobs` — 큐 깊이·실패 조회 (#74 환불목록 패턴).
5. PG 스키마 이식 (`schema.sql` 재생성) + 체크리스트 0단계에 0046 주의.

## 3. 비목표 (명시)

- 자동 정산 지급 없음 — B3/B7 사람 승인 게이트 유지. 보상은 기존 정산 void·환불 경로 재사용.
- `notification_outbox`·`partner_webhook_deliveries`·환불/`UNKNOWN` 결제·SLA 스위프의
  큐 통합은 후속 (이미 재시도+데드레터를 갖춘 동작 큐 — 회귀 위험 대비 가치 낮음).
- 동기 1차 시도 유지: 타임아웃 예약의 즉시 상태는 `MANUAL_REVIEW_REQUIRED` 그대로
  (기존 E2E 281·976행 핀). 큐는 백그라운드에서만 전진.

## 4. 수용기준 → 작업 → 증거

| # | 수용기준 | 작업 | 증거 |
|---|---|---|---|
| A1 | 타임아웃 주입→보상 흐름 E2E 녹색 (백로그 수용) | 잡·펌프·보상 구현 | tg11b: 전액환불+DEAD+감사행 |
| A2 | 타임아웃→회복 시 이행 계속 | 재시도 핸들러 | tg11a: VOUCHER_ISSUED+job DONE |
| A3 | 발권 UNKNOWN 재시도 | TICKET_ISSUE + 시뮬레이터 `ticketing:timeout` | tg11c: TICKETED |
| A4 | 중복 보상 없음 | 상태 가드 + 멱등 보상 | tg11b 환불 1건 단언 + 유닛 |
| A5 | 기존 189 E2E 무회귀 | 백오프 게이팅(5·10·20·40·60분) + 이유 가드 | 격리 E2E 전수 녹색 |
| A6 | 운영 가시성 | 어드민 잡 목록 | E2E에서 DEAD 조회 |

백오프가 스위트 속도 펌프를 게이팅하므로 기존 타임아웃 예약이 스위트 중
소진·보상되는 일은 없음 (소진까지 ≈135분, 스위트 ≈30분).

## 5. 레드드릴

1. 핸들러 강제 throw → attempts 증가·재큐 → 5회 후 DEAD + 감사 (유닛).
2. 소진 후 펌프 2회 → 환불 1건 유지 (E2E tg11b 내 단언).
3. 리스 선점 중 2차 펌프 → 스킵 (유닛).

## 6. 게이트·잔여

- 게이트: 격리 E2E 전수 + 유닛 + `tsc` + 브랜딩 + 원자 커밋·푸시.
- 잔여(TG-11 후속으로 백로그에 기록): 3종 bespoke 큐의 `job_queue` 통합,
  `ctx.waitUntil` 즉시 드레인 (현 `route()`에 ctx 미전달 — 배관 공사 필요).
- 연기된 검증: `feature_delivery` 패키지 스크립트(`verify-delivery.py` 등)가
  미설치라 스냅샷·준비 게이트는 수동 리뷰로 대체 (본 문서가 준비 리뷰).
