# GetForTrip OTA 상용화 준비 전수 감사 리포트 (2026-11-22)

- **점검 일시:** 2026-11-22 14:38 ~ 15:12 KST
- **대상 커밋:** `main@9034fd0` (`fix(e2e): retry transient localhost fetch failures in api helpers`)
- **점검 범위:** 전체 코드베이스(Worker · Nuxt 4 사용자 포털 · Vue 3 관리자/파트너 포털 · Go 백엔드 · CI/CD · 백업 워크플로우) + **실운영 Cloudflare Workers 4종 및 원격 D1(`ota_production`) 직접 실측**
- **선행 문서:** [`OPEN_READINESS_20261109.md`](OPEN_READINESS_20261109.md), [`HYBRID_OTA_WORK_ORDER_20261120.md`](HYBRID_OTA_WORK_ORDER_20261120.md), [`docs/GO_LIVE_CHECKLIST.md`](../docs/GO_LIVE_CHECKLIST.md)

---

## 1. 최종 판정: **NO-GO (정식 상용 오픈 불가)**

| 구분 | 판정 | 요약 |
|---|---|---|
| **코드·아키텍처 완성도** | **높음 (기능 구현 완료 수준)** | 4개 포털 + 85개 Worker 모듈 + D1 57개 마이그레이션(테이블 100개), 타입체크·유닛·Go·브랜딩 가드 전건 통과 |
| **실운영(Production) 서비스 상태** | **장애 존재 (P0 3건)** | ① `ota-user` SSR 목록/상세 **전면 503/404**, ② 주간 D1 백업 **FTS5 오류로 실패**, ③ 제휴사 **시드 시크릿이 운영에 활성화** |
| **상용 거래 가능 여부** | **불가 (0건 판매 가능)** | 전 9개 도메인 72개 상품 중 `bookable: true` **0건**, 결제(`paymentProvider`) 비활성, 실사업자 `DRAFT`, 실도메인 DNS 미연결 |
| **권고 범위** | **내부 개발·QA 단계** | P0 운영 결함 3건 해소 후 **제한적 폐쇄 파일럿** 가능; 정식 상용화는 외부 계약·자격·법무·도메인 완료 후 재판정 필수 |

> **핵심 요약:** 기존 문서(`OPEN_READINESS_20261109.md`)는 "코드 완성, 외부 연동만 블로커(조건부 GO)"로 판정했으나, **2026-11-22 실운영 직접 프로브 및 원격 D1·CI 로그 전수 확인 결과** 실제 상용화를 막는 **신규 P0 운영 결함 3건**과 **P1 보안·데이터 결함 6건**이 추가로 발견되었다.

---

## 2. 코드베이스 규모 및 정적·자동화 게이트 실측

### 2-1. 코드베이스 현황 (2026-11-22 실측)

| 영역 | 기술 스택 | 소스 파일 수 | 코드 라인(LOC) | 비고 |
|---|---|---:|---:|---|
| `worker/src` | Cloudflare Workers (TypeScript) | 85 | 16,739 | API·결제·공급사·정산·원장·크론·SEO·추천·FDS |
| `frontend-user` | Nuxt 4 (`^4.6.1`) SSR + ISR | 159 (페이지 73) | 34,629 | B2C 포털 (`ota-user` 워커) |
| `frontend-admin/src` | Vue 3 + Vite SPA | 45 (뷰 23) | 4,719 | 통합 관리자 콘솔 (`ota-admin`) |
| `frontend-partner/src` | Vue 3 + Vite SPA | 28 (뷰 17) | 4,199 | 파트너 익스트라넷 (`ota-partner`) |
| `backend` | Go 1.23 | 3 (활성 패키지) | 242 | 오프라인 레퍼럴 유틸리티(운영 미사용) |
| `worker/migrations` | Cloudflare D1 (SQLite) | 57 SQL | — | `0001` ~ `0057` 전량 운영 적용 완료 |
| **합계** | — | **320+ (추적 파일 670)** | **60,528+** | `TODO/FIXME` 실질 잔존 0건 |

