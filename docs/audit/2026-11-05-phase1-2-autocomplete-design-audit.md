# PHASE 1–2 현황 조사 및 자동완성 전수 감사 (2026-11-05)

기준 커밋: `59bf9e2` (프로덕션 배포 버전 ota-hub `5e8ab4d3`)
판정 기준: PASS / FAIL / BLOCKED / NOT_RUN — 실제로 실행한 항목만 PASS.

---

## 1. 코드베이스 구조

| 영역 | 스택 | 규모 | 진입점 |
|---|---|---|---|
| 사용자 콘솔 | Nuxt 4 (SSR + 정적 prerender), Tailwind 3, Pinia, @nuxtjs/i18n | 페이지 83개, 컴포넌트 10개, Vue 13.7K줄 | `ota-hub` (getfortrip.com) |
| 관리자 콘솔 | Vite + Vue 3 SPA | 뷰 13개 | `ota-admin` |
| 파트너 콘솔 | Vite + Vue 3 SPA | 뷰 10개 | `ota-partner` |
| API | Cloudflare Worker (TypeScript), D1 | 라우트 11개 모듈 | `/api/v1/*` |
| 레거시 | Go 백엔드 (`backend/`), 사용자 앱 내 `/partner/*` 페이지 7개 | — | 파트너 콘솔과 기능 중복 |

### 1.1 메뉴에 없는 라우트 (숨은 라우트)

- 사용자 앱 `/partner/*` (index, login, products, bookings, settings, settlement, api-docs): 독립 파트너 콘솔(`ota-partner`)과 중복된 구 화면. **정리 대상**(삭제하지 않고 PHASE 4에서 파트너 콘솔로 리다이렉트 검토).
- `*/booking.vue` 7개: `useLegacyCheckoutRedirect`로 `/checkout`에 리다이렉트(정상).
- `*/[id].vue`와 `*/detail/[id].vue`가 상품군마다 공존. `*/detail/index.vue`는 쿼리 기반 상세. 중복 경로.
- `/booking/complete`, `/booking/success`, `/booking/result` 3종이 공존.
- `/trip-best`, `/moments`, `/rewards`, `/news`, `/careers`, `/sustainability`, `/safety`: 푸터 링크로만 진입.

## 2. 디자인 현황

- 색상 토큰이 `trip.*`(blue `#287DFA`, navy `#0F294D`)로 정의돼 있었음. **타사 OTA 브랜드 색상과 동일 → 독자 브랜드 원칙 위반**.
- `BRANDING.md`의 공식 팔레트(Sapphire `#1A6BFF`, Horizon Cyan `#00D2FF`, Sunrise Coral `#FF5A36`, Deep Midnight `#0B192C`)는 코드에서 사용되지 않음.
- 폰트 `Pretendard`를 선언했지만 로드하지 않음(시스템 폰트로 대체 렌더).
- 다크 모드: 사용자·관리자·파트너 모두 0곳.
- 페이지마다 `bg-slate-*`, `text-blue-600` 등 원시 색상을 직접 사용 → 공통 디자인 시스템 없음.

## 3. 자동완성 전수 감사

### 3.1 입력창 인벤토리

| # | 화면 | 입력 | 구현 여부(감사 시점) | 도메인 |
|---|---|---|---|---|
| 1–10 | 홈 검색 위젯 | 호텔 목적지, 항공 출발/도착, 기차 출발/도착, 렌터카 인수, 공항이동 공항/호텔, 액티비티, 패키지 | 구현 | 각 도메인 |
| 11–12 | `/flights` | 출발/도착 | 구현 | flights |
| 13–14 | `/flights/search` | 출발/도착 | 구현 | flights |
| 15 | `/hotels` | 목적지 | 구현 | hotels |
| 16 | `/hotels/list` | 목적지 | 구현 | hotels |
| 17–18 | `/trains` | 출발/도착역 | 구현 | trains |
| 19–20 | `/cars` | 인수/반납 | 구현 | cars |
| 21 | `/cars/list` | 인수 지점 | 구현 | cars |
| 22–23 | `/transfers` | 공항/목적지 | 구현 (도메인을 flights/hotels로 우회 사용) | — |
| 24–25 | `/packages` | 출발/도착 | 구현 | flights / packages |
| 26 | `/things-to-do` | 검색어 | **미구현** | — |
| 27 | `/esim` | 국가 | **미구현** (일반 텍스트 필터) → 2026-11-06 구현 (ISO 코드 필터, `?country=`) | esim |
| 28 | `/insurance` | 여행 국가 | **미구현** → 2026-11-06 구현 (`?country=`, `?days=`) | insurance |
| 29 | 크루즈 | 출발 항구 | **상품·페이지 자체 없음** | — |
| 30 | `/moments` 글쓰기 | 도시 | 미구현 (일반 텍스트) | — |
| 31 | 관리자 사용자 관리 | 이메일·이름 검색 | 미구현 (목록 내 필터) | — |
| 32 | 관리자 파트너 관리 | 회사명·사업자번호 | 미구현 (목록 내 필터) | — |
| 33 | 관리자 카탈로그 | 상품 검색 | 미구현 (목록 내 필터) | — |
| 34–35 | 관리자 URL 수집 | 국가/도시 | 미구현 (자유 입력 → 데이터 불일치 원인) | — |
| 36 | 관리자 기능 플래그 | 키 검색 | 목록 내 필터 (자동완성 불필요) | — |
| 37 | 파트너 예약 관리 | 예약번호·상품명 | 미구현 (목록 내 필터) | — |
| 38 | 사용자 앱 `/partner/bookings` (레거시) | 예약코드 | 미구현 | — |

