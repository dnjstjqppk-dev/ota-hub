# TG-13 OTel 관측 — 계획·수용기준 (2026-11-16)

> 백로그: [TG-13](TRIP_GRADE_BACKLOG.md) — 트레이스·메트릭·로그 파이프라인 +
> SLO + 상태 페이지. 수용: 주문 1건 추적 데모 + SLO 대시보드. 의존 TG-05(완료).
> 정찰: 단일 `fetch` 진입(`worker/index.ts:215`), zero-dep Sentry 리포터
> (`worker/src/lib/sentry.ts`, `ctx.waitUntil` 패턴), verbose 게이트 `/health`,
> CR-04 `/admin/insights` BI 화면.

## 1. 기판 결정: zero-dep OTel 호환 파이프라인

- OTel SDK 없이 W3C `traceparent`/`tracestate` 전파 + OTLP/HTTP JSON 익스포트
  (`worker/src/lib/tracing.ts`). TG-05 Sentry와 동일 철학(무의존성·no-op 기본).
- 근거: Workers 번들 무게, 사용자 머신 바이너리 추가 금지(TG-04 규율),
  격리 E2E 결정성(단일 isolate 링버퍼 단언).
- 메트릭은 isolate 메모리 카운터 + Prometheus exposition
  (`GET /api/v1/admin/metrics`, 어드민 게이트). per-isolate best-effort임을
  문서에 명시 — 엣지 분산 집계는 OTLP 수신기(Grafana/Tempo) 몫.
- 로그는 trace_id 주입 구조화 JSON (`worker/src/lib/log.ts`).

## 2. 범위 (v1)

1. 트레이스: 요청당 trace id 발급(상류 `traceparent` 존중), 루트 스팬 +
   핵심 스팬(예약 생성·결제 확정·공급사 BOOK), `ctx.waitUntil` OTLP 익스포트
   (`OTEL_EXPORTER_OTLP_ENDPOINT` 미설정 시 no-op + 로컬 링버퍼 보관).
2. 주문 1건 추적 데모: `scripts/trace-order.mjs` — 주문 생성 후 어드민
   `GET /api/v1/admin/traces/:traceId`에서 워터폴 출력 (E2E `tg13a`로 동일 핀).
3. 메트릭: `http_requests_total{route,status}`·`http_request_duration_ms` 히스토그램 ·
   `booking_created_total`·`payment_confirmed_total`. 카디널리티 가드(라우트 템플릿화).
4. 상태 페이지: 공개 `GET /status`(liveness + 컴포넌트 + 진행중 장애, 인텔 없음) +
   사용자 포털 `/status` 화면 + `incidents` D1 테이블(신규 마이그레이션 `0048`) +
   어드민 장애 CRUD (`/api/v1/admin/incidents`, E2E `tg13b`).
5. SLO: `docs/SLO.md` (가용성 99.9% `/api`, p95 지연, 정산일지정시) + 어드민
   `/slo` 대시보드(heartbeats·incidents·메트릭 링버퍼 집계, 30일 업타임).
6. PG 스키마 이식 (`schema.sql` 재생성) + 체크리스트 0단계에 0048 주의.

## 3. 비목표 (명시)

- 실제 Grafana/Tempo/Collector 구축 없음 — OTLP 엔드포인트 환경변수 배선까지
  (수신기는 매니지드 선정 후 사용자 단계, TG-05 DSN과 동일).
- 분산 집계·알림(온콜·페이저) 없음 — SLO 위반 표시는 대시보드 수준.
- 포털 RUM(브라우저 트레이싱) 없음 — 서버 파이프라인 v1에 집중.
- 기존 Sentry 교체 없음 — 에러 리포팅은 Sentry 유지, OTel은 트레이스·메트릭 담당.

## 4. 수용기준 → 작업 → 증거

| # | 수용기준 | 작업 | 증거 |
|---|---|---|---|
| A1 | 주문 1건 추적 데모 (백로그 수용) | trace-order 스크립트 + traces API | 데모 출력(루트→예약→결제 스팬) + E2E tg13a |
| A2 | SLO 대시보드 (백로그 수용) | SLO.md + /admin/slo + 집계 API | 빌드 + E2E(업타임·p95 조회) |
| A3 | traceparent 전파 | fetch 진입 배관 + 하류 전달(PG·공급사 호출 헤더) | E2E(상류 id 유지 단언) + 유닛 |
| A4 | OTLP no-op 안전 | 엔드포인트 미설정 시 무전송·무예외 | 유닛(널 배선) + 격리 E2E 무회귀 |
| A5 | 상태 페이지 공개 | /status + 포털 화면 + 장애 CRUD | E2E tg13b + 반응형 실측 |
| A6 | 기존 스위트 무회귀 | 진입점 오버헤드만 추가 | 격리 E2E 전수 녹색 |

## 5. 레드드릴

1. OTLP 엔드포인트를 죽은 URL로 → 요청은 200, 익스포트는 조용히 실패 (유닛).
2. `traceparent` 변조 입력 → 신규 trace id 발급·전파 (유닛).
3. 장애 등록 → `/status` degraded + SLO 업타임 하락 (E2E tg13b 내 단언).

## 6. 게이트·잔여

- 게이트: 격리 E2E 전수 + 유닛 + `tsc` + 브랜딩 + 빌드 + 감사.
  (이번 세션 규율: 커밋·푸시는 전 작업 종료 후 1회.)
- 잔여(TG-13 후속으로 백로그에 기록): RUM, OTLP 수신기 매니지드 연결,
  알림 규칙(온콜), `ctx.waitUntil` 즉시 드레인(TG-11 잔여와 병합 검토).
