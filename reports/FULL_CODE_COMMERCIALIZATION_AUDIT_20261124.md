# GetForTrip OTA 독립 전수 감사 보고서 — 개발 영역 상용화 100% 검증 (2026-11-24)

- **감사 일시:** 2026-11-24 13:47 ~ 13:55 KST
- **감사 대상:** `main@f73b80f` (Stage 1 조치 `5eb9583`·`fe7bd97` 및 도메인 라우팅 문서 수정 `f73b80f` 반영 이후)
- **감사 질문:** *"사람이 해줘야 하는 외부 작업(계약·자격·사업자·도메인·법무)을 제외하고, 코드·엔지니어링 영역은 실제 OTA 상용화 100%까지 구현되었는가?"*
- **검증 방식:** 기존 문서 주장을 신뢰하지 않고 **전체 코드베이스 정적 검사 + 로컬 게이트 재실행 + 실운영 Cloudflare Workers 4종 직접 프로브 + 원격 D1(`ota_production`) 직접 쿼리 + GitHub Actions 로그 직접 확인**

---

## 1. 최종 감사 판정

### 결론: **NO — 아직 "개발 영역 100%"는 아니다.**

사람의 영역(PG 계약·실공급사 계약·사업자 등록·도메인 DNS·시크릿 등록·실사진·법무 검토·관리자 MFA 등록)을 전부 제외하더라도, **코드·엔지니어링으로 해결해야 할 상용화 갭이 남아 있다.** 다만 Stage 1 조치(`5eb9583`)로 2026-11-22에 발견된 치명적 P0 운영 장애 3건이 모두 해소되어 **핵심 거래 코어는 상용 수준에 매우 근접**했다.

| 평가 기준 | 개발 구현 완성도 (사람 영역 제외) | 판정 | 핵심 미달 사유 |
|---|---:|:---:|---|
| **기준 A: 국내 KRW 단일상품 OTA (직판·3P·제휴 MVP/파일럿)** | **약 94%** | **조건부 근접 (잔여 5건)** | 3포털 CSP 미적용, 의존성 High 취약점(4패키지), CI 프론트 타입체크 누락(`frontend-user` 스크립트 없음), Toss 웹훅 시크릿 비교·Fail-Closed 보강, 알림톡/SMS 미구현 |
| **기준 B: 글로벌 종합 OTA (Trip.com급 100%)** | **약 82%** | **미달 (구조·기능 5건 추가)** | 기준 A + **i18n 0/73 페이지 적용(실질 한국어 단일)**, **PG 택1(Toss+Stripe 동시 불가)**, **복합 장바구니 부재**, **항공 재발권·일정변경 부재**, **공급사 실프로토콜(NDC XML/도매 실API) 미구현** |

---

## 2. 2026-11-22 감사 대비 개선 실측 (Stage 1 검증 결과)

2026-11-22 감사에서 발견된 P0 3건 및 P1 주요 항목의 실운영 반영 여부를 오늘(2026-11-24) 직접 재실측해 확인했다.

| 2026-11-22 결함 | 2026-11-24 직접 실측 결과 | 판정 |
|---|---|:-:|
| **P0-1** `ota-user` SSR 목록 6종 503·상세 3종 404 | `ota-hub` Service Binding 적용 후 **25/25 전 라우트 HTTP 200** (`/hotels/list` 93KB, `/hotels/detail/htl_seoul_01` 38.5KB 등 실데이터 SSR 확인) | **해소 확인** |
| **P0-2** 주간 D1 백업 FTS5 실패 | `scripts/backup-d1.js` 스키마+행 덤프 전환 후 `Weekly D1 Backup` (`run 45324043667`) `backup`·`restore-verify` **모두 GREEN** (93/93 테이블·820행) | **해소 확인** |
| **P0-3** 운영 DB 더미 제휴 시크릿 활성 | `ota_production` 원격 쿼리 확인: `agoda`/`klook`/`myrealtrip`/`trip` 전부 `is_active = 0`, `secret_key = ''` | **해소 확인** |
| **P1-1** 3포털 보안 헤더 0개 | `ota-user`, `ota-admin`, `ota-partner` 모두 4종 헤더(HSTS·nosniff·SAMEORIGIN·Referrer-Policy) 송출 확인 (**단, CSP는 미적용 → §4-2**) | **부분 해소** |
| **P1-2** 호텔 가짜 도쿄 좌표·수용량 NULL | 14/14 호텔 도시별 실좌표 반영, `activities`/`transfers`/`packages` NULL 수용량 **전부 0건** | **해소 확인** |
| **P1-3** QA 잔재 파트너 활성 | `verify_*`/`applicant_*` 4건 + 플레이스홀더 1건 모두 `is_active = 0` 전환 확인 | **해소 확인** |
| **P1-4** `travel_agency_license_no` 정책 충돌 | `worker/src/routes/admin.ts` ACTIVE 게이트에서 제외, `EntitiesView.vue` `(선택)` 표기로 통일 확인 | **해소 확인** |
| **P1-5** 임시 파일·리포트 비밀번호 인용·High 취약점 | `temp_master_prompt.md` 삭제·리포트 redact 완료. **단, 의존성 High 취약점은 미해소 → §4-3** | **부분 해소** |

