# DR 런북 — 재해 복구 절차 (TG-20)

> 범위: D1 `ota_production` 유실·오염 시 복구. R2 업로드 버킷은
> 백업 대상이 아니다 (아래 §7 공백). 분산 RDBMS·2번째 리전은
> 매니지드 선정 후 사용자 단계 — 그 전까지 이 런북은 단일 리전
> 복구(백업→복원→재배포)만 다룬다.

## 1. 목표 (docs/SLO.md §7과 동일)

- RTO ≤ 4시간 (재해 선언→서비스 200, 런북 수동 수행 기준).
- RPO ≤ 8일 (주간 백업 주기 + 버퍼).
- 측정: 분기 게임데이 리허설 (`scripts/dr-rehearsal.mjs`, 로컬) +
  스테이징 전체 드릴 (아래 §5).

## 2. 백업 인벤토리

| 대상 | 방식 | 주기 | 보관 | 검증 |
|---|---|---|---|---|
| D1 `ota_production` | `scripts/backup-d1.js` SQL export | 주 1회 (일 03:00 KST) + 수동 | Actions 아티팩트 30일 | 주간 잡 내 복원 테스트 (§3) |
| R2 `getfortrip-uploads` | 없음 (§7 공백) | — | — | — |
| 시크릿·바인딩 | `wrangler.jsonc` + 시크릿 목록 (§4) | 변경 시 | 저장소 + 운영자 금고 | 배포 스모크 |

## 3. 복구 절차 (D1)

```powershell
# 0. 최신 덤프 확보 (Actions ota-production-sql 아티팩트 또는 backups/ 내 최신)
# 1. 스크래치 복원 + 무결성 검증 (프로덕션에 손대기 전)
node scripts/verify-backup-restore.mjs --dump backups/ota_production-<stamp>.sql
# 기대: exit 0 + "RESTORE-VERIFY PASS" (고아 FK 0, 테이블 완비)

# 2. 운영 복원 (D1 콘솔 또는 wrangler — 기존 DB에 덮어쓰기 전 export 백업 1회)
node scripts/backup-d1.js --out backups/pre-restore

# 3. 덤프 적용 (운영 DB 대상 — 되돌릴 수 없으니 2단계 선행 필수)
#    (적용 명령은 Cloudflare 콘솔 절차를 따른다. D1은 time-travel 복원을
#    제공하지 않으므로 SQL 덤프 재적용이 유일 경로다.)

# 4. 재배포 + 스모크
node scripts/build-and-deploy.js
node scripts/smoke-production.js
# 5. /status 확인 (degraded/outage 해소) + 장애 기록 RESOLVED
```

## 4. 시크릿·바인딩 복원

워커 재배포 후 아래가 없으면 `/health`가 degraded다. 값은 운영자
금고에서 꺼내고 저장소에 커밋하지 않는다.

- `JWT_SECRET`, `PII_ENC_KEY` (`.dev.vars`가 아닌 운영 시크릿)
- `TOSS_SECRET_KEY` / `STRIPE_SECRET_KEY` + 웹훅 시크릿
- `RESEND_API_KEY`, `SENTRY_DSN`
- D1 바인딩 `ota_production` + R2 바인딩 (ID는 `wrangler.jsonc`)

## 5. 스테이징 전체 드릴 (분기 1회, 게임데이)

1. 스테이징 DB에 운영 덤프 복원 (`ota_staging`).
2. 스테이징 워커 재배포 + 스모크 + 핵심 플로우 3종 수동 확인
   (회원가입·결제·취소).
3. RTO 측정 (복원 시작→스모크 녹색) + 리포트 보관
   (`reports/DR_REHEARSAL_<stamp>.md`).
4. 발견 사항은 백로그 이슈로 등록 (런북 개정 포함).

로컬 간이 드릴은 언제든 가능하다:

```powershell
node scripts/dr-rehearsal.mjs --source <persist-dir> [--markers 25]
```

## 6. 실측 caveat (도구 한계 — 우회 포함)

- **FTS5 export 불가 (로컬 확인)**: miniflare `d1 export`는 가상
  테이블이 있으면 실패한다 (`cannot export databases with Virtual
  Tables`). 운영(remote) export도 동일하게 실패할 수 있으니, 주간
  잡 적색 시 첫 의심처다. 우회: FTS(`catalog_fts` + `trg_*_fts_*`
  21종)는 파생 데이터라 덤프 없이 복원 후 재생성한다
  (`worker/migrations/0049` 백필문 재실행 — 카탈로그 읽기 전용이라
  안전). 검증 스크립트는 FTS 유무와 무관하게 동작한다.
- **복원 적재는 FK OFF**: 스키마의 REFERENCES는 즉시(immediate)
  FK라서, 적재 중 enforce면 뒤에 생기는 테이블 참조에서
  `no such table`로 전체가 깨진다. 복원은 반드시
  `PRAGMA foreign_keys=OFF` → 단일 트랜잭션 적재 → ON →
  `foreign_key_check` 순서다 (검증 스크립트 내장).

## 7. 알려진 공백 (후속 과제)

- **R2 업로드 미백업**: 상품 이미지·파트너 문서가 날아가면 복구 불가.
  R2→R2 주기 복제 또는 버전 관리 도입 전까지 P1 잔여.
- **복제본 승격 미보유**: 읽기 복제본(TG-20 라우팅)은 별도 데이터라
  primary 복원에 쓸 수 없다. 승격형 복제는 분산 RDBMS 도입 후.
- **DNS 페일오버 없음**: 리전 장애 시 트래픽 전환 수단이 없다.
  2번째 리전과 함께 설계한다.
