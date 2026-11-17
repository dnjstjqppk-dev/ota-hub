# TG-15 ISR 전환 — 계획·수용기준 (2026-11-16)

> 백로그: [TG-15](TRIP_GRADE_BACKLOG.md) — 카탈로그 온디맨드 렌더 + 엣지 캐시.
> 전면 프리렌더 폐지. 수용: 카탈로그 10만 행 가정 부하에서 p95 기준 충족.
> 의존 TG-09(완료).
> 정찰: 단일 워커 `ota-hub`가 API + 3포털을 ASSETS로 서빙
> (`wrangler.jsonc:25`, `run_worker_first`), 사용자 포털은 Nuxt static preset
> + 전체 프리렌더(`nuxt.config.ts:25`, `scripts/build-all.js:49`).

## 1. 기판 결정: 사용자 포털 분리 + Nitro ISR

- `frontend-user`를 `static` → `cloudflare` preset으로 전환, 카탈로그 경로에
  `routeRules: { isr: 3600 }`(목록·상세 7도메인 + deals·trip-best).
  마케팅·약관 등 정적 페이지만 prerender 유지 — "전면 프리렌더 폐지"는
  카탈로그(상품 의존 경로) 대상이며 빌드 산출물이 상품 스냅샷에 묶이지 않게 한다.
- 신규 워커 `ota-user`(SSR) + 기존 `ota-hub`(API + admin/partner SPA).
  라우팅: apex → ota-user, `/api/*` → ota-hub (Cloudflare Routes),
  admin/partner 호스트는 ota-hub 유지. 로컬은 `:8787` SSR + `:8799` API.
- 근거: ISR은 서버 preset에서만 동작(static preset 불가). ASSETS 단일 워커에
  SSR를 우회 접목(워커 템플릿 중복 렌더)하면 TG-01이 제거한 이중 구현이
  부활하므로 분리한다.
- API 엣지 캐시 병행: 카탈로그 GET에 `Cache-Control: s-maxage=300,
  stale-while-revalidate=3600` + `GET /api/v1/admin/cache/purge`(태그 purge,
  E2E `tg15b`). 상품 변경(어드민 CRUD·LIVE 전환) 시 태그 자동 무효화.

## 2. 범위 (v1)

1. Nuxt `cloudflare` preset + ISR routeRules + `ota-user` wrangler 설정·배포 단계.
2. `build-all.js`·`build-and-deploy.js`·CI 파이프라인 2워커 대응
   (스모크는 apex SSR 200 + `/api/v1/health` 200 둘 다).
3. API 카탈로그 캐시 헤더 + purge API + 변경 시 무효화 배관.
4. 부하 수용: 10만 행 가정 — 격리 DB에 합성 카탈로그 10만 행 시드 후
   `scripts/load-baseline.mjs` ISR 모드(콜드 MISS p95 + 웜 HIT p95) 측정,
   기준 `docs/SLO.md`(TG-13) p95 이하 + HIT율 기록. 명시: 합성 단일 isolate
   측정이며 엣지 분산 캐시 효과는 스테이징에서 재측정.
5. 문서: ISR 무효화 규칙·폴백(SSR 장애 시 직전 캐시 서빙) 런북.

## 3. 비목표 (명시)

- admin/partner 포털 SSR 없음 — SPA 유지(운영 콘솔은 SEO 불필요).
- 카탈로그 외 경로(체크아웃·예약·마이)는 CSR 유지(기존 routeRules 존중).
- 엣지 이미지 최적화(Polish/Resizing) 없음 — 후속.
- 기존 SEO 스냅샷(`gen-seo-snapshot.mjs`)은 ISR 전환 후 삭제 — 단 sitemap은
  온디맨드 생성(`seo.ts` 확장)으로 대체하고 URL 커버리지 E2E 유지.

## 4. 수용기준 → 작업 → 증거

| # | 수용기준 | 작업 | 증거 |
|---|---|---|---|
| A1 | 카탈로그 온디맨드 렌더 (백로그 수용) | preset 전환 + ISR 룰 + ota-user | 신규 상품 등록 후 크롤 없이 상세 200 + HTML에 상품명 |
| A2 | p95 기준 (백로그 수용) | 10만 행 합성 시드 + load-baseline ISR 모드 | MISS/HIT p95 수치 + SLO 판정 기록 |
| A3 | 프리렌더 탈피 | prerender routes에서 상품 경로 제거 | 빌드 산출물에 상품 스냅샷 없음 + 빌드 시간 단축 기록 |
| A4 | 변경 즉시 반영 | purge 배관 | 상품 수정→상세 HTML 반영 E2E tg15a (SWR 내) |
| A5 | 장애時 직전 캐시 | fetch 실패 시 stale 서빙 | 레드드릴(§5-2) |
| A6 | 기존 스위트 무회귀 | API 계약 불변 | 격리 E2E 전수 녹색 + 3포털 빌드 |

## 5. 레드드릴

1. purge 없이 상품가 변경 → 캐시 TTL 내 구가격 서빙 확인 후 purge → 신가격 (E2E tg15a).
2. API(DB) 정지 상태에서 웜 캐시 상세 조회 → stale 200 + `x-cache: STALE` (표적).
3. 존재하지 않는 상품 ISR → 404 캐싱(짧은 TTL) + 크롤러 무한 증식 방지 (유닛).

## 6. 게이트·잔여

- 게이트: 격리 E2E 전수 + ISR 부하 측정 + 유닛 + `tsc` + 브랜딩 + 빌드 + 감사.
  (이번 세션 규율: 커밋·푸시는 전 작업 종료 후 1회.)
- 잔여(TG-15 후속으로 백로그에 기록): 이미지 최적화, 스테이징 엣지 캐시율 재측정,
  `gen-seo-snapshot.mjs` 삭제 잔재 확인, apex 라우트 실도메인 전환(GO_LIVE 4단계와 연계).
