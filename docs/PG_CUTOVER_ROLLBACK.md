# Postgres 절체·롤백 런북 (TG-09)

> 상태: 로컬 증명 완료 (2026-11-14, E2E 189/189 on PG16). 매니지드 프로비저닝은
> 공급자 선정 후 사용자 단계. 운영 절체는 이중 쓰기 + 플래그 전환으로만 수행.

## 1. 로컬 증명 구성 (재현 절차)

```powershell
docker run -d --name gft-pg -e POSTGRES_PASSWORD=LocalPg2026!x -e POSTGRES_DB=ota_pg -p 127.0.0.1:55433:5432 postgres:16-alpine
node scripts/pg-harness/dump-schema.mjs        # D1 sqlite_master 덤프 (바이트 보존)
node scripts/pg-harness/port-schema.mjs        # -> scripts/pg-harness/schema.sql
node scripts/pg-harness/extract-dml.mjs        # -> scripts/pg-harness/seed-data.sql
# docker cp + psql -f 로 schema -> seed-data -> catalog -> transfers 순서 적용
# (PowerShell 파이프 금지: 한글 바이트가 깨진다. -f 직결만 사용)
node scripts/pg-harness/seed-e2e.mjs 'LocalAdmin2026!x'
node scripts/pg-harness/server.mjs 8798
$env:BASE='http://127.0.0.1:8798'; $env:E2E_PG_URL='postgres://...'; $env:ADMIN_PASSWORD='...'; npm run test:e2e
```

포트 규칙: 이 머신은 다프로젝트 공유 호스트(subscout 5433 등 사용 중).
반드시 빈 포트 확인 후 `-p 127.0.0.1:<port>:5432` (로컬 전용 바인드).

## 2. 증명 과정에서 발견·수정한 것

- 이식성 SQL 수정 9건(양쪽 동작): HAVING 별칭 5, ROUND 2, MAX→CASE 1,
  쌍따옴표 문자열 1, CAST(? AS TEXT) 1, date() JS 이식 4.
- 에러 매핑 PG 대응: runBatch CHECK명 2종 + throwOnRefundConflict unique 1종.
- 재고 경쟁: PG 자문락 + D1-shim batch 원자화 (D1 batch 원자성과 동일 보장).
- E2E 테스트: EXPLAIN 분기·외래키 대소문자·#103 버킷 청소 (D1에서도 유효한 위생).
- 스키마: FK 31건 강제 유지 + pragma_foreign_key_check 뷰 에뮬레이션.

## 3. 운영 절체 계획 (미실행 — 사용자 결정 필요)

1. 매니지드 PG 선정 (Neon/Supabase/AlloyDB) + 읽기 복제본 + 풀러 + PITR.
2. 스키마 적용 후 이중 쓰기 개시 (D1 + PG), 백필, 드리프트 감시.
3. 읽기 절체 (테이블군 단위: §4 설계서 순서) → 매 단계 E2E 녹색 확인.
4. D1 쓰기 중단 → 읽기 전용 보관 → 삭제 (보관 기간 합의 후).

## 4. 롤백 절차

- 이중 쓰기 기간: 읽기 플래그를 D1으로 되돌리면 즉시 복귀 (RTO 수 분).
- 쓰기 절체 후: PG→D1 역방향 백필 후 전환 (사전 리허설 필수).
- 검증 쿼리 (양쪽 DB 동일 결과여야 함):
  - `SELECT COUNT(*) FROM bookings WHERE status NOT IN ('CANCELLED','REFUNDED')`
  - `SELECT COALESCE(SUM(amount_minor),0) FROM ledger_entries WHERE direction='DEBIT'`
  - `SELECT COUNT(*) FROM pragma_foreign_key_check` (PG는 뷰, D1은 프라그마)
- 롤백 판단 기준: E2E 적색, 드리프트 > 0 (2주기 연속), p95 2배 이상.

## 5. 잔여 리스크

- 하네스 풀 max:1 + 세션 자문락은 증명용. 운영은 트랜잭션 설계 필요
  (xact 락 + Hyperdrive/풀러) — TG-09 후속으로 분리.
- D1→PG 단방향이었음: 역방향 동기화는 미구현 (롤백 시 백필로 충당).
