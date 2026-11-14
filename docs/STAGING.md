# 스테이징 환경 (TG-08)

> 목적: 운영 손대기 전 main 검증을 위한 분리 환경. 운영 DB·시크릿과 무관.

## 구성

- 워커: `ota-hub-staging` (wrangler.jsonc `env.staging`), 코드=main.
- DB: `ota_staging` (격리 D1, 운영과 별개).
- URL: `https://ota-hub-staging.<account>.workers.dev` (배포 후 확정).

## 1회성 준비 (사용자 1회 실행)

```powershell
npx wrangler d1 create ota_staging   # database_id를 wrangler.jsonc env.staging에 기입
npx wrangler d1 migrations apply ota_staging --remote --env staging
npx wrangler secret put JWT_SECRET --env staging
# 필요 시: PII_ENC_KEY (tg08 검증은 여권 없이 통과)
```

## 배포·검증

```powershell
node scripts/deploy-staging.js        # 빌드 + env.staging 배포 + 스모크
```

수용: 스테이징 URL 200 + `/api/v1/health` 정상 + 스모크 PASS.

## 주의

- 스테이징 시드는 목 카탈로그만. 실공급사 키·실PG 키를 넣지 않는다.
- 운영 승격은 본 문서 범위가 아니다(사용자 판단 + GO_LIVE_CHECKLIST).