### 2-2. 게이트 실행 결과 (2026-11-22 직접 실행)

| 게이트 | 실행 명령 / 출처 | 결과 | 상세 |
|---|---|---|---|
| Worker TypeScript | `npm run typecheck` (`tsc -p worker/tsconfig.json`) | **PASS** | exit 0 |
| Admin / Partner TypeScript | `tsc --noEmit` (각 `tsconfig.json`) | **PASS** | 둘 다 exit 0 |
| 유닛 테스트 | `npm test` | **PASS** | 344건 중 **339 pass, 0 fail, 5 skip** (17.1s) |
| Go 테스트 | `cd backend && go test ./...` | **PASS** | exit 0 |
| 브랜딩 가드 | `npm run check:branding` | **PASS** | 552 파일 스캔, 위반 0건 |
| 보안 시크릿 정적 스캔 | `git grep` (키/PEM/토큰 패턴) | **PASS** | 소스 내 실키 유출 없음 |
| 의존성 감사 (critical) | `npm audit --omit=dev --audit-level=critical` (4 패키지) | **PASS (경고 존재)** | Critical 0건이나 **High 취약점 잔존** (§4-P1-5) |
| CI/CD 최신 실행 (`main`) | GitHub Actions `run 44889920065` (2026-11-21) | **PASS** | `fast` + `e2e` + `deploy` 녹색 (17m12s) |
| **주간 D1 백업 (`schedule`)** | GitHub Actions `run 44959006836` (2026-11-21 22:53Z) | **FAIL (P0)** | **FTS5 가상 테이블 때문에 `d1 export` 실패** (§3-P0-2) |
| 운영 검증 (`verify-production.js`) | `BASE_URL=ota-hub VERIFY_ACK_PROD=1` (무인증 읽기전용) | **31/47 PASS** | 15건은 미보유 어드민/QA 인증(401), 1건(T42)은 결제 비활성(503) |

---

## 3. 신규 발견 치명적 블로커 (P0 — 코드·인프라 즉각 조치 필요)

기존 보고서에 없었으나 이번 실환경 점검에서 확인된 **상용 오픈 즉각 차단 사유 3건**:

### P0-1. 사용자 SSR 포털(`ota-user`) 목록·상세 페이지 전면 503 / 404 장애
- **관측 사실 (2026-11-22 15:09~15:10 KST 직접 호출):**
  - `https://ota-user.dnjstjqppk.workers.dev/` → `200` (45,275B)
  - 정적/랜딩 페이지(`/hotels`, `/flights`, `/flights/search`, `/cars`, `/trains`, `/transfers`, `/packages`, `/esim`, `/insurance`, `/status`, `/login`, `/register`, `/terms`, `/privacy`) → `200`
  - **동적 목록 페이지 전면 `503`:** `/hotels/list`, `/things-to-do`, `/cars/list`, `/trains/search`, `/transfers/list`, `/packages/list`
  - **동적 상품 상세 페이지 전면 `404`:** `/hotels/detail/htl_seoul_01`, `/flights/detail/flt_ke723`, `/things-to-do/detail/act_lotte_world`
