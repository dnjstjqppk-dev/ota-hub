# VPS 슬롯 배포 런북 (공용 개발 VPS, getfortrip 자리)

> 대상 자리: `/srv/getfortrip` (코드 `app`, 데이터 `data`, 로그 `logs`).
> dev URL: `http://getfortrip.13.140.250.138.nip.io`.
> 백엔드 = `scripts/pg-harness/server.mjs` (실제 워커를 PG 위에서 서빙).
> 슬롯 규칙 준수는 코드로 고정済 (§5). `infra/vps-dev`(도커 자가호스팅)는
> 이 VPS에서 쓰지 않는다. PG·Redis·Caddy는 관리자가 운영한다.

## 1. 계정 (관리자 선행)

공개키를 관리자에게 전달한다. 계정 생성 전에는 접속 불가다.

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEGOjrwhnRa3oKzCad/DoOpYGetaHm+Tn32CqEcUzNbZ getfortrip-dev
```

```powershell
# 계정 생성 후 접속 확인 (Windows)
ssh -i $env:USERPROFILE\.ssh\getfortrip_vps getfortrip@13.140.250.138 'cat /srv/getfortrip/README.md'
```

## 2. 코드 배치 (VPS에서)

```bash
cd /srv/getfortrip/app
# 방법 A: git clone (권장)
git clone https://github.com/dnjstjqppk-dev/ota-hub.git .
# 방법 B: 로컬에서 rsync (node_modules·.output 제외)
npm ci
node --version  # 24.x 필요 (.node-version). 없으면 관리자에게 요청.
```

`/`(사용자 포털)까지 서빙하려면 프론트 빌드가 필요하다.

```bash
npm --prefix frontend-user run build
# 산출물 frontend-user/.output/public 을 하네스가 그대로 서빙한다.
```

빌드 없이도 API(`/api/v1/*`)는 정상 동작한다. `/`는 404가 된다.

## 3. 환경값 (VPS에서)

```bash
cp /srv/getfortrip/.env.slot /srv/getfortrip/app/.env
# 아래 4종을 .env에 추가한다 (값 생성: openssl rand -base64 32)
#   JWT_SECRET / PII_ENC_KEY / PUBLIC_SITE_URL=http://getfortrip.13.140.250.138.nip.io
#   E2E_UPLOADS_DIR=/srv/getfortrip/data/uploads
# REDIS_URL은 2번 인덱스 유지 (redis://127.0.0.1:6379/2).
# 양식: infra/vps-slot/app.env.example
mkdir -p /srv/getfortrip/data/uploads
```

## 4. DB 적재 (VPS에서, 1회)

```bash
cd /srv/getfortrip/app
set -a; source /srv/getfortrip/app/.env; set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/pg-harness/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/pg-harness/delta-0054-0057.sql
E2E_PG_URL="$DATABASE_URL" node scripts/pg-harness/seed-e2e.mjs '<어드민비번>'
node scripts/vps-dev-check.mjs  # {"ok": true} + exit 0
```

기대: 테이블 92개. `getfortrip_dev` 외 DB는 건드리지 않는다.

## 5. systemd 등록 (VPS에서)

```bash
# 슬롯 샘플과 대조 후 설치 (User·node 경로 확인)
sudo cp /srv/getfortrip/app/infra/vps-slot/getfortrip-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now getfortrip-api
systemctl is-active getfortrip-api  # active
journalctl -u getfortrip-api -n 20 --no-pager  # pg harness on http://127.0.0.1:9103
```

재시작·로그는 슬롯 표준을 쓴다.

```bash
systemctl restart getfortrip-api
journalctl -u getfortrip-api -f
```

## 6. 슬롯 규칙 대조 (코드 증거)

- 127.0.0.1:9103 전용: `server.mjs`가 `listen(port, '127.0.0.1')` 고정.
  PORT는 `.env`의 9103을 읽는다. 0.0.0.0 바인드 경로가 없다.
- Redis 2번 인덱스: `REDIS_URL` 경로(`/2`)를 파서가 읽고 접속에 쓴다.
  명시 인덱스가 우선이라 실수 여지가 없다. 비밀번호·계정도 URL에서 읽는다.
- 금지 포트(9106~9119·9200~9219): 사용 포트는 9103 하나뿐이다.
- oris·타 슬롯: `.env`의 자릿값만 쓰고 타 DB·포트를 참조하지 않는다.
- Caddy·PG·Redis: 건드리지 않는다 (재설치 금지 준수).

## 7. 검증 증거 (2026-11-21 로컬 실측)

- 파서 단위 3종 + 실서버 5종: 8/8 통과 (비밀번호 서버 대상).
- 비밀번호·인덱스·오류 4조건 프로브: 전부 통과 (임시 스크립트, 미커밋).
- 서버 기동: PORT env로 18999 리슨, 리스너 127.0.0.1 확인.
- `/api/v1/health` → 503 degraded + `database:false` (DATABASE_URL 별칭이
  죽은 PG를 가리킨 증거 — 별칭 배선 정상).
- 기존 기본값(비밀번호 없음·db 0·argv 포트·랜덤 시크릿)은 그대로라
  로컬 E2E·CI 흐름에 영향이 없다.

## 8. 문제 해결

- dev URL이 502면 백엔드가 죽은 것이다. `systemctl status` → `journalctl` 순.
- `password authentication failed`면 `.env` 비번과 URL 인코딩을 대조한다.
- `ECONNREFUSED 6379/5432`면 관리자에게 PG·Redis 상태를 요청한다 (재설치 금지).
- 재시작 뒤 로그인이 풀리면 `JWT_SECRET`이 `.env`에 없는 것이다.
- 스키마 드리프트(D1 신규분): `delta-*.sql` 추가 후 VPS에 재적재한다.
