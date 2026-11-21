# VPS 개발 DB 런북 (Postgres + Redis, 개발 전용)

> 범위: 개발용이다. 로컬 하네스(pg-harness·redis-store)가 VPS의 PG·Redis를
> 바라보게 한다. 워커와 wrangler 설정은 손대지 않는다. 운영 PG·Redis
> (매니지드 선정)는 별도 결정이며 이 문서와 무관하다.
> 전 단계는 동일 compose로 로컬 검증済 (아래 §6).
> 공용 개발 VPS(getfortrip 자리)는 이 문서를 쓰지 않는다. PG·Redis·Caddy를
> 관리자가 운영하는 자리라 `docs/VPS_SLOT_RUNBOOK.md`를 쓴다.

## 1. 준비물 (이 repo)

- `infra/vps-dev/docker-compose.yml`: PG 16 + Redis 7, 둘 다 127.0.0.1 전용 바인드.
- `infra/vps-dev/.env.example`: VPS에 복사할 `.env` 양식 (`.env`는 깃 제외).
- `scripts/pg-harness/delta-0054-0057.sql`: TG-21 스냅샷 이후 하이브리드분. 재실행 가능.
- `scripts/vps-dev-check.mjs`: 접속 검사. 기존 변수만 읽는다.
- 루트 `.env.example`의 `E2E_PG_URL`·`E2E_REDIS_URL` (하네스 기본값과 동일).

보안 기본값: DB 포트는 외부에 열지 않는다. 접속은 SSH 터널만 쓴다.
Redis는 비밀번호 없이 루프백 전용이다. 오늘의 로컬 도커와 같은 신뢰 수준이다.

## 2. VPS 준비 (1회, Ubuntu 기준)

```bash
# docker + compose 플러그 확인
docker compose version
# 프로젝트 디렉토리
mkdir -p ~/gft-vps-dev && cd ~/gft-vps-dev
# compose와 양식을 로컬에서 복사 (VPS 호스트명은 사용자 값으로 교체)
scp ../../infra/vps-dev/docker-compose.yml ../../infra/vps-dev/.env.example user@VPS:~/gft-vps-dev/
```

VPS에서 `.env`를 만들고 긴 비밀번호를 넣는다.

```bash
cp .env.example .env
openssl rand -base64 32  # 출력값을 .env의 POSTGRES_PASSWORD에 붙여넣기
docker compose up -d
docker compose ps  # pg·redis 둘 다 healthy여야 다음으로 간다
```

## 3. 스키마 적재 (1회, VPS에서)

```bash
# 스키마 파일 복사 (로컬에서)
scp ../../scripts/pg-harness/schema.sql ../../scripts/pg-harness/delta-0054-0057.sql user@VPS:~/gft-vps-dev/
# VPS에서 적재 (순서 고정: 스냅샷 → 델타)
docker cp ~/gft-vps-dev/schema.sql gft-vps-pg:/tmp/schema.sql
docker exec gft-vps-pg psql -U postgres -d ota_pg -v ON_ERROR_STOP=1 -q -f /tmp/schema.sql
docker cp ~/gft-vps-dev/delta-0054-0057.sql gft-vps-pg:/tmp/delta.sql
docker exec gft-vps-pg psql -U postgres -d ota_pg -v ON_ERROR_STOP=1 -q -f /tmp/delta.sql
```

기대: 테이블 92개. `schema.sql`은 compat 함수 포함 단일 파일이라 별도 순서가 없다.

## 4. SSH 터널 (로컬, 개발할 때마다)

```powershell
# Windows (PowerShell) — 창을 열어 둔다
ssh -N -L 15433:127.0.0.1:5432 -L 16381:127.0.0.1:6379 user@VPS
```

```bash
# macOS/Linux — 동일
ssh -N -L 15433:127.0.0.1:5432 -L 16381:127.0.0.1:6379 user@VPS
```

포트 번호는 로컬 도커와 같아서 터널이 뜨면 URL이 그대로 통한다.
로컬 도커 PG·Redis와 동시 기동은 금지다 (같은 포트).

## 5. 로컬 사용

```powershell
# 비밀번호에 특수문자가 있으면 URL 인코딩 (%21=! %40=@ %23=#)
$env:E2E_PG_URL='postgres://postgres:<VPS 비번>@127.0.0.1:15433/ota_pg'
$env:E2E_REDIS_URL='redis://127.0.0.1:16381'
node scripts/vps-dev-check.mjs  # {"ok": true, ...} + exit 0
```

최초 1회는 개발 시드를 넣는다.

```powershell
node scripts/pg-harness/seed-e2e.mjs '<로컬어드민비번>'
```

이후 하네스는 평소대로 쓴다. `server.mjs`는 `E2E_PG_URL`을 그대로 읽는다.

```powershell
$env:E2E_PG_URL='postgres://postgres:<VPS 비번>@127.0.0.1:15433/ota_pg'
node scripts/pg-harness/server.mjs 8798
```

## 6. 검증 증거 (2026-11-21, 동일 compose 로컬 실측)

- `docker compose config`: exit 0, stderr 0행.
- `node --check scripts/vps-dev-check.mjs`: 통과.
- 빈 포트 대상 검사: `{"ok": false, "failed": "pg+redis"}` + exit 1 (약 3초).
- 실컨테이너: pg·redis healthy → 검사 `ok:true` (PG 16.15·PONG) + exit 0.
- `schema.sql` 적재: 테이블 90·compat 2. 델타 적재+재실행: 92·행·인덱스 정합.
- `wholesale` 어댑터 INSERT·DELETE + `is_voucher_only` 컬럼 확인.
- `seed-e2e.mjs`: exit 0. 브랜딩: 549 파일 PASS. 검증 컨테이너는 삭제済.

## 7. 스키마 드리프트 (D1 마이그레이션 추가 시)

`schema.sql`은 TG-21 스냅샷 + `delta-0054-0057.sql`이다. D1에 새
마이그레이션이 생기면 둘 중 하나로 따라간다.

1. 정석: 새 D1 덤프(`sqlite_master`의 type·name·sql) →
   `node scripts/pg-harness/port-schema.mjs <덤프> <출력>` →
   VPS에 재생성 적재 (상세 쿼리는 스크립트 헤더 참조).
2. 소규모: `delta-*.sql` 추가 (이식 규칙: FK 제거·`gft_now()`·재실행 가능).

## 8. 문제 해결

- 검사가 `ECONNREFUSED`면 터널이 죽은 것이다. 터널 창부터 확인한다.
- `password authentication failed`면 `.env` 비번과 URL 인코딩을 대조한다.
- Windows에서 파일 내용을 파이프로 `docker exec`에 넣지 않는다.
  인코딩이 깨져 정상 SQL도 실패한다. `docker cp` + `psql -f`만 쓴다.
- Redis 재시작 후 카운터가 날아간다. 개발용이라 정상이며 하네스는 D1로 폴백한다.
- 롤백: 터널을 끊고 로컬 도커 PG·Redis로 돌아가면 된다. 코드 변경이 없다.
