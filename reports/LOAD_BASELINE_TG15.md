# TG-15 ISR 부하·스모크 측정 (2026-11-16)

> 합성 단일 isolate 측정이다. 엣지 분산 캐시 효과·플릿 p95는 스테이징에서
> 재측정한다 (TG-15 잔여).

## 1. API 카탈로그 p95 (10만 행)

- DB: fresh + 시드 + `seed-catalog-bulk.mjs` 100,000 hotels (`htl_load_*`).
- 프로브: `load-baseline.mjs` (hotel search → detail → 10회당 quote), VUS 5, 30초.
- 결과: `requests=430 ok=430 err=0 rps=14.2 p50=338.6ms p95=566.3ms p99=630.8ms`
- JSON: `{"vus":5,"seconds":30,"requests":430,"ok":430,"err":0,"rps":14.2,"p50_ms":338.6,"p95_ms":566.3,"p99_ms":630.8,"status":{"200":410,"201":20}}`
- 판정: SLO p95 1500ms 이하 → **통과** (여유 2.6x).

## 2. ISR 스모크 (ota-user :8786 + hub :8798)

- 신규 상품 `htl_isr_smoke_01` 어드민 등록 후 크롤·재빌드 없이
  `GET /hotels/detail/htl_isr_smoke_01` → **200, 34,084B, 0.22s**,
  HTML에 상품명·JSON-LD 포함 (A1).
- 재요청 → **200, 0.12s** (로컬 웜).
- `GET /hotels/list?city=서울` → **200, 454,001B, 0.11s**,
  합성 100건 SSR 렌더 확인.
- 미존재 상품 → **404, 0.10s** (에러 셸 캐싱 없음).
- 프리렌더 산출물: `/help/moments/rewards` + `/`만 — 상품 HTML 없음 (A3).

## 3. 빌드

- `nuxt build` (cloudflare-module): 27~51초. 구 static generate(프리렌더
  크롤) 대비 nitro 단계 단축 + 상품 스냅샷 의존 제거.
- `cloudflare` 프리셋은 서비스워커 형식을 내보내 wrangler 4가 거부 —
  `cloudflare-module`로 확정 (본 세션 관측).
- SSR API 베이스는 `NUXT_API_BASE_SERVER` 관례명을 써야 런타임 오버라이드가
  동작한다 (`NUXT_API_BASE`는 매핑 안 됨 — 본 세션 스모크에서 적발·수정).
