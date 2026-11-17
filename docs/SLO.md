# Service-Level Objectives (TG-13)

> 측정 가능한 것만 약속한다. 아래 수치는 전부 이 저장소의 코드·테이블에서
> 산출되며, 출처가 없는 목표는 두지 않는다.

## 1. 목표

| 목표 | 수치 | 측정원 | 확인처 |
|---|---|---|---|
| API 가용성 | 월 99.9% | `incidents` OUTAGE 구간 합산 | `GET /api/v1/admin/slo/summary` → `uptimePct` |
| API p95 지연 | 1500ms 이하 | isolate 히스토그램 상한 엣지 | 동일 → `isolate.p95Ms` |
| 크론 신선도 | maintenance 15분 이내 실행 | `cron_heartbeats` | 동일 → `cron.stale == false` |

## 2. 정직한 한계 (읽지 않으면 오해한다)

- **가용성은 장애 기록 기반**이다. 무중단 관측(합성 모니터링)이 없어서,
  기록되지 않은 장애는 수치에 잡히지 않는다. 합성 모니터링은 후속 과제.
- **p95는 단일 isolate 표본**이다. Workers isolate는 메모리를 공유하지 않아
  `/api/v1/admin/metrics`가 보는 것은 스크랩된 1대의 수치다. 플릿 전체 p95는
  OTLP 수집기(Grafana/Tempo, 매니지드 선정 후 사용자 단계) 몫이다.
- **퍼널 수치는 하한치**다. 엣지 캐시 HIT(TG-15)은 오리진에 닿지 않아
  search·view 이벤트를 발화하지 않는다. 전환율 분모는 MISS 트래픽 기준.
- **30일 윈도우**는 incidents 테이블의 `started_at`/`resolved_at`으로 계산한다.
  해소되지 않은 OUTAGE는 현재 시각까지 누적된다.

## 3. 장애 등급

- `OUTAGE`: 결제·예약·로그인 등 핵심 흐름 중단. `/status` → `outage`.
- `DEGRADED`: 일부 기능 저하·지연. `/status` → `degraded`.
- `INFO`: 안내성 (점검 예고 등). `/status`에는 노출되나 상태는 `degraded`.

## 4. 운영 절차

1. 장애 인지 → `POST /api/v1/admin/incidents` (제목·등급·상황) → `/status` 즉시 반영.
2. 경과 공유 → `PATCH /api/v1/admin/incidents/:id` (`latestUpdate`).
3. 해소 → 동일 PATCH (`status: RESOLVED`) → 업타임 윈도우 확정.
4. 해소된 장애는 다시 열 수 없다. 재발은 새 장애로 등록 (원인 추적 보존).

## 5. 상태 페이지

- 공개 `GET /status` (30초 캐시): 상태·컴포넌트·진행중 장애만. 카운트·
  사업자·공급사 정보는 일절 없음 (민감 인텔은 verbose `/health` 어드민 게이트 뒤).
- 사용자 포털 `/status` 화면이 동일 JSON을 렌더한다.
- 어드민 콘솔 `/slo`가 목표 대비 현황을 보여준다.

## 6. 트레이싱

- 모든 API 요청은 W3C `traceparent`를 존중·발급한다 (응답 헤더 회신).
- `OTEL_EXPORTER_OTLP_ENDPOINT` 설정 시 OTLP/HTTP로 익스포트, 미설정 시
  isolate 링버퍼(200 트레이스)에만 보관 → 어드민 `GET /api/v1/admin/traces/:id`.
- 주문 1건 추적 데모: `BASE=... ADMIN_PASSWORD=... node scripts/trace-order.mjs`.

## 7. 재해 복구 목표 (TG-20)

| 목표 | 수치 | 측정원 | 확인처 |
|---|---|---|---|
| RTO (복구 시간) | 4시간 이하 | 분기 게임데이 리허설 | `reports/DR_REHEARSAL_*.md` |
| RPO (유실 상한) | 8일 이하 | 주간 백업 주기 + 버퍼 | 주간 잡 + 복원 테스트 로그 |

- RPO는 백업 주기가 정한다. 주간 백업이라 8일이며, 일간으로 올리면
  25시간으로 조인다 (일정 변경은 운영 결정 — 코드 수정 없음).
- RTO는 런북 수동 수행 기준이다. 로컬 리허설은 수 분에 끝나지만,
  운영값은 스테이징 전체 드릴에서 측정한다 (최초 측정 후 이 행 갱신).
- 절차: `docs/DR_RUNBOOK.md`. 주간 백업은 덤프 즉시 스크래치 복원
  검증을 통과해야 녹색이다.
