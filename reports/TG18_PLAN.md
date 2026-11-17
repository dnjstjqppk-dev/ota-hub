# TG-18 GDS/NDC 연동 — 계획·수용기준 (2026-11-16)

> 백로그: [TG-18](TRIP_GRADE_BACKLOG.md) — GDS 1곳 + NDC 직연동 + 매핑 DB +
> 요금 캐시. 수용: 샌드박스 PNR 발급 E2E. 의존 TG-11·TG-14.
> 정찰: `SupplierAdapter` 인터페이스(`worker/src/suppliers/adapter.ts:45`,
> book/ticket/cancel + CONFIRMED/PENDING/FAILED/UNKNOWN), `api` 어댑터는 현재
> FAILED 정직 응답. TG-14(호텔 어그리게이터)는 계약 블록이나 인터페이스가
> 동일해 코드 구현은 차단되지 않음 — 실계약은 사용자 단계.

## 1. 기판 결정: NDC 직연동 우선 + Travelport GDS + 스텁 계약

- 첫 타자는 **항공사 NDC 직연동**(대한항공·아시아나 중 택1, Offer/Order API) —
  GDS 수수료 없이 직판 마진. 둘째는 **Travelport GDS**(호텔+항공) 1곳.
- 실계약 없이 검증: 항공사·GDS 샌드박스 스텁(`NDC_API_BASE`·`GDS_API_BASE`,
  development/test 전용) + 시나리오 키. E2E는 스텁 대상으로 녹색.
- 매핑 DB: 항공사 코드·공항·운임 브랜딩 매핑 테이블(신규 마이그레이션
  `0051`) + 요금 캐시(TTL 15분, Redis ephemeral 우선·D1 폴백).

## 2. 범위 (v1)

1. `ndcAdapter`(Offer 조회·Order 생성·PNR 파싱·취소) + `gdsAdapter`(동일
   3종) — `SupplierAdapter` 구현, `adapterFor`에 `ndc`·`gds` 등록.
2. PNR 발급 E2E tg18a (스텁 샌드박스 예약·발권·취소 왕복).
3. 서킷브레이커·폴백: 연속 실패 시 OPEN(5분) → 직판·시뮬레이터 아님 —
   정직 503 + 대체편 안내 (가짜 확정 금지).
4. 요금 캐시 + 매핑 DB 시드(주요 20개 공항·10개 항공사) + 어드민 매핑 조회.
5. PG 스키마 이식 + 체크리스트 0단계에 0051 주의 + GO_LIVE에 NDC·GDS
   계약 절차 추가.

## 3. 비목표 (명시)

- 실계약·실키·라이브 PNR 없음 — 스텁 계약까지 (계약은 사용자).
- TG-14(호텔 베드뱅크) 계약 대체 아님 — 인터페이스만 공유.
- 좌석맵·부가서비스(수하물·좌석 지정) 없음 — 운임·PNR·취소 v1.
- BSP 정산 연동 없음 — 원장은 기존 정산 경로 유지.

## 4. 수용기준 → 작업 → 증거

| # | 수용기준 | 작업 | 증거 |
|---|---|---|---|
| A1 | 샌드박스 PNR 발급 (백로그 수용) | ndc+gds 어댑터 + 스텁 | E2E tg18a (예약→PNR→발권→취소) |
| A2 | 서킷브레이커 | 브레이커 + 503 폴백 | E2E tg18b (스텁 장애→OPEN→복구) |
| A3 | 요금 캐시 | 캐시 + TTL | E2E(2회 조회 1회 호출) + 유닛 |
| A4 | 시뮬레이터 격리 | 어댑터 분리 단언 | 유닛(스텁≠simulator) + E2E 무회귀 |
| A5 | 계약 테스트 | 스텁 형상 10종 | 유닛(ndc.test.ts·gds.test.ts) |

## 5. 레드드릴

1. 스텁 PNR 중복 → 멱등 리플레이 (유닛).
2. 브레이커 OPEN 중 예약 → 503 + 대체편 코드 (E2E tg18b).
3. 매핑 누락 공항 → 400 UNKNOWN_AIRPORT (유닛).

## 6. 게이트·잔여

- 게이트: 격리 E2E 전수 + 유닛 + `tsc` + 브랜딩 + 빌드 + 감사.
  (이번 세션 규율: 커밋·푸시는 전 작업 종료 후 1회.)
- 잔여(TG-18 후속으로 백로그에 기록): 실계약 전환, 좌석맵·부가서비스,
  BSP 정산, TG-14 베드뱅크 어댑터.

## 7. 준비도 검토 (2026-11-17 구현 전, 증거 연결)

- 요구 명확성: §2 범위 5항·§4 A1-A5·§5 드릴 3종은 관측 가능하고
  서로 충돌 없음. §3 비목표가 경계를 닫음 (실계약·좌석맵·BSP 제외).
- 정찰 발견 1 (마이그레이션): `suppliers.adapter` CHECK가
  `('none','direct_contract','simulator','api')` 고정
  (`worker/migrations/0002_ota_core.sql:74`)이라 ndc/gds 행은
  CHECK 확장 없이 INSERT 불가. 0051에서 0034 선례대로 테이블
  재구축(copy→drop→rename, 인덱스 `idx_suppliers_outlink` 재생성).
  현 스키마 = 0002 컬럼 + 0036 `outlink_partner_id`.
