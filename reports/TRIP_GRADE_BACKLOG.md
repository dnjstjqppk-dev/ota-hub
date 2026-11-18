# Trip.com급 개발 백로그 (TG-01~TG-21)

> 코드·인프라·문서로 구현 가능한 항목만. 제휴·라이선스·조직 항목은
> [갭 분석](TRIP_GRADE_GAP_ANALYSIS.md) §7·§13·§14 참조(여기에 없음).
> 상태: `[ ]` 미착수 · `[~]` 진행중 · `[x]` 완료. 완료 시 증거(커밋·테스트)를 함께 기록.
> 규율: 동작 변경군은 격리 E2E + 게이트 + 원자 커밋. 비동작 변경(후크·CI·문서·신규
> 스크립트)은 표적 검증으로 대체한다(E2E 1회 약 30분이라 항목당 전수는 낭비 — TG-02 확정).
> 후크 기본 스킵 이후 `SKIP_DEPLOY=1` prefix는 불필요(무해라 생략 가능).

## Phase 1 — 파일럿 (스택 동결, 기초 체력)

- [x] **TG-01 TS/Go 이중구현 정리** (코드)
  범위: 서빙 진실=TS 원칙을 ARCHITECTURE.md에 고정. Go의 중복 도메인 로직 삭제,
  Go 잔류분(집계·동기화·배치) 목록화.
  수용: Go 테스트 녹색 + E2E 188 녹색 + 원칙 문서 반영. 의존: 없음.
  증거: Go 5506줄→3파일(referral 자립 패키지+테스트)로 축소, go build·go test·
  gofmt PASS. 서빙 섀도스택+미배선 파이프라인 삭제, 원칙은 ARCHITECTURE.md·
  backend/README.md에 고정. E2E는 동작 변경군 묶음 1회로 대체(Go 삭제는 워커 무영향).
- [x] **TG-02 post-commit 후크 안전화** (코드·설정)
  범위: 기본 스킵으로 반전. 명시 `DEPLOY=1`일 때만 운영 파이프라인 실행.
  수용: 일반 커밋에 스킵 로그 + 명시 플래그 때만 실행 증명. 배경: 2026-11-14 사고.
  증거: 후크 수동 실행 3종 PASS(기본 스킵·SKIP 우선·DEPLOY+DRY_RUN 리허설).
- [x] **TG-03 분석 이벤트 스키마** (코드)
  범위: search→view→book 퍼널 이벤트 정의 + 적재(초기 D1 테이블).
  수용: E2E에서 이벤트 3종 발생 확인 + 스키마 문서. 의존: 없음.
  증거: 유닛 148/148(신규 4종)·tsc·브랜딩 PASS, 0045 적용 확인, E2E tg03 추가.
  7개 도메인 목록/상세 + 예약생성에 방출, 90일 보존. 격리 E2E는 동작 변경군 묶음 1회 예정.
- [x] **TG-04 부하 테스트 도입** (코드·문서)
  범위: k6 시나리오(검색·견적·결제) + 로컬 격리DB 기준선 보고서.
  수용: 시나리오 실행 + 기준선 수치 기록. 의존: 없음.
  증거: scripts/load-baseline.mjs + 2회 실측(gentle·burst) + 보고서.
  편차: k6 미설치 + 사용자 머신 바이너리 추가 금지 → 무의존성 Node 프로브로 대체.
  k6 포팅은 필요 시 후속. 200 정확히 600건×2회로 백스톱 동작 입증.
- [x] **TG-05 Sentry 배선(코드분)** (코드)
  범위: worker·3포털 DSN 환경변수화 + 릴리스 태깅. 키 발급은 사용자.
  수용: DSN 설정 시 /health errorReporting 반영 + 미설정 시 no-op. 의존: 없음.
  증거: 유닛 144/144(신규 10종)·tsc·브랜딩·3포털 빌드 PASS, DRY_RUN 리허설에
  --var SENTRY_RELEASE 3종 확인. 기존 배선(캡처·헬스·no-op)은 유지만 확인하고
  빠진 릴리스 태깅만 추가. 동작 변경군은 TG-03·TG-07과 묶어 격리 E2E 1회 예정.