- **근본 원인:** [`frontend-user/wrangler.jsonc`](../frontend-user/wrangler.jsonc)가 SSR API 주소로 `NUXT_API_BASE_SERVER="https://ota-hub.dnjstjqppk.workers.dev/api/v1"`를 지정하고 [`frontend-user/composables/useApi.ts`](../frontend-user/composables/useApi.ts)에서 일반 `fetch()`로 호출한다. Cloudflare Workers 런타임에서는 **동일 계정의 `*.workers.dev` 워커 간 직접 HTTPS `fetch()`가 차단(Error 1042)** 되므로, `apiFetch`가 `status: 0 (NETWORK_ERROR)`를 반환하고 SSR 페이지가 503/404로 실패한다. 로컬 E2E는 `127.0.0.1`로 호출했기 때문에 이 장애를 검출하지 못했다.
- **해결 방안:** `frontend-user/wrangler.jsonc`에 Cloudflare **Service Binding**(`"services": [{ "binding": "API", "service": "ota-hub" }]`)을 추가해 SSR에서 `event.context.cloudflare.env.API.fetch()`로 내부 호출하거나, 실도메인(`getfortrip.com`) + Routes 통합 후 검증해야 한다.

### P0-2. 운영 D1 자동 백업 및 DR 복구 검증 파이프라인 완전 고장
- **관측 사실:** `Weekly D1 Backup` 워크플로우 최신 실행(`run 44959006836`, 2026-11-21 22:53 UTC)이 24초 만에 **실패**했다.
- **에러 원문:**
  ```text
  ✘ [ERROR] D1 Export error: cannot export databases with virtual tables (like FTS5)
  ```
- **근본 원인:** 2026-11-21 운영에 적용된 `0049_search_fts.sql`이 FTS5 가상 테이블(`catalog_fts` + 21개 트리거)을 생성했다. Cloudflare D1의 `wrangler d1 export`는 가상 테이블이 존재하는 DB의 익스포트를 지원하지 않는다. 결과적으로 `.github/workflows/db-backup.yml`의 주간 오프사이트 SQL 백업과 `restore-verify` 잡이 모두 동작하지 않으며, 상용 DB 백업 체계가 상실된 상태다.
- **해결 방안:**
  1. FTS5 인덱스를 별도 D1 데이터베이스(검색 전용 인덱스 DB)로 분리하여 트랜잭션 메인 DB(`ota_production`)에서 가상 테이블을 제거하거나,
  2. Cloudflare D1 Time Travel(30일 PITR) 정책과 병행해 일반 테이블만 스키마+행 단위로 덤프하는 백업 스크립트로 [`scripts/backup-d1.js`](../scripts/backup-d1.js)를 재설계하고 `restore-verify`를 녹색으로 복구한다.

### P0-3. 운영 DB에 공개 시드 제휴 시크릿·더미 ID가 `is_active = 1`로 활성화됨 (보안 취약)
- **관측 사실 (`ota_production` 원격 D1 `affiliate_partners_config` 직접 조회):**
  - `agoda`: `is_active = 1`, `affiliate_id = 'CID-AGODA-19283'`, `secret_key = 'agoda_hmac_secret_2026'`
  - `klook`: `is_active = 1`, `affiliate_id = 'AID-KLOOK-38291'`, `secret_key = 'klook_hmac_secret_2026'`
  - `myrealtrip`: `is_active = 1`, `affiliate_id = 'AID-MRT-7721'`, `secret_key = 'mrt_hmac_secret_2026'`
  - `travelpayouts`: `is_active = 0`, `affiliate_id = 'SET_VIA_WRANGLER_D1_MARKER'`, `secret_key = 'SET_VIA_WRANGLER_D1_SECRET_TRAVELPAYOUTS'`
- **위험성:** 저장소에 노출된 더미 시크릿 문자열(`*_hmac_secret_2026`)이 그대로 운영 DB에서 활성 상태이므로, 외부 공격자가 유효한 HMAC 서명을 위조해 가짜 제휴 전환 포스트백을 주입할 수 있고, 실사용자 클릭은 더미 제휴 ID로 빠져 수익이 귀속되지 않는다.
- **해결 방안:** 실계약 완료 전까지 운영 `affiliate_partners_config`의 모든 미계약 파트너를 `is_active = 0` 및 `secret_key = ''`로 비활성화하고, 실계약 시 랜덤 시크릿으로 교체한다.

---

