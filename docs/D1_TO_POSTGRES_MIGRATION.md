# D1 → Postgres 이전 설계 (TG-07)

> 목표(TG-09): 주문·결제·정산·재고를 매니지드 Postgres로 이전. D1은 엣지 잡데이터로 격하.
> 본 문서는 설계 + 1차 방어선(인터페이스). 데이터 이전은 TG-09에서 실행.

## 1. 현황 (2026-11-14 실측)

- D1 1개(`ota_production`), 마이그레이션 45개, 단일 라이터, 10GB 하드캡.
- 직접 `env.DB` 호출 **571곳**(worker/src). 인터페이스 경유는 analytics 1모듈뿐.
- SQLite 방언 사용: `strftime` 84, `CURRENT_TIMESTAMP` 61, `ON CONFLICT` 9,
  `AUTOINCREMENT` 2, `LIMIT ?` 10, `.first()/.all()` 111행. `RETURNING` 0.

## 2. 목표 아키텍처

- 매니지드 Postgres 1차(Neon/Supabase/AlloyDB/Cloud SQL 택1) + 읽기 복제본 +
  커넥션 풀러(Hyperdrive·PgBouncer — 서버리스 필수).
- 2차(글로벌·TG-20): 샤딩/분산(Citus·TiDB·OceanBase 계열).

## 3. SQL 대응표 (TG-09 변환 규칙)

| SQLite(D1) | Postgres | 비고 |
|---|---|---|
| `?` 플레이스홀더 | `$1..$n` | 어댑터에서 자동 변환 |
| `strftime(...)` | `now()`·`date_trunc` | 84곳, 함수 래퍼로 격리 |
| `CURRENT_TIMESTAMP` | `now()` | 61곳 |
| `AUTOINCREMENT` | `GENERATED ALWAYS AS IDENTITY` | 2곳 |
| TEXT ISO 날짜 | `timestamptz` | 읽기 호환 유지 후 절체 |
| `ON CONFLICT` | 그대로 | 양쪽 동일 |
| JSON1 함수 | `jsonb` 연산자 | 케이스별 변환 |
| `db.batch()` | 트랜잭션 1개 | 어댑터가 매핑 |

## 4. 전략: expand–contract (테이블군 단위)

1. Postgres 스키마 생성(마이그레이션 45개를 Postgres 방언으로 포팅).
2. 테이블군 단위 이중 쓰기(D1+PG) → 백필 → 읽기 절체 → D1 쓰기 중단.
   순서: analytics·로그 → 카탈로그 읽기 → 재고·홀딩 → 주문·결제·정산(마지막).
3. 절체마다 E2E 전체를 Postgres 대상으로 녹색 확인 후 다음 군으로.
4. 롤백: 읽기 플래그를 D1으로 되돌리면 즉시 복귀(이중 쓰기 기간 한정).

## 5. 1차 방어선 (본 커밋, TG-07)

- `worker/src/db/database.ts`: `Db` 인터페이스 + D1 어댑터 + `db(env)` 팩토리.
- 원칙: **신규 코드는 `Db` 경유, `env.DB` 직접 호출 금지.**
- 입증 조각: analytics 모듈 전체를 `Db`로 전환(호출 15곳) + 어댑터 위임 테스트.
- 동작 불변: 어댑터는 위임만. 격리 E2E(동작 변경군 묶음)로 증명.

## 6. TG-09 선행 조건

- 풀러·복제본 포함한 목표 DB 선정 및 스테이징(TG-08) Postgres 기동.
- 이중 쓰기·백필 러너(Go 배치 또는 Queues 워커).
- 방언 래퍼(strftime 등 84곳) 중앙 함수화.