---

## 3. 자동화 게이트 및 실운영 건전성 실측 (2026-11-24)

### 3-1. 코드베이스 및 자동화 게이트

| 게이트 | 실행 결과 | 비고 |
|---|---|---|
| Worker TypeScript (`npm run typecheck`) | **PASS (exit 0)** | `worker/src` 85파일 · 16,739 LOC |
| Admin / Partner TypeScript (`tsc --noEmit`) | **PASS (exit 0)** | Admin 45파일(23뷰) · Partner 28파일(17뷰) — **단, CI 미연동** |
| User Portal TypeScript (`frontend-user`) | **미구성 (NO SCRIPT)** | 159파일(73페이지 · 34,629 LOC) 타입체크 스크립트·CI 단계 없음 |
| 유닛 테스트 (`npm test`) | **PASS (344 pass / 0 fail / 5 skip)** | 총 349건, 13.4s |
| Go 테스트 (`cd backend && go test ./...`) | **PASS (exit 0)** | 오프라인 레퍼럴 유틸 3파일(242 LOC) |
| 브랜딩 가드 (`npm run check:branding`) | **PASS (0 violations)** | 555파일 스캔, `getfortrip` 100% 준수 |
| CI/CD (`deploy.yml`) | **GREEN** | `run 45321459120`·`45324673309` 성공 (`fast`+`e2e`+`deploy`), 최신 `45328066335` `fast` 통과·`e2e` 진행 중 |
| D1 백업 + 복원검증 (`db-backup.yml`) | **GREEN** | `run 45324043667` (`backup` + `restore-verify` 모두 성공) |

### 3-2. 실운영 D1 (`ota_production`) 상태 실측

- **마이그레이션:** 57/57 적용 완료 (`0057_indexnow_queue.sql`)
- **검색 인덱스:** `catalog_fts` 63행 == 7개 도메인 상품 합계 63행 (정합)
- **운영 크론 (`cron_heartbeats`):** `maintenance`, `rollup_daily`, `review_digest` 3종 모두 `2026-11-24T04:45:52Z`, `ok = 1`, `error = null`
- **장애·데드레터:** `incidents(OPEN) = 0`, `job_queue(DEAD) = 0`
- **수용량 무결성:** `activities` / `transfers` / `packages`의 `daily_capacity IS NULL` 전부 `0`
- **잔여 경미 위생:** `affiliate_partners_config.travelpayouts` (`is_active = 0`)에 플레이스홀더 문자열 `SET_VIA_WRANGLER_D1_SECRET_TRAVELPAYOUTS` 잔존 (`''` 정리 권장)

---

## 4. 개발 영역 잔여 갭 전수 목록 (사람·외부 계약 없이 코드로 해결 가능)

아래 10건은 **외부 계약이나 사업자 등록을 기다리지 않고 개발팀이 코드·설정으로 해결할 수 있는 항목**이다.

### 4-1. 보안·품질·CI 갭 (상용 오픈 전 해결 권장 — 5건)