## 4. 추가 발견 보안·운영·데이터 결함 (P1 — 오픈 전 정리 필요)

### P1-1. 전용 포털 3종(`ota-user`, `ota-admin`, `ota-partner`) 보안 HTTP 헤더 전무
- **실측:** `ota-hub` API 응답은 5종 보안 헤더(`Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`)를 정상 송출한다.
- 반면 독립 워커 3종(`ota-user`, `ota-admin`, `ota-partner`)의 루트 응답에는 **보안 헤더가 0개**다(`sec=[]`). 클릭재킹(`X-Frame-Options` / `frame-ancestors`), MIME 스니핑(`nosniff`), HSTS 보호가 누락되어 있다.
- **조치:** `frontend-admin/public/_headers`, `frontend-partner/public/_headers` (Cloudflare Assets `_headers`) 및 `frontend-user` Nitro `routeRules`에 공통 보안 헤더를 설정한다.

### P1-2. 운영 카탈로그 데이터 품질 결함 (가짜 좌표·이미지 누락·수용량 NULL)
- **호텔 좌표 오염:** 운영 `hotels` 14건(파리·서울·도쿄·오사카·후쿠오카·방콕) **전부** 동일한 도쿄 롯폰기 좌표(`latitude: 35.6599, longitude: 139.7292`)를 갖고 있으며, `thumbnail_url = null`, `images_json = "[]"`, `review_count = 0`이다.
- **수용량 누락:** 운영 `activities` 테이블에 `daily_capacity IS NULL` 행 **1건** 잔존 (`GO_LIVE_CHECKLIST.md` 0단계 기대치: 0건).
- **미해결 예약 잔존:** 운영 `bookings`에 2026-10-18 시드 예약 `bkg-init-001`이 `MANUAL_REVIEW_REQUIRED` 상태로 방치되어 있다.

### P1-3. 운영 파트너 테이블에 QA 테스트 계정·플레이스홀더 잔존
- 운영 `partners` 테이블 8행 중:
  - QA 스크립트 잔여 계정 4건(`verify_54967`, `applicant_54967`, `verify_68136`, `applicant_68136`)이 `is_active = 1` 상태로 잔존.
  - 플레이스홀더 1건(`ptn_mw62m1m2_yaoxd`, `"운영 파트너(정보 업데이트 예정)"`) 잔존.
  - 시드 목 파트너 3건(`ptn_htl_01`, `ptn_tour_01`, `ptn_car_01`) 잔존.

### P1-4. 법무·사업자 정책 불일치 및 관리자 MFA 미활성
- **사업자 정책 충돌:** [`frontend-user/components/GlobalFooter.vue`](../frontend-user/components/GlobalFooter.vue)는 P1 작업(2026-11-20)으로 `여행업 등록` 표기를 제거하고 통신판매업 기반으로 전환했으나, [`worker/src/routes/admin.ts`](../worker/src/routes/admin.ts)(L479) 및 [`frontend-admin/src/views/EntitiesView.vue`](../frontend-admin/src/views/EntitiesView.vue)(L25)는 판매주체를 `ACTIVE`로 전환할 때 `travel_agency_license_no`를 여전히 필수 요구한다.
- **관리자 MFA 0명:** 운영 `users`에 `ADMIN` 계정 2명이 존재하나 `admin_mfa_secrets` 행은 **0건**(MFA 전원 미등록).

### P1-5. 의존성 High 취약점 잔존 및 루트 임시 파일
- `npm audit --omit=dev` 기준 Critical은 0건이나 High 취약점이 남아 있다:
  - 루트: 3 High (`node-forge`, `undici`, `vite` — 합계 20건)
  - `frontend-user`: 3 High (합계 18건)
  - `frontend-admin`: 4 High (합계 6건)
  - `frontend-partner`: 1 High (합계 2건)
