# TG-16 검색 부하 측정 (2026-11-16)

> 합성 단일 isolate 측정이다. 엣지 분산 효과는 스테이징에서 재측정한다.

## 조건

- DB: fresh + 시드 + `seed-catalog-bulk.mjs` 100,000 hotels + FTS 트리거 동기화.
- 프로브: `load-search.mjs` (텍스트·패싯·가격·지리·페이징 8종 혼합), VUS 5, 30초,
  catalog_read 백스톱(600/60) 아래 페이싱(~9rps).

## 결과

- `requests=241 ok=241 err=0 rps=8 p50=41.1ms p95=143.3ms p99=705.4ms`
- JSON: `{"vus":5,"seconds":30,"requests":241,"ok":241,"err":0,"rps":8,"p50_ms":41.1,"p95_ms":143.3,"p99_ms":705.4,"status":{"200":241}}`
- 판정: SLO p95 1500ms 이하 → **통과** (여유 10x).

## 참고: 플러드 실행

- 페이싱 없이 5VU 전속 실행 시 `requests=1755 ok=600 err=1155 (429)` —
  백스톱이 버티고 500은 0건. p95 207ms(429 혼합). TG-04 설계대로 동작.