합계 38개 중 자동완성 적용 25개, 미적용 13개.

### 3.2 결함 목록 (감사 시점 코드 기준)

| ID | 심각도 | 내용 | 근거 |
|---|---|---|---|
| AC-01 | P0 | **API 실패 시 하드코딩 목록으로 대체**하여 실제 검색 결과처럼 표시. "숙소 2,450개", "일일 320편", "최대 25% 할인" 같은 **근거 없는 수치** 노출 | `SearchAutocomplete.vue` 폴백 인덱스 |
| AC-02 | P0 | 서버 추천 API도 장소 데이터를 **코드에 하드코딩**(도시 15, 공항 13, 역 4, 렌터카 3, 명소 6). DB 장소 테이블 없음 | `catalog.ts` `GLOBAL_INDEX` |
| AC-03 | P1 | 한글 IME: `v-model`이 조합 완료 전까지 값을 갱신하지 않아 **한 글자를 조합하는 동안 추천이 뜨지 않음**. 조합 확정용 Enter가 첫 항목을 선택하는 문제 | `v-model` + `@keydown.enter` |
| AC-04 | P1 | 강조 없이 Enter를 누르면 **임의의 첫 항목을 자동 선택** → 잘못된 선택 | `selectHighlighted()` |
| AC-05 | P1 | `LIKE '%q%'`에 사용자 입력을 그대로 바인딩 → `%`, `_` 입력 시 전체 매칭 | 추천 API 상품 쿼리 |
| AC-06 | P1 | 도시 코드(TYO, SEL 등) 선택 시 항공 검색 결과 0건 (도시→공항 확장 없음) | `/api/v1/flights` |
| AC-07 | P1 | 렌터카 추천의 이동 경로 `/cars?loc=`를 `/cars` 페이지가 읽지 않음 → 선택이 무시됨 | `cars/index.vue` |
| AC-08 | P2 | 기차 추천 경로가 클라이언트(`/trains?dep=`)와 서버(`/trains/search?dep=`)에서 서로 다름 | 두 곳의 정적 목록 |
| AC-09 | P2 | 선택 결과가 표시 텍스트만 넘어감(ID·코드 일부만). 최근 검색도 제목 기준 중복 제거 | `saveRecentSearch` |
| AC-10 | P2 | 오류·오프라인·결과 없음 상태 구분 없음, 재시도 없음 | — |
| AC-11 | P2 | `aria-controls`, `aria-activedescendant`, `role=option` 없음 | — |
| AC-12 | P2 | 응답 캐시 없음, 동일 검색어 재요청 | — |
| AC-13 | P2 | 추천 API가 매 요청마다 공급사 맵(`supplierBookabilityMap`)을 먼저 조회 → 불필요한 DB 쿼리 | `handleCatalog` 첫 줄 |
| AC-14 | P3 | 오타·초성·별칭(동경, 사이공 등) 검색 불가 | 단순 `includes` |

## 4. 이번 작업에서 반영한 내용

### 4.1 서버
- `worker/migrations/0006_places.sql`: `places` 테이블과 참조 데이터 269건(국가 38, 도시 78, 공항 84, 역 25, 크루즈 항구 9, 지역 20, 명소 15). 공식 명칭과 IATA/ISO 코드만 저장하며 가격·수량은 저장하지 않음. `popularity`는 정렬 가중치이고 화면에 표시하지 않음.
- `worker/src/services/suggest-service.ts`: 정규화(NFKC·대소문자·발음기호·공백), 한글 초성 검색, 경계형 편집거리 기반 오타 허용, 코드 완전일치 > 이름 완전일치 > 접두 > 단어 접두 > 부분일치 순의 점수, 도메인별 장소 유형 제한, `LIKE` 이스케이프, 장소 테이블이 없으면 상품만 반환하고 `degraded: true`.
- `/api/v1/search/suggest`: 새 엔진으로 교체, `Cache-Control: public, max-age=60`, `meta.took_ms` 반환, 공급사 맵 조회 전에 응답(AC-13).
- `/api/v1/flights`: 도시 코드를 소속 공항으로 확장(AC-06).