- 루트 디렉터리에 임시 파일 `temp_master_prompt.md`가 그대로 남아 있으며, `reports/FULL_AUDIT_20261109.md:103`에 과거 시드 어드민 비밀번호 문자열이 평문 인용되어 있다(실운영 비밀번호와 분리 여부 재확인 필요).

### P1-6. 동시 PG 제한 및 외부 어댑터 스텁 한계
- **PG 단일 활성:** `PAYMENT_PROVIDER`는 `toss` 또는 `stripe` 중 택1 구조로, 국내/해외 카드 동시 결제는 미구현(`docs/GO_LIVE_CHECKLIST.md` §7S 명시).
- **NDC/GDS 어댑터:** [`worker/src/suppliers/live-adapter.ts`](../worker/src/suppliers/live-adapter.ts)는 JSON-over-HTTP 스텁 계약이며, 항공사 공식 NDC XML 프로파일 인증 및 여권 DOCS manifest 전송은 미구현(`GO_LIVE_CHECKLIST.md` §8G 명시).

---

## 5. 외부 인프라·계약·자격 블로커 현황 (2026-11-22 실측 대조)

### 5-1. Cloudflare Worker 운영 시크릿 실측 (`npx wrangler secret list`)

현재 `ota-hub` 운영 워커에 등록된 시크릿은 **2개뿐**이다:
- 등록됨: `JWT_SECRET`, `AFFILIATE_HMAC_SECRET`
- **미등록 (상용화 필수):**

| 항목 | 필요한 시크릿 / 설정 | 현재 운영 상태 (실측) | 영향 |
|---|---|---|---|
| **결제 PG (Toss / Stripe)** | `TOSS_SECRET_KEY`, `TOSS_CLIENT_KEY`, `TOSS_WEBHOOK_SECRET` (또는 `STRIPE_*`) | `/api/v1/payments/config` → `enabled: false, provider: null` | **결제 전면 불가** |
| **여권 PII 암호화** | `PII_ENC_KEY` (32B base64 AES-GCM) | 미등록 | **항공(여권 포함) 예약 503 차단** |
| **판매주체 사업자** | `business_entities.ent_primary` 실정보 + `ACTIVE` | `status: "DRAFT"`, 전 항목 `null` | 전자상거래법 필수 표기 미충족·직판 차단 |
| **트랜잭션 이메일** | `RESEND_API_KEY`, `EMAIL_FROM` + 발신 도메인 SPF/DKIM | 미등록 | 예약확정·비밀번호 재설정 메일 발송 불가 |
| **오류 관측 (Sentry)** | `SENTRY_DSN` (Worker Secret + GitHub Secret) | 미등록 | 운영 런타임·프론트 에러 감지 불가 |
| **실도메인 & DNS** | `getfortrip.com`, `admin.getfortrip.com`, `partner.getfortrip.com` | **`getfortrip.com` NXDOMAIN** (`workers.dev`만 응답) | `sitemap.xml`·canonical·이메일 링크가 모두 존재하지 않는 도메인을 가리킴 |
| **실공급사 계약 & 재고** | `suppliers` (`LIVE`), `entity_contracts` (`ACTIVE`), 도매 SKU/마진 | 공급사 **17/17 `NOT_INTEGRATED`**, 계약 `PENDING`, 도매 SKU **0건**, 판매가능 상품 **0/72건** | **전 도메인 예약 409 차단** |
| **소셜 로그인 (선택)** | `OAUTH_{KAKAO,GOOGLE,NAVER}_CLIENT_SECRET` | 미등록 | 이메일 로그인만 가능 |
| **사업자 진위 API (선택)** | `NTS_API_KEY` | 미등록 | 파트너 입점 시 수동 심사만 가능 |
| **약관 법무 확정** | 이용약관·개인정보처리방침·파트너 약관 법률 검토 | v2.1 초안(법무 검토 미확정) | 법적 분쟁 리스크 |
| **Cloudflare Workers 유료 플랜** | Workers Paid Plan (PBKDF2 100k CPU 예산) | 사전 확인 필요 (`GO_LIVE_CHECKLIST.md` §0) | 무료 플랜 10ms 초과 시 로그인/가입 실패 위험 |