- 정찰 발견 2 (`adapterFor` 서명): 현재 `adapterFor(name)` 동기·무환경
  (`worker/src/suppliers/adapter.ts:115`), 호출 8곳 전부
  booking-service. ndc/gds는 env(키·베이스·DB 매니페스트)가 필요해
  `adapterFor(name, env?)`로 확장하고 8곳에 env 전달. env 없으면
  정직 FAILED(`SUPPLIER_NOT_CONFIGURED`) 어댑터 반환.
- 정찰 발견 3 (503 표면): fulfil FAILED는 자동환불로 수렴
  (`compensateSupplierFailure`)이라 HTTP 503은 머니 게이트
  (`createQuote`·`createBooking`의 `assertTicketable` 직후)에서만
  발생 가능. `assertSupplierAvailable` 신설이 §5 드릴 2의 유일 표면.
- 정찰 발견 4 (언와인드 보호): 재시도 잡의 FAILED도 환불로 수렴
  (booking-service `runFulfilBookJob`)해 브레이커 단락이 안전.
  단 ticket/cancel은 단락 금지 (기존 확정 언와인드 차단 불가).
  book()만 단락, 세 연산 모두 브레이커에 기록.
- 정찰 발견 5 (운임 캐시): `EphemeralStore`는 인증 상태 형상이라
  KV가 없음 (`worker/src/lib/ephemeral.ts`). TG-16 선례
  (search-service "shared Redis waits on a generic cache API")대로
  isolate LRU + D1 `fare_cache` 2층으로 구현. Redis KV는 후속 잔여.
- 정찰 발견 6 (여권): PNR 발급에 탑승객 명단(이름·생년월일·국적)은
  어댑터가 DB에서 직접 적재. 여권번호 평문은 v1에서 미전송
  (PII 최소화; DOCS 전송은 §8 8G 인증 항목으로 문서화).
- NDC 와이어 포맷: 실계약·항공사 스펙이 없어 XML 직구현 불가.
  JSON-over-HTTP 스텁 계약 + 계약 테스트로 고정하고, 항공사별
  NDC XML 인증은 8G 사용자 단계로 문서화 (허위 "연동 완료" 금지).
- 판매 게이트: ndc/gds는 `LIVE + env 구성됨`일 때만 판매
  (Toss 실키와 동일한 신뢰 모델). 스텁 루프백 베이스는 비운영 전용.
- E2E 분리: `suppliers.e2e.mjs` + `test:e2e:suppliers` + CI 3차
  패스 (TG-17 stripe 선례). main 스위트 무수정 (205 회귀).
- 환경 실측: node v24.19.0·wrangler 4.152.0 (2026-11-17 관측).
- 연기: feature_delivery 헬퍼 스크립트 미설치라 검증기 게이트는
  수동 검토로 대체 (구조 검증 없음 — 아래 §8 증거로 충당).

## 8. 구현 증거 (2026-11-17)

- 코드: `suppliers/live-adapter.ts`(주문·발권·취소·오퍼 + 게이트 가드) ·
  `circuit.ts`(임계 3·쿨다운 5분+env 재정의) · `fare-cache.ts`(isolate+ D1
  15분) · `mappings.ts`(IATA 검증) · `routes/flights.ts`(오퍼 조회) ·
  `0051`(공급사 CHECK 재구축 + 매핑 20/10 + 운임캐시) · 머니 게이트
  2곳(`assertSupplierAvailable`) · `adapterFor` 8곳 env 전달 · 어드민
  허용목록+매핑 조회 · CI 3차 패스.
- 유닛 29종 신규: circuit 5 · mappings 4 · fare-cache 6 · ndc 10 ·
  gds 4. 전체 253pass·0fail(총258·skip5).
- E2E `suppliers.e2e.mjs` 4/4 fresh(e2e_sup3) 3회차: a0(어드민 허용목록+
  매핑 20/10) · a-ndc(2회 조회 1회 호출 + PNR 왕복·발권·취소) ·
  a-gds(동일 왕복) · b(브레이커 503+대체편→3초 쿨다운→복구 2연속).
  1회차 적색 2건은 테스트 버그(extra `{}`·이름 숫자) — 수정 후 녹색.
- 레드드릴: 게이트 no-op → 201 적발 → 복원 녹색(tg18b) / 멱등키 랜덤 →
  REF-2 중복 적발 → 복원 녹색(유닛).
- 게이트: tsc·브랜딩·build-all·감사(critical 0)·Go 녹색.
  PG 82T/104idx 재생성 + gft-pg 델타 적용·검증(매핑 20/10·ndc CHECK).
- 문서: GO_LIVE 0단계 0051 + 7G/8G(샌드박스 검증·실계약 인증 절차).
- A4 확정: main 스위트 회귀 205/205 fresh(e2e_tg18) 1회차 녹색
  (E2E_EXIT=0, 67분) — 시뮬레이터 무회귀. 백로그 [x] 전환 완료.