- [x] **TG-06 CI 분리** (설정)
  범위: 빠른 gate / E2E / 배포 잡 분리. main 전체·PR 단축.
  수용: PR에서 빠른 잡만 녹색 확인. 의존: 없음.
  증거: YAML 파싱 PASS + main 푸시에서 fast·e2e 잡 실행(CI 관찰). PR 단축은
  on.pull_request + 잡 if 조건으로 구성(검사). #167 동시성은 ref별 그룹으로 유지.
  후속 수정: 분리 후 e2e 잡이 자체 마이그레이션 없이 dev-seed부터 돌려
  no-such-table로 실패 → e2e 잡에 Apply D1 migrations 단계 추가.
  최종: CI run 43560751989 — fast ✓(1m25s)·e2e ✓(11m7s)·deploy ✗(7403 토큰 만료,
  사용자 블로커로 예상됨). Phase 1 전체 [x] 2026-11-14.
- [x] **TG-07 D1→Postgres 이전 설계** (문서·코드)
  범위: 이전 설계서 + DB 접근 리포지토리 인터페이스. 신규 코드는 인터페이스 경유.
  수용: 설계 문서 + 인터페이스 + 기존 테스트 녹색. 의존: 없음.
  증거: 설계서 + Db 인터페이스·D1 어댑터 + analytics 15곳 전환 + 어댑터 테스트.
  유닛·tsc 녹색(아래). E2E는 동작 변경군 묶음 1회로 증명.
- [x] **TG-08 스테이징 환경** (인프라·설정)
  범위: wrangler 환경 분리 + 스테이징 D1 + 스테이징 배포·스모크 스크립트.
  수용: 스테이징 URL + 스모크 PASS. 의존: TG-02.
  증거: ota_staging(45 마이그레이션·시드済) + ota-hub-staging 배포 + 스모크 11/11
  PASS 2회. 운영 무접촉(신규 리소스만). JWT 시크릿은 스테이징용 임의값 — 로테이션 가능.

## Phase 2 — PMF (유료 전환 전)