#### [GAP-01] 글로벌 다국어(i18n) 껍데기 상태 — `0 / 73` 페이지 적용 (심각도: **High**, 글로벌 기준)
- **증거:** [`frontend-user/nuxt.config.ts`](../frontend-user/nuxt.config.ts)(L70–87)에 `@nuxtjs/i18n`으로 `ko`, `en`, `ja`, `zh` 4개 로케일을 선언하고 `/en/...`, `/ja/...`, `/zh/...` URL 프리픽스를 노출한다.
- 그러나 실제 코드 검사 결과:
  - `frontend-user/pages/**/*.vue` **73개 페이지 중 `$t()`를 호출하는 페이지: `0개`**
  - `frontend-user/i18n/locales/{ko,en,ja,zh}.json` 파일 크기 각 764~892바이트(최상위 3섹션, 약 22개 키뿐)
- **영향:** 외국인 사용자가 `/en/hotels`나 `/ja/flights`로 진입해도 검색·상세·체크아웃·약관·에러 메시지가 모두 한국어로 노출된다.
- **조치 선택:** ① 글로벌 오픈이 목표라면 73개 페이지·컴포넌트·API 에러 코드 전체 i18n 키화 및 4개 언어 번역 완료, ② 국내 우선 오픈이라면 `en`/`ja`/`zh` 로케일 라우트 및 hreflang을 임시 비활성화하여 거짓 다국어 SEO 페널티 차단.

#### [GAP-02] 프론트엔드 3포털 CSP(`Content-Security-Policy`) 헤더 누락 (심각도: **High**)
- **증거:** 2026-11-24 실측에서 `ota-hub` API만 CSP를 송출하고, `ota-user`, `ota-admin`, `ota-partner` 3개 워커는 CSP 헤더가 아예 없다.
- [`frontend-admin/public/_headers`](../frontend-admin/public/_headers)와 [`frontend-user/nuxt.config.ts`](../frontend-user/nuxt.config.ts) 주석에는 `default-src 'none'`이 SPA/SSR을 깨뜨려 제외했다고 적혀 있으나, 실제 SPA/SSR 호환 정책(`default-src 'self'; script-src 'self' ...; img-src 'self' https: data:; connect-src 'self' https://ota-hub... https://api.tosspayments.com https://api.stripe.com; frame-ancestors 'self'`)을 구성하지 않고 방치한 상태다.
- **영향:** 사용자 입력(리뷰·모먼트·문의·URL 수집 상품 설명)이나 서드파티 스크립트에서 XSS 발생 시 브라우저 레벨 차단 방어막이 없다.

#### [GAP-03] 프로덕션 의존성 High 보안 취약점 미패치 — 4개 패키지 전원 (심각도: **High**)
- **증거 (`npm audit --omit=dev`, 2026-11-24 실측 — 전부 `fixAvailable: true`):**
  - 루트: **3 High** (`node-forge`, `undici`, `vite` / 총 20건)
  - `frontend-user`: **3 High** (`node-forge`, `postcss`, `undici` / 총 18건)
  - `frontend-admin`: **4 High** (`@vue/server-renderer`, `postcss`, `vite`, `vue` / 총 6건)
  - `frontend-partner`: **1 High** (`vite` / 총 2건)
- **영향:** CI 게이트가 `--audit-level=critical`만 차단하도록 설정돼 녹색으로 통과하지만, `undici`(DoS)·`vue`/`@vue/server-renderer`·`vite`의 High 취약점이 패치 가능한 상태로 방치되어 있다.

#### [GAP-04] CI에 프론트엔드 3포털 TypeScript 타입체크 누락 (`frontend-user` 스크립트 부재) (심각도: **Medium**)
- **증거:**
  - `.github/workflows/deploy.yml`의 `fast` 잡은 `tsc -p worker/tsconfig.json`만 실행한다.
  - `frontend-admin`·`frontend-partner`는 `tsconfig.json`이 있으나 CI에서 검사하지 않는다.
  - **`frontend-user/package.json`에는 `typecheck` 스크립트 자체가 없어**, 전체 코드베이스의 57%(34,629 LOC)를 차지하는 Nuxt 4 프론트엔드가 타입 검증 없이 빌드·배포된다.

#### [GAP-05] Toss 웹훅 시크릿 검증 하드닝 미비 (심각도: **Medium**)
- **증거:** [`worker/src/routes/webhooks.ts`](../worker/src/routes/webhooks.ts)(L39):
  ```ts
  if (env.TOSS_WEBHOOK_SECRET && url.searchParams.get("key") !== env.TOSS_WEBHOOK_SECRET)
  ```
