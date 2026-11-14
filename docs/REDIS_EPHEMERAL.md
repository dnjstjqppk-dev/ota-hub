# Redis 임시 상태 (TG-10)

> 코드 증명 완료, 매니지드 선정은 사용자 단계. 홀딩은 RDBMS에 잔류(아래 §4).

## 1. 구조

- `worker/src/lib/ephemeral.ts`: `EphemeralStore` 인터페이스 + D1 구현(기본값)
  + `withFallback` 래퍼. 워커는 edge-safe 유지(신규 런타임 의존성 없음).
- `scripts/redis-store/redis-ephemeral.mjs`: Redis 구현 (harness 전용).
- 주입: `env.EPHEMERAL` (미설정 = D1). 하네스는 `E2E_REDIS_URL`이 있으면
  `withFallback(redis, d1)` 주입. 운영 Redis는 Upstash REST 구현 + `REDIS_URL`
  (매니지드 단계에서 추가, 인터페이스 변경 없음).

## 2. 키 설계 (prefix `gft:`)

| 용도 | 키 | 구조 | TTL |
|---|---|---|---|
| 레이트 카운터 | `rl:{bucket}:{ip}` | ZSET score=epoch | window+300s |
| 잠금 실패 | 상동 (`*_fail:`) | 상동 | 900+300s |
| 폐기 JTI | `rev:{jti}` | STRING | 토큰 만료시각 |
| 세션 리셋 | `reset:{subject}` | STRING epoch | 없음 (D1과 동일) |
| 멱등키 | `idem:{scope}:{key}` | HASH | 30일 (D1 sweep와 동일) |

슬라이딩 윈도우 의미는 D1(`attempted_at > now-window`)과 동일:
`ZREMRANGEBYSCORE 0 edge`(inclusive) 후 ZCARD.

## 3. 폴백

모든 연산은 Redis 실패 시 D1으로 개별 폴백한다(try/catch per-op).
증명: 단위 테스트(dead-port) + Redis 정지 상태 E2E 서브셋 녹색.

## 4. 범위 기록 — 홀딩은 이전하지 않는다

백로그 초안은 홀딩 포함이었으나 제외한다. `inventory_holds`는 예약과
FK·조인·가드 INSERT로 묶인 트랜잭션 데이터라 Redis로 옮기면 정합성·대사·
롤백이 깨진다. 홀딩은 RDBMS에 둔다. (TG-09에서 경합 제어도 RDBMS 측에 둠.)

## 5. 매니지드 단계 (사용자)

1. Upstash/Redis Cloud 선정 + `REDIS_URL` 시크릿.
2. `UpstashEphemeral` REST 구현 추가 (인터페이스 동일, E2E로 증명).
3. 스테이징에서 Redis 모드 E2E → 운영 전환 (D1 폴백 유지).