---

## 6. 실운영 D1 건전성 실측 요약 (`ota_production`, 2026-11-22)

| 점검 항목 | 실측값 | 기대치 | 판정 |
|---|---:|---:|:---:|
| 적용된 마이그레이션 | 57 (`0057_indexnow_queue.sql`) | 57 | **OK** |
| FTS5 인덱스 정합 (`catalog_fts` vs 7도메인 합) | 63 / 63 | 일치 | **OK** |
| `bookings.total_minor IS NULL` | 0 | 0 | **OK** |
| `cron_heartbeats` 최근 실행 | `2026-11-22T06:05:55Z` (`ok: 1`) | 5분 주기 정상 | **OK** |
| `incidents` 미해결(`OPEN`) / `job_queue` `DEAD` | 0 / 0 | 0 / 0 | **OK** |
| `activities` / `transfers` / `packages` `daily_capacity IS NULL` | **1** / 0 / 0 | 0 / 0 / 0 | **WARN** |
| `admin_mfa_secrets` 등록 수 | **0** (어드민 2명) | >= 2 | **WARN** |
| `suppliers` `LIVE` 수 / `bookable` 상품 수 | **0 / 17** · **0 / 72** | >= 1 | **BLOCKED** |
| `business_entities` `ACTIVE` 수 | **0 / 1** (`DRAFT`) | 1 | **BLOCKED** |
| `affiliate_partners_config` 더미 시크릿 활성 수 | **3** (`agoda`, `klook`, `myrealtrip`) | 0 | **FAIL (P0)** |
| `payments` / `ledger_entries` 실거래 행 | 0 / 0 | 파일럿 시 > 0 | **미개통** |

---

## 7. 잘 구축되어 있는 강점 (유지·활용 자산)

상용화 블로커와 별개로, 플랫폼의 내부 코어 엔지니어링 품질은 높은 수준으로 검증되었다.

1. **결제·원장 안전 설계 (Fail-Closed):** PG 키 미등록 시 결제 자동 차단(`enabled: false`), 클라이언트 임의 금액 조작 방지(서버 견적 강제), 환불 단일화 유니크 인덱스(`0039`), 이중 원장 및 사가 보상 잡 큐(`0046`), Stripe 3DS/FDS/차지백, Toss 웹훅 화해 로직 완비.
2. **예약 상태 머신·재고 가드:** 미계약 공급사 409 차단, 재고 홀딩·만료 크론, 슬롯 클레임, 하한가 보호, 멱등성 키 강제, IDOR 방어.
3. **3포털 분리 및 하이브리드 마켓플레이스:** 사용자(73p)·관리자(23뷰)·파트너(17뷰) 분리, 1P/3P/위탁판매 + 제휴 딥링크(`DIRECT_PG` / `AFFILIATE_REDIRECT` / `HYBRID_FILTERED`) 전략 라우터, 도매 프리체크아웃 500ms 가격 검증.
4. **자동화 품질 게이트:** 유닛 339 pass, CI 멀티-스위트 E2E(212 + Stripe 3 + Suppliers 4 + Replica 3), 브랜딩 가드, pre-commit 5단계 게이트, 안전한 post-commit 기본 비배포 정책.
5. **SEO·관측 기반:** `/sitemap-index.xml`, `/llms.txt`, `/llms-full.txt`, IndexNow 큐, `/status` 페이지, FTS5 검색, OTel 트레이싱 및 SLO 대시보드 구조 완비.

---

## 8. 상용화 전환 실행 로드맵 (권장 순서)