- **문제점 2가지:**
  1. 일반 문자열 비교(`!==`)를 사용해 상수시간 비교(`timingSafeEqual`)가 아니다.
  2. 프로덕션에서 `TOSS_WEBHOOK_SECRET` 미등록 시 거부(Fail-Closed)하지 않고 무인증 통과한다(PG 재조회로 위조 결제는 막히지만, 외부 호출자가 PG API 조회 할당량과 DB 로그를 소모시킬 수 있음 — Stripe 웹훅은 미등록 시 프로덕션 거부로 Fail-Closed 구현됨).

---

### 4-2. 실제 종합 OTA 비즈니스 기능·아키텍처 갭 (5건)

#### [GAP-06] 단일 PG 택1 구조 — 국내(Toss) + 해외(Stripe) 동시 결제 불가 (심각도: **High**, 글로벌 기준)
- **증거:** [`worker/src/payments/provider.ts`](../worker/src/payments/provider.ts)의 `getPaymentProvider(env)`는 `env.PAYMENT_PROVIDER` 단일 문자열(`"toss"` | `"stripe"`)로 1개 PG만 활성화한다.
- **영향:** 한국 카드·카카오페이·토스페이(Toss)와 해외 비자/마스터·다통화 3DS(Stripe)를 한 사이트에서 동시 제공할 수 없다. (국내 KRW 단독 오픈 시에는 블로커 아님.)

#### [GAP-07] 복합 장바구니(Multi-Item / Multi-Vendor Cart) 체크아웃 미구현 (심각도: **Medium**)
- **증거:** 견적(`quotes`)·예약(`bookings`)·결제(`payments`)가 단일 도메인·단일 상품 1:1 구조로 동작한다.
- **영향:** 고객이 "항공 + 호텔 + 공항 픽업" 또는 "1P 상품 + 3P 파트너 상품"을 한 번에 결제하고 내부에서 벤더별 분할 정산하는 통합 장바구니 흐름은 구현되어 있지 않다(건별 개별 결제만 가능).

#### [GAP-08] 항공 발권 후 예약 변경·재발권(Reissue)·항공사 스케줄 변동 미구현 (심각도: **Medium**)
- **증거:** 편도·왕복 견적, 여권 암호화, PNR·발권 상태 머신, 취소·부분/전액 환불까지는 완성되어 있으나, 발권 완료(`TICKETED`) 이후 날짜/여정 변경, 운임 차액 추가 결제(Reissue), 항공사 비자발적 스케줄 변경(Involuntary Change) 워크플로우 및 UI가 없다.

#### [GAP-09] 국내 핵심 알림 채널(카카오 알림톡 / SMS) 미구현 (심각도: **Medium**)
- **증거:** [`worker/src/services/email-service.ts`](../worker/src/services/email-service.ts)는 Resend 기반 이메일 발송만 지원한다 (`HYBRID_OTA_WORK_ORDER_20261120.md` §3에서도 미구축 확인).
- **영향:** 국내 여행 서비스에서 예약 확정·바우처 링크·항공 결항/지연·체크인 임박 알림의 주력 채널인 카카오 알림톡 및 SMS 폴백 어댑터가 없다.

