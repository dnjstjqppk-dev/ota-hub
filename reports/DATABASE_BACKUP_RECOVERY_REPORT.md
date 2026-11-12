# 데이터베이스 백업 · 복구(DR) 보고서 — Cloudflare D1

**문서 번호:** OPS-DB-DR-20261018-01
**개정:** 2026-11-12 전면 재작성 (P2f #115 — 구판의 8테이블 목록·미검증 지연 수치 삭제)
**데이터베이스:** `ota_production` (`d36231d8-4bfb-42e1-ae51-a019723e5db0`)
**엔진:** Cloudflare D1 (SQLite)

---

## 1. 인벤토리 (측정값, 2026-11-12)

- 사용자 테이블 70개 (`sqlite_master` 실측, `_cf_*`·`d1_*`·`sqlite_*` 제외).
- 스키마는 `worker/migrations/*.sql`이 유일한 진실 공급원(0042까지)이며,
  테이블 수는 매 백업 실행 때 덤프와 대조된다 (`scripts/backup-d1.js`).
- 인벤토리 목록을 본문에 하드코딩하지 않는다 — 드리프트의 원인이었다.

## 2. 백업 계층

1. **D1 Time Travel (1차, 복원의 기본 경로).** 특정 시점으로 복원·포크·복사:
   `npx wrangler d1 time-travel restore ota_production ...` (문법은
   `wrangler d1 time-travel --help` 참조). 보관 기간·요금은 Cloudflare
   플랜/대시보드 기준 — 본 문서는 수치를 단정하지 않는다.
2. **SQL 덤프 (2차, 오프사이트).** `node scripts/backup-d1.js`가 타임스탬프
   덤프를 만들고 즉시 검증한다(비어 있지 않음 + CREATE TABLE 수 대조 +
   users/bookings/payments/ledger_entries 행수 스팟체크). 실패하면 exit 1.
   - 정기: CI 스케줄 매주 일요일 03:00 KST (`.github/workflows/db-backup.yml`),
     아티팩트 30일 보관.
   - 수동: 배포·마이그레이션 같은 위험 작업 전에 온디맨드 실행.
   - 장기 보관은 운영자가 덤프를 별도 스토리지에 복사 (후속 과제).

## 3. RPO / RTO (정직한 수치)

- RPO: 마지막 성공 덤프 시점(정기 주 1회 + 수동 수시) 또는 Time Travel 지정
  시점. 자동 연속 백업·PITR SLA는 주장하지 않는다.
- RTO: 수동 복원 소요 (덤프 검증 + 복원 + 카운트 대조, 추산 1시간 이내).
  자동 장애조치·읽기 복제본은 없다 (D1 단일 프라이머리).

## 4. 복원 절차

### 4.1 Time Travel 포크/복원 (운영 기본 경로, 미실행)

```bash
# 무엇이 가능한지 먼저 확인 (파괴적이지 않음)
npx wrangler d1 time-travel info ota_production
# 포크로 먼저 검증한 뒤 (권장), 실제 복원 수행
# npx wrangler d1 time-travel restore ota_production --timestamp <ISO8601>
```

주의: 운영 접근 권한이 필요한 실제 포크 훈련은 아직 수행하지 못했다
(인증 만료). 접근 복구 후 최초 1회 실행하고 결과를 §6에 기록한다.

### 4.2 SQL 덤프 복원 (검증됨 — 아래 훈련 로그)

`wrangler d1 execute --file`로는 복원할 수 없다: 덤프의 CREATE TABLE 순서와
miniflare의 즉시 FK 검사가 충돌한다 (`no such table` 실패 확인). 실제
SQLite 엔진을 쓴다:

```bash
sqlite3 scratch.db ".read ota_production-YYYYMMDDHHMMSS.sql"
# 대조: 테이블 수 + 핵심 행수 (훈련 로그 참조)
```

## 5. 훈련 일정

- 분기 1회: 최신 덤프를 스크래치에 복원 → 카운트 대조 → 결과를 §6에 기록.
- Time Travel 포크 훈련: 운영 접근 복구 후 최초 1회 (미실시).

## 6. 훈련 로그

- **2026-11-12 (로컬, P2f #115):** `node scripts/backup-d1.js --local` →
  202.1 KiB 덤프, 사용자 테이블 70/70 일치. sqlite3 스크래치 복원 exit 0.
  대조 users 1/1, bookings 0/0, suppliers 17/17, feature_flags 13/13 — 무손실.
  (`wrangler execute --file` 직접 복원은 FK 순서 문제로 실패함을 확인하고
  절차에서 제외.)

## 7. 과거 수치 폐기 기록

- 2026-10-18판의 "8테이블 목록"과 쿼리 지연 측정치(0.15ms 등)는 미검증
  수치라 삭제했다. 테이블 수는 백업 스크립트가 매 실행 대조한다.
