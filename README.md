# ✈️ getfortrip Global OTA Platform

> 호텔·항공·기차·렌터카·공항픽업·투어/티켓/eSIM·다이내믹패키지를 판매하는 종합 여행 OTA.
> 직접판매·중계·제휴 하이브리드 마켓플레이스 + 파트너 입점/정산 엑스트라넷 + 관리자 OMS.

- **공식 플랫폼명**: `getfortrip`
- **예정 도메인**: `getfortrip.com`
- **실서버 배포**: `https://ota-hub.dnjstjqppk.workers.dev` (API + 유저 포털),
  `https://ota-admin.dnjstjqppk.workers.dev` (어드민), `https://ota-partner.dnjstjqppk.workers.dev` (파트너)

---

## 아키텍처 (프로덕션 경로)

```
frontend-user (Nuxt 3, :3000) ─────┐
frontend-admin (Vue 3 + Vite, :3001) ─┼─▶ ota-hub Worker (worker/index.ts, REST /api/v1/*) ─▶ D1 (ota_production)
frontend-partner (Vue 3 + Vite, :3002) ┘        │  ├─ 정적 에셋 서빙 (/admin, /partner 포함)
                                              │  └─ cron: 예약만료·미확인결제 대사·환불재시도·메일발송
backend/ (Go 1.23, :8080) ── 참조용 인메모리 구현 (프로덕션 경로 아님)
```

- **API**: `worker/` (TypeScript, Cloudflare Workers + D1). 라우팅은 `worker/index.ts`,
  규칙은 `src/domain/`, 오케스트레이션은 `src/services/`, HTTP는 `src/routes/`, PG는 `src/payments/`.
- **DB**: D1 SQLite. `worker/migrations/` (0024까지). CI가 적용 가능 여부만 검증하고,
  운영 반영은 수동 적용(`npx wrangler d1 migrations apply ota_production --remote`).
- **결제**: Toss Payments 서버 승인/취소/조회 + PG 웹훅(`/api/v1/webhooks/toss`,
  힌트 수신 후 lookup 재확인). 미설정 시 결제는 비활성으로 정직 응답.
- **메일**: Resend. 미설정 시 outbox에 적재되고 API가 `NOT_CONFIGURED`로 응답.
- **공급사**: 직계약(`direct_contract`, OMS 수동 확정) + 제휴 딥링크.
  GDS/NDC 실연동은 계약 대기(`BLOCKED_PENDING_CONTRACT`, 가짜 성공 없음).

---

## 빠른 시작

### 1. 프로덕션 API (Cloudflare Worker + D1)

```powershell
npm install
npx wrangler d1 migrations apply ota_local --local -c wrangler.local.jsonc
node scripts/dev-seed.mjs LocalAdmin2026!x   # 로컬 어드민 + 시뮬레이터 시드
npx wrangler dev -c wrangler.local.jsonc --port 8799   # E2E 기본 포트
```

### 2. 사용자 웹 (Nuxt 3)

```powershell
cd frontend-user
npm run dev        # http://localhost:3000
npm run generate   # 정적 프리렌더 빌드
```

주요 경로: `/`(홈·7도메인 위젯), `/hotels/list`, `/hotels/detail/[id]`,
`/flights/search`, `/trains/search`, `/checkout`, `/booking/result`,
`/my/bookings`, `/moments`, `/trip-best`, `/deals`, `/rewards`, `/help`,
`/terms`, `/privacy`, `/refund-policy`.

### 3. 관리자 콘솔 (Vue 3 + Vite)

```powershell
cd frontend-admin
npm run dev      # http://localhost:3001
```

14 모듈: 대시보드·예약OMS·카탈로그·가격·프로모션·커뮤니티·공지·정산·파트너·
사용자·공급사·피처플래그·URL수집. 전 뷰 실API 연동 + 라우트 가드.

### 4. 파트너 엑스트라넷 (Vue 3 + Vite)

```powershell
cd frontend-partner
npm run dev      # http://localhost:3002
```

대시보드·상품·재고캘린더·주문·정산·프로필·스태프·API키/웹훅.
서버간 연동: `Authorization: Bearer gft_live_...` (화면에서 발급, 평문 1회 표시),
규격: `GET /api/v1/partner/openapi.json`.

### 5. 참조 백엔드 (Go, 인메모리)

```powershell
cd backend
go run cmd/api/main.go   # http://localhost:8080
```

표준 라이브러리만 사용, 재시작 시 데이터 소실. API 스펙 참조용이며 배포하지 않음.

---

## 테스트·품질 게이트

```powershell
npm test           # Worker 단위 테스트 + 프론트 컴포넌트 테스트 (node:test)
npm run typecheck  # worker 타입체크 (tsc --noEmit)
npm run test:e2e   # 로컬 워커 대상 E2E (:8799 기동 후, ADMIN_PASSWORD=시드비번)
cd backend; go test ./...
npm run check:branding   # 브랜드 거버넌스 (CI 필수 게이트)
```

CI(`.github/workflows/deploy.yml`): gate잡(브랜딩 → Go → 유닛 → 타입체크 →
마이그레이션 검증 → E2E) 전부 통과 시에만 deploy잡이 3포털 빌드·배포.

## 환경 변수

`.env.example` 참조. Worker 시크릿은 대시보드/CLI로 등록:

```powershell
npx wrangler secret put JWT_SECRET        # 32자 이상 필수
npx wrangler secret put PII_ENC_KEY       # 32바이트 base64 (여권 암호화)
npx wrangler secret put TOSS_SECRET_KEY   # live_... (실결제) / test_... (샌드박스)
# 선택: TOSS_CLIENT_KEY, RESEND_API_KEY, EMAIL_FROM
```

`wrangler.jsonc`의 `vars`는 공개값만. Toss 웹훅 수신 URL:
`https://<host>/api/v1/webhooks/toss` (토스 콘솔에 등록).