#### [GAP-10] 파트너 정산 자동 송금(Payout API) 미연동 + 운영 검증(`verify-production.js`) 커버리지 공백 (심각도: **Low~Medium**)
- **정산 송금:** 정산 원장·배치·명세서·회수(`settlement_recoveries`)·수동 지급 확정(`SETTLED`)은 완비됐으나, 실제 은행/PG 지급대행 API(펌뱅킹·Toss Payout) 호출 없이 운영자가 수동 이체 후 상태를 변경하는 방식이다.
- **운영 검증 커버리지:** `scripts/verify-production.js` 47개 시나리오가 TG-11~TG-21 신규 표면(잡 큐, OTel/SLO, Stripe 웹훅, FDS, 추천, 레플리카, 마크업, CS봇) 및 Stage 1 회귀 대상(4포털 보안 헤더, `ota-user` 목록/상세 200 SSR)을 자동 검증하지 않는다.
- **실공급사 공식 프로토콜 어댑터 (계약 연동 영역):**
  - NDC/GDS([`live-adapter.ts`](../worker/src/suppliers/live-adapter.ts))는 JSON-over-HTTP 자체 스텁 계약(공식 항공사 NDC XML 프로파일 및 여권 DOCS 전송 미구현).
  - 도매 eSIM/바우처([`wholesale-esim.ts`](../worker/src/suppliers/wholesale-esim.ts), [`wholesale-voucher.ts`](../worker/src/suppliers/wholesale-voucher.ts))는 공통 추상 계약 형태(실제 Airalo/Roamify/Klook/Tiqets 벤더별 필드 매핑은 계약·공식 문서 확보 후 어댑터 구현 필요).
  - [`external-adapters.ts`](../worker/src/suppliers/external-adapters.ts) 6개 공급사는 `BLOCKED_PENDING_CONTRACT` 명세 객체.
  - *(공정한 평가: 계약 전 공식 API 스펙이 비공개인 업계 특성상, 서킷브레이커·500ms 프리체크아웃 가격검증·멱등성·아티팩트 검증·사가 보상까지 선행 구축한 설계 완성도는 높다. 다만 실계약 직후 벤더별 와이어 어댑터 코딩 작업이 추가로 수반된다는 점을 명확히 인지해야 한다.)*

---

## 5. 이미 상용급(95~100%)으로 완성된 코드 영역 (강점)

다음 코어 시스템들은 실제 테스트·운영 검증을 통해 견고하게 구현되었음이 확인되었다.

| 영역 | 구현·검증 상태 | 핵심 근거 |
|---|---|---|
| **결제·원장·환불 안전성 (Fail-Closed)** | **상용급** | 서버 견적 강제, PG 미설정 시 자동 비활성, 환불 단일화 유니크 인덱스(`0039`), 부분/전액 환불, 이중 원장 대사(`/admin/reconciliation`), 사가 보상 잡 큐(`0046`), Toss/Stripe 웹훅 화해, Stripe 3DS·FDS·차지백 |
| **예약 상태 머신·재고·가격 방어** | **상용급** | CAS 버전 가드, 미계약 공급사 409 차단, 재고 홀딩·만료 크론, 하한가 보호, 멱등성 키 강제, 슬롯 클레임(`0042`) |
| **하이브리드 판매 라우팅 (1P·3P·위탁·제휴)** | **상용급** | `DIRECT_PG` / `AFFILIATE_REDIRECT` / `HYBRID_FILTERED` 전략 패턴, HMAC Sub-ID, 3층 자체결제 차단, 도매 500ms 프리체크아웃 검증 |
| **인증·권한·PII 보안 코어** | **상용급** | PBKDF2 100k, HttpOnly 세션 쿠키(localStorage 미저장), IDOR 방어, 세션 폐기(`0024`), TOTP MFA 로그인·콘솔 UI(`0041`), AES-GCM 여권 암호화, OAuth 2.0 3사(Kakao/Google/Naver) 실엔드포인트 구현 |
| **3포털 분리 + SSR/ISR + SEO** | **상용급 (한국어 기준)** | `ota-user`(73p, Service Binding SSR 25/25 200) · `ota-admin`(23뷰) · `ota-partner`(17뷰), `/sitemap-index.xml`, `/llms.txt`, `/llms-full.txt`, IndexNow 큐, FTS5 검색 |
| **백업·DR·관측·CI/CD** | **상용급** | FTS5 호환 D1 백업 + 자동 복원 무결성 검증(`run 45324043667` GREEN), 3종 크론 하트비트 정상, OTel·SLO·`/status` 장애 페이지, 안전한 post-commit(기본 비배포), CI 멀티 E2E(212+3+4+3) |

---

## 6. 사람이 반드시 처리해야 하는 항목 (코드 밖 — 참고 분리)

개발팀이 100% 코드를 완성해도, 아래 7개 외부/운영 작업이 끝나기 전에는 실제 매출이 발생할 수 없다.