### 4.2 사용자 프론트엔드
- `SearchAutocomplete.vue` 전면 재작성: AC-01, 03, 04, 09, 10, 11, 12 해결. 하드코딩 목록 전부 삭제.
- 디자인 시스템 "Horizon" 토큰: `tailwind.config.js`, `assets/css/tailwind.css` (라이트/다크 CSS 변수, BRANDING.md 팔레트), Pretendard 로드. 기존 `trip.*` 이름은 새 브랜드 색상을 가리키는 호환 별칭으로 유지(PHASE 4에서 제거).

### 4.3 검증 결과

| 항목 | 판정 | 증거 |
|---|---|---|
| 워커 타입 체크 | PASS | `npx tsc -p worker/tsconfig.json` 오류 0 |
| 단위 테스트 (자동완성 15건 포함) | PASS 36/36 | `node --test worker/test/unit/*.test.ts` |
| API e2e (자동완성 e2e 1건 포함) | PASS 28/28 | `api.e2e.mjs` vs 로컬 wrangler dev |
| 추천 API 응답 속도(로컬) | PASS | 워밍 후 13–26ms, 콜드 95–106ms |
| 주요 9개 페이지 SSR 렌더 | PASS | 200 응답 |
| 브라우저 상호작용 26개 시나리오 | PASS 26/26 | 헤드리스 Chrome + CDP: 포커스 추천, 한글 실시간 검색, ↓/Enter 선택(코드 포함 값), ESC, 결과 없음, 강조 없는 Enter가 임의 선택하지 않음, 코드 완전일치 Enter, 캐시(재요청 0회), 디바운스(6타 → 1요청), **IME 조합 중 추천 표시 및 조합 Enter 무시**, API 장애 시 오류 상태(대체 목록 없음)와 재시도 복구, 375/320px 화면 이탈 없음, 터치 영역 56px, 호텔·기차·홈 실데이터, 페이지 오류 0 |
| 하이드레이션 | PASS | `Math.random()` id → `useId()`로 수정 후 불일치 경고 0 |
| 홈 검색 위젯 아이콘·글자 겹침 | FAIL (기존 결함) | 프로덕션에서도 동일. 위젯이 넘기는 `inputClass`의 좌측 여백 문제 → PHASE 4 홈 재설계에서 해결 |
| 프로덕션 마이그레이션 0006 | BLOCKED | 운영 DB 변경은 별도 승인 필요 |

### 4.4 2026-11-06 추가: eSIM·여행자보험

| 항목 | 판정 | 증거 |
|---|---|---|
| 하드코딩 상품 목록 제거, `/api/v1/esim/plans`·`/api/v1/insurance/plans` 사용 | PASS | 브라우저: eSIM 6건, 보험 3건 API 데이터 |
| 가짜 결제·QR 발급·보험 가입·증권번호 생성 제거 | PASS | 구매/가입 버튼 전부 비활성, 완료 문구 0건 |
| 계약 근거 없는 보험사명(시드 `underwriter`) 미노출, `홍길동` 기본값 제거 | PASS | 화면 텍스트 검사 |
| 국가 자동완성 → ISO 코드 필터, 지역 묶음 상품은 추정 매칭 안 함 | PASS | JP 3건, CA → `미국/캐나다` 1건, FR → 빈 상태 |
| 서버 계산 보험료(일 요율 × 일수), 1–90일 제한, URL 동기화 | PASS | 5일 12,000 · 6일 14,400 · 90일 216,000 · 딥링크 복원 |
| 추천 API 부제 "판매 중인 eSIM 요금제" → "eSIM 요금제 보기" (판매하지 않음) | PASS | 단위 테스트 36/36 |
| 360px 가로 넘침, 페이지 오류·하이드레이션 경고 | PASS | 브라우저 26/26 |

## 5. BLOCKED / 외부 의존

- **eSIM·여행자보험 판매**: 통신사(eSIM) 제휴, 보험대리점 등록과 보험사 제휴가 없어 구매·가입은 막아 둠. 예약 엔진(`/quotes`)도 두 상품을 지원하지 않음.

- **크루즈**: 상품 테이블·페이지·공급사가 없음. 항구 장소 데이터만 준비했고, 선택해도 존재하지 않는 페이지로 이동하지 않도록 `target_url: null` 처리.
- **실시간 공항/도시 데이터 확장**: 전 세계 공항 전체(약 9,000개)는 IATA 유료 데이터 또는 공개 데이터셋(OurAirports, CC0) 적재 작업이 필요. 현재는 주요 노선 중심 84개.
- **이메일 발송**: 가격 알림·비밀번호 재설정 메일은 발송 서비스 미정(BLOCKED_NO_PROVIDER, 기존과 동일).