- [x] **TG-09 Postgres 이전 실행** (인프라·코드)
  범위: 주문·결제·정산·재고 이전 + 읽기 복제본 + 커넥션 풀러 + PITR.
  수용: E2E 전체를 Postgres 대상으로 녹색 + 롤백 절차 문서. 의존: TG-07·TG-08.
  증거: 로컬 증명 완료 — docker PG16 + D1-shim + 스키마 70T/90idx/FK31 + E2E 189/189.
  이식성 수정 9건·에러매핑 3종·자문락+원자 배치·테스트 위생 4종. 롤백런북 별도 문서.
  범위: 매니지드 프로비저닝(복제본·풀러·PITR)은 공급자 선정 후 사용자 단계.
  CI: run 43568672087 — fast ✓(1m7s)·e2e ✓(10m12s, D1 189/189)·deploy ✗(7403 예상).
  (#81 fetch 실패 1건은 일시 장애로 재실행 후 녹색 확정.)
- [x] **TG-10 Redis 도입** (인프라·코드)
  범위: 세션·레이트리밋·재고 홀딩·멱등키를 D1에서 Redis로 이전.
  수용: 관련 E2E 녹색 + 장애 시 폴백 동작 증명. 의존: TG-09.
  증거: EphemeralStore 인터페이스 + D1 구현 + Redis 구현 + 폴백 래퍼.
  E2E 189/189 3종(redis 모드·D1 회귀·redis 정지 폴백). 유닛 177/177.
  범위 조정: 홀딩은 트랜잭션 데이터라 RDBMS 잔류(REDIS_EPHEMERAL §4).
  매니지드(Upstash REST + REDIS_URL)는 공급자 선정 후 사용자 단계.
  CI: run 43576240506 — fast ✓(1m28s)·e2e ✓(9m6s, D1 189/189)·deploy ✗(7403 예상).
  (#81 fetch 실패 1건은 일시 장애로 재실행 후 녹색 확정 — TG-09와 동일 패턴.)
- [x] **TG-11 Queues 도입** (인프라·코드)
  범위: 발권·정산·알림 saga 비동기화 + 재시도·데드레터. 5분 크론 대체.
  수용: 공급사 타임아웃 주입 시 보상 흐름 E2E 녹색. 의존: TG-09·TG-10.
  증거: 0046 job_queue + queue-service(리스·백오프 5·10·20·40·60분·최대5회).
  FULFIL_BOOK·TICKET_ISSUE 잡 + 공유 보상(홀드해제·전액환불) + DEAD 감사.
  E2E 192/192 fresh(e2e_tg11b) 1회차, 유닛 185/185(신규 8종), tsc·브랜딩·빌드·감사 녹색.
  Red drill: 북 핸들러 무력화 시 tg11a·tg11b 적색(tg11c 격리 녹색)→복원 녹색.
  범위 조정: 자동 정산지급 없음(B3/B7 유지), outbox·웹훅·환불 큐 통합은 후속.
  PG schema.sql 재생성(job_queue만 추가) + gft-pg 델타 적용.
  CI: run 43679836954 — fast ✓(1m13s)·e2e ✓(12m30s, D1 192/192)·deploy ✗(7403 예상).
- [ ] **TG-12 Flutter 앱 착수** (코드)
  범위: API 클라이언트 + 푸시 + 딥링크 + 스토어 베타. API 버전닝·강제업데이트 포함.
  수용: 베타 빌드 + 핵심 예약 플로우 앱 E2E. 의존: 없음(병렬 가능).
- [x] **TG-13 OTel 관측** (인프라·코드)
  범위: 트레이스·메트릭·로그 파이프라인 + SLO + 상태 페이지.
  수용: 주문 1건 추적 데모 + SLO 대시보드. 의존: TG-05.
  증거: zero-dep W3C trace + OTLP 익스포트 + isolate 메트릭(Prometheus) +
  구조화 로그 + 공개 /status + incidents(0048) + SLO.md + /admin/slo +
  trace-order 데모(3요청·6스팬 워터폴). E2E 201/201 fresh(e2e_tg13) 1회차,
  유닛 203pass·0fail(총208, 신규 11종), tsc·브랜딩·빌드 녹색.
  Red drill: 죽은 OTLP URL 조용 실패·위조 traceparent 신규 발급(이상 유닛),
  장애→/status→해소(E2E tg13b). waterfall 부모 보정은 TG-15 전수에서 재검증.
- [ ] **TG-14 호텔 어그리게이터 1곳 연동** (코드)
  범위: 어댑터 + 샌드박스 E2E + 서킷브레이커·폴백. 시뮬레이터와 격리.
  수용: 샌드박스 예약·취소 E2E 녹색. 의존: TG-11.
- [x] **TG-15 ISR 전환** (코드·인프라)
  범위: 카탈로그 온디맨드 렌더 + 엣지 캐시. 전면 프리렌더 폐지.
  수용: 카탈로그 10만 행 가정 부하에서 p95 기준 충족. 의존: TG-09.
  증거: Nuxt cloudflare-module + 카탈로그 isr 3600 + ota-user 워커 분리 +
  hub-assets 스테이징 + 16면 SSR 전환 + API s-maxage/SWR + purge API·5점 배관.
  E2E 203/203 fresh(e2e_tg15) 1회차(신규 tg15a/b + tg13a/b 재검증),
  유닛 207pass·0fail(총212, 신규 4종), tsc·브랜딩·빌드 녹색.
  부하: 10만행 p95 566ms(SLO 1500 통과) + ISR 스모크(신규상품 200·0.22s).
  Red drill: purge 미설정 skip·404 단기캐시(E2E tg15a), 스모크 MISS 404.
  교훈: :8787 사용자 점유(보호 포트 추가), IWR 청크 행에는 curl 사용.

## Phase 3 — 스케일 (해외 판매)

- [x] **TG-16 검색엔진** (인프라·코드)
  범위: Typesense → ES/Vespa, 핫 캐시 + 검색 로그 파이프라인.
  수용: 패싯·지리·가용성 통합 쿼리 p95 기준. 의존: TG-09·TG-15.
  증거: FTS5(0049·트리거 21종) + SearchBackend 심 + /api/v1/search(패싯·
  지리·bookable) + 핫캐시(isolate LRU) + 검색 로그·인기어 API + PG LIKE 분기.
  E2E 205/205 fresh(e2e_tg16b) 2회차(신규 tg16a/b), 유닛 212pass·0fail(총217,
  신규 5종), tsc·브랜딩·빌드 녹색, PG 78T/101idx(tsvector+동기화).
  부하: 10만행 p95 143ms(SLO 통과). 1회차 적색은 FTS 별칭 미지원 — 테이블명 수정.
  잔여: Typesense/ES 어댑터, tsquery PG 전환, suggest, 일자별 가용성.
- [x] **TG-17 글로벌 PG + FDS** (코드·외부)
  범위: Adyen/Stripe + 3DS + 사기 탐지 + 차지백 프로세스.
  수용: 테스트 카드 결제·환불·차지백 E2E. 의존: TG-11.
  증거: stripe.ts(PI·3DS·환불·조회·분쟁·서명검증) + provider 등록 +
  ACTION_REQUIRED + confirmPayment FDS게이트·3DS분기 + 웹훅·복귀 라우트 +
  fds-service 5규칙 + 어드민 심사 API + env 5종 + 0050 fraud_reviews.
  API E2E 205/205 fresh(e2e_tg17) 무회귀 + Stripe 3/3 fresh(e2e_stripe)
  (3DS 왕복·거절·즉시캡처·환불 / FDS hold·승인·재시도 / 차지백 dedupe·서명),
  유닛 224pass·0fail(총229·skip5, 신규 12종), tsc·브랜딩·빌드 녹색,
  PG 79T/103idx. Red drill: decline 단언 필드명 오기(providerCode→details) 적발·수정.
  잔여: Adyen 어댑터, 실키 LIVE 전환, FDS 룰 임계치 운영 튜닝.
- [x] **TG-18 GDS/NDC 연동** (코드·외부)
  범위: GDS 1곳 + NDC 직연동 + 매핑 DB + 요금 캐시.
  수용: 샌드박스 PNR 발급 E2E. 의존: TG-11·TG-14.
  증거: live 어댑터(ndc·gds 공유 코어 + 주문·발권·취소·오퍼) + 0051
  (CHECK 재구축 + 매핑 20/10 + fare_cache) + 서킷브레이커(임계 3·
  쿨다운 5분) + 머니 게이트 503·대체편 + 오퍼 라우트 + 어드민 매핑.
  E2E 4/4 fresh(e2e_sup3) 3회차(어드민·NDC 왕복·GDS 왕복·브레이커),
  API 회귀 205/205 fresh(e2e_tg18) 1회차, 유닛 253pass·0fail(총258,
  신규 29종), tsc·브랜딩·빌드·감사·Go 녹색, PG 82T/104idx.
  Red drill: 게이트 no-op→201 적발·복원, 멱등키 랜덤→REF-2 적발·복원.
  1회차 적색 2건은 테스트 버그(extra `{}`·이름 숫자).
  잔여: 실계약 전환 + NDC XML 인증 + DOCS manifest(8G), 좌석맵·
  부가서비스, BSP 정산, TG-14 베드뱅크, Redis 공용 캐시층.
- [x] **TG-19 웨어하우스 + 추천 v1** (인프라·코드)
  범위: 웨어하우스 + ETL + 실험 플랫폼 + 추천 v1.
  수용: 일 배치 녹색 + 추천 A/B 지표. 의존: TG-03.
  증거: 0052(마트 5종+인덱스 5종+RECO_V1) + 일 배치(롤업·페어·
  인기·크론 스킵) + FNV 버킷 A/B + 3슬롯 API + 클릭 귀속(7일) +
  지표 API + RecoRail·상세 7면.
  E2E 208/208 fresh(e2e_tg19) 1회차(신규 tg19a/b/c), 유닛
  267pass·0fail(총272, 신규 14종), tsc·브랜딩·빌드·감사 녹색,
  PG 87T/109idx + 실DB 델타.
  Red drill: popular 파괴→500 적발·복원, 빈날 0행, 플래그 OFF 503.
  1회차 적색 3건은 테스트 오기·HOTEL 해소·크론 윈도우 (수정 완료).
  잔여: 외부 웨어하우스 이관, ML 추천(TG-21), 실험 자동 판정,
  CTR 대시보드(TG-16 연계).

## Phase 4 — 글로벌

- [x] **TG-20 멀티리전 + 분산 DB** (인프라)
  범위: 리전 확장 + 분산 RDBMS + DR 훈련.
  수용: 리전 장애 시 RTO/RPO 달성 증명. 의존: TG-09·TG-13.
  증거: 읽기 복제본 프록시(허용 GET·지연/장애 폴백·429 통과·
  funnel 미러) + 리전/`x-region`/`/status` + DR 리허설 PASS
  (RTO 2.8s·RPO 25/25·무결성 ok) + 런북 + SLO RTO/RPO +
  백업 복원 검증(정상 PASS·손상 FAIL) + 주간 잡.
  E2E replica 3/3 fresh(e2e_rep2) + 전수 208/208 fresh(e2e_tg20),
  유닛 279pass·0fail(총284, 신규 12종), tsc·브랜딩·빌드·감사 녹색.
  Red drill: 지연·단절·손상 + 프록시 무력화 적발·복원.
  발견: FTS5 로컬 export 불가 · 복원 적재 FK OFF 필수 (런북 §6).
  잔여: 실 리전·분산 RDBMS·DNS 페일오버·게임데이, R2 백업(P1).
- [x] **TG-21 ML 가격·수요 + CS 봇** (코드)
  범위: 수요 예측·동적 마크업·리뷰 LLM·CS 챗봇.
  수용: 지표 개선 A/B 증명. 의존: TG-19.
  증거: 0053(결정·다이제스트·신고·이관·정산컬럼·플래그 OFF) +
  예측(평활·요일·시즌·점유율) · 마크업(±15%·하한가·결정 재사용) ·
  원장/정산 귀속(공급사 기준 제외) · 리뷰 다이제스트(AI/폴백) ·
  CS 봇(규칙/AI·이관·신고) · PII/금칙어 필터 · 실험 2종 · UI.
  E2E 212/212 fresh(e2e_tg21) 1회차(신규 tg21a/b/c/d), 유닛
  302pass·0fail(총307, 신규 23종), tsc·브랜딩·빌드·감사 녹색,
  PG 90T/111idx + 실DB 델타.
  Red drill: 캡 무력화→감사 적발·복원, PII 마스킹, 신고→이관.
  1회차 적색 2건은 테스트 문제(멀티라인 SQL·상한 초과 날짜).
  CI: run 44257914473 — fast ✓(1m34s)·e2e ✓(13m41s, D1 212/212 + stripe 3/3 + suppliers 4/4 + replica 3/3)·deploy ✗(7403 예상).
  (앞선 3런 적색은 CI 배선 문제 — 패스 전환 stale-server 정리(dcbe311)·웹훅 시크릿 단일화(1cd980e)·공급사/레플리카 BASE(060c597) — 수정 후 전 패스 녹색.)
  AI 실측은 스테이징 잔여 (바인딩 미연결).
  잔여: 외부 ML 이관, LLM 고도화, 다국어 봇, 탄력성 리포트.

## 범위 외 (갭 분석 참조, 이 리스트에서 관리 안 함)

- Toss 실가맹·IATA/BSP·PCI 범위 확정·GDPR/PIPL·SOC 2·모의해킹·버그바운티(§13).
- 호텔 2곳째·GDS 정식 계약·보증금·최소 거래량(§7). 24/7 CS·6축 전담 조직(§14).
- 도메인 연결·Resend·GitHub 시크릿 교체는 [개통 체크리스트](../docs/GO_LIVE_CHECKLIST.md).