1. **결제 PG 실가맹 계약 및 키 등록:** `TOSS_SECRET_KEY`, `TOSS_CLIENT_KEY`, `TOSS_WEBHOOK_SECRET` (또는 `STRIPE_*`) 등록 후 테스트→라이브 소액 실결제 대사. (현재 `ota-hub` 등록 시크릿은 `JWT_SECRET`, `AFFILIATE_HMAC_SECRET` 2개뿐.)
2. **실공급사·도매·제휴·3P 파트너 계약 및 실상품·실사진 확보:** 현재 17/17 공급사 `NOT_INTEGRATED`, 판매 가능 상품 **0 / 72건**, 도매 SKU **0건**, 호텔 14건 `thumbnail_url = null`.
3. **실사업자 정보 입력 및 활성화:** `business_entities.ent_primary` (`DRAFT` → `ACTIVE`) + 빌드 환경변수 `NUXT_PUBLIC_COMPANY_*` 주입(푸터 사업자·CPO 정보 실값 노출).
4. **커스텀 도메인 DNS 및 Cloudflare Routes 연결:** `getfortrip.com` (현재 NXDOMAIN — `sitemap.xml`·canonical·이메일 링크가 미연결 도메인 지목), `admin.getfortrip.com`, `partner.getfortrip.com`.
5. **보안·운영 시크릿 및 플랜:** `PII_ENC_KEY`, `RESEND_API_KEY`(+ `EMAIL_FROM` SPF/DKIM), `SENTRY_DSN`(Worker + GitHub Secret), OAuth 앱 키, `NTS_API_KEY`, Cloudflare Workers 유료 플랜 확인, **어드민 2명 TOTP MFA 직접 등록** (현재 `admin_mfa_secrets = 0`).
6. **법무 검토:** 이용약관 v2.1 · 개인정보처리방침 · 파트너 약관 v1.0 변호사 검토 및 파트너 동의 저장 정책 확정.
7. **최종 운영 검증 완주:** `TEST_ADMIN_PASSWORD`로 `scripts/verify-production.js` 47/47 (+ T41 실정산) 실행 및 2026-11-14 사고 keep 종결 서명.

---

## 7. "개발 영역 100%" 달성을 위한 최단 실행 계획

### Phase A — 국내 상용화 100% 마감 (우선순위 높음, 예상 1~2일)
1. **[GAP-02]** `ota-user`, `ota-admin`, `ota-partner` 3포털에 SPA/SSR 호환 `Content-Security-Policy` 헤더 추가 및 브라우저 콘솔 위반 0건 확인.
2. **[GAP-03]** 4개 `package.json`의 High 취약점(`vue`, `@vue/server-renderer`, `vite`, `undici`, `node-forge`, `postcss`) 패치 후 전체 빌드·유닛·E2E 회귀 검증.
3. **[GAP-04]** `frontend-user`에 `nuxi typecheck` 스크립트 추가 + CI `fast` 잡에 3포털(`user`/`admin`/`partner`) 타입체크 편입.
4. **[GAP-05]** `webhooks.ts` Toss 시크릿 검증을 상수시간 비교로 교체하고 프로덕션 `TOSS_WEBHOOK_SECRET` 미설정 시 정책 명확화(또는 Fail-Closed).
5. **[GAP-01 단기]** 국내 우선 오픈이라면 비번역 `/en`, `/ja`, `/zh` 라우트 노출을 일시 차단해 한국어 혼재 노출 방지 (글로벌 동시 오픈 시 Phase B에서 전 페이지 번역).
6. **[GAP-10]** `scripts/verify-production.js`에 4포털 보안 헤더(CSP 포함)·`ota-user` SSR 목록/상세 200·신규 TG 표면 읽기전용 스모크 추가 + 운영 D1 `travelpayouts` 플레이스홀더 문자열 `''` 정리.

### Phase B — 글로벌 종합 OTA 100% 확장 (사업 일정에 맞춰 진행)
1. **[GAP-01 전체]** `frontend-user` 73개 페이지 전체 i18n 키화 + 4개 언어(`ko`/`en`/`ja`/`zh`) 완전 번역.
2. **[GAP-06]** Toss + Stripe 동시 활성 다중 PG 라우터(통화·결제수단별 분기).
3. **[GAP-09]** 카카오 알림톡 + SMS 발송 어댑터 추가 (`notification_outbox` 채널 확장).
4. **[GAP-07·08]** 복합 장바구니 체크아웃 및 항공 발권 후 변경·재발권 워크플로우.
5. **[실계약 연동]** 계약 확정된 공급사별 실 API 와이어 어댑터(NDC XML / Airalo / Klook / 베드뱅크 등) 및 지급대행 Payout API 연동.