### Stage 1. 운영 결함 즉시 복구 (코드·DB 작업, 외부 계약 불요 — 예상 1~2일)
1. **[P0-1] `ota-user` SSR 503/404 해결:** `frontend-user/wrangler.jsonc`에 `ota-hub` Service Binding 추가 및 `useApi.ts` SSR 내부 fetch 연결 → 전 목록/상세 페이지 `200` 확인.
2. **[P0-2] D1 백업 복구:** `catalog_fts` 분리 또는 비가상 테이블 덤프 방식으로 `scripts/backup-d1.js` 수정 → `Weekly D1 Backup` 워크플로우 수동 실행 녹색 확인.
3. **[P0-3] 운영 더미 제휴 시크릿 비활성화:** `affiliate_partners_config`의 `agoda`/`klook`/`myrealtrip`를 `is_active = 0`, `secret_key = ''`로 정리.
4. **[P1-1~P1-5] 보안·데이터 위생:** 3포털 보안 헤더 적용, 운영 QA 파트너 4건 및 `bkg-init-001`·`activities` NULL 수용량 정리, 호텔 실좌표·이미지 보강, 관리자 2명 MFA 등록, `EntitiesView`/`admin.ts`의 `travel_agency_license_no` 정책 통일, High 취약점 패키지 업데이트, `temp_master_prompt.md` 삭제.

### Stage 2. 인프라·도메인·관측 개통 (계정·키 등록)
1. **커스텀 도메인 연결:** `getfortrip.com` / `admin.getfortrip.com` / `partner.getfortrip.com` DNS·Cloudflare Custom Domain 연결 후 `PUBLIC_SITE_URL`/`PARTNER_SITE_URL`/`ALLOWED_ORIGINS` 검증.
2. **필수 시크릿 등록:** `PII_ENC_KEY`, `RESEND_API_KEY`(+ `EMAIL_FROM` & SPF/DKIM), `SENTRY_DSN`(Worker + GitHub Secret).
3. **Cloudflare Workers 유료 플랜 확인** 및 운영 `verify-production.js` 전체 47/47 실행 (`TEST_ADMIN_PASSWORD` 사용).

### Stage 3. 상용 거래 개통 (사업·계약·법무)
1. **사업자·법무 확정:** 실사업자 정보 입력 → `business_entities.ent_primary = ACTIVE`, 약관/개인정보처리방침/파트너 약관 변호사 검토 완료.
2. **초기 판매 모델 선택 개통:**
   - **제휴 모델 우선 오픈 시:** Agoda/Klook/MyRealTrip/Travelpayouts 실계정 승인 후 실 마커·시크릿 입력 → 클릭·포스트백 대사 검증.
   - **직판/도매/3P 결제 오픈 시:** Toss(또는 Stripe) 테스트키 풀루프(결제→확정→바우처→취소→환불→정산) → 라이브키 소액 실결제 대사 → 실공급사/도매 SKU/3P 실파트너 계약 후 `LIVE` 전환.

---

## 9. 결론

**GetForTrip은 "소프트웨어 플랫폼 뼈대와 핵심 거래 엔진"은 상용급에 근접하게 구현되어 있으나, 2026-11-22 현재 시점에서는 실제 OTA로 상용 오픈할 수 없다(`NO-GO`).**

- **코드·운영 측 블로커(Stage 1):** `ota-user` SSR 목록/상세 503·404 장애, FTS5로 인한 D1 주간 백업 실패, 운영 DB 더미 제휴 시크릿 활성화, 3포털 보안 헤더 누락 — **개발팀이 지금 즉시 수정 가능.**
- **사업·인프라 측 블로커(Stage 2~3):** 결제 PG 키(0), 여권 암호화 키(0), 실사업자 등록(`DRAFT`), 실공급사/도매 계약(0건, 판매 가능 상품 0/72건), 실도메인 DNS(NXDOMAIN), 이메일/Sentry 미연동, 약관 법무 검토 — **외부 계약 및 자격 발급 선행 필수.**
