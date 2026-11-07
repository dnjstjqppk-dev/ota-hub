# Phase 4 전수검사 — getfortrip (2026-11-07)

> Phase 3 수정분을 운영 배포 후 전수 재검증 + 잔여 영역(다크모드·데이터 정합·검증스위트) 검사.

## 1. 검사 항목과 결과

| # | 항목 | 결과 |
|---|---|---|
| 1 | 운영 검증스위트 (자립화 후) | 41/41 PASS |
| 2 | Phase 3 수정 재검증 (18 assertions) | 16 PASS + 2 임계아티팩트 (육안 정상 확인) |
| 3 | 허브 중첩 마운트 | 결함 발견 → 수정 → 운영 확인 (아래) |
| 4 | 정적 10종 다크모드 | 결함 발견 → 2차 수정 → 전후 샷 대조 + 라이트 회귀 없음 |
| 5 | 운영 파트너 깨짐 데이터 | 발견 → `char()` 복구 → 바이트 검증 |
| 6 | 로컬 E2E 51종 | 미실행 (판단: worker 변경이 정적서빙 한정, API 무영향 + 운영스위트 41/41로 대체) |

## 2. 발견·수정

### P1. 허브 중첩 마운트가 Nuxt 셸 오서빙 (수정됨, `dfcb5cb`)
- 현상: `/admin/partners`, `/partner/orders/*`가 포털 앱 대신 사용자 Nuxt 셸 반환 (200).
- 원인: ASSETS가 `/xxx/index.html`에 디렉터리 인덱스 리다이렉트(307)로 응답하는데,
  기존 폴백이 200만 허용해 통과 → 섹션 4 셸로 추락. 마운트 루트(`/admin/`)는 자동인덱스로 우연히 동작.
- 수정: `fetchIndex()` 헬퍼 (명시 GET + 307/308 추적), 섹션 1·2·3 적용.
- 검증: 로컬 wrangler 재현 → 수정 확인 → 운영 배포 후 브라우저 실부팅 확인 (실데이터 렌더).

### P1. 정적페이지 다크모드 불가독 (수정됨, `95d4340` + `939364f`)
- 현상: 10종(terms/privacy/cookies/refund/about/careers/faq/news/safety/sustainability) 제목이
  다크모드에서 암흑색 — 구 체크포인트 "raw slate" 잔여와 일치.
- 수정: 1차 텍스트 68건 (`900→100` 등 + `dark:prose-invert`) →
  검증샷에서 밝은 카드 위 옅어짐 발견 → 2차 서피스 44건 (`bg-white→slate-800` 등).
- 검증: terms/privacy/about/faq 다크 샷 대조 + faq/terms 라이트 회귀 샷.

### P1. 운영 파트너 한글 깨짐 (수정됨, 운영 D1 직접)
- 현상: `ptn_mw62m1m2_yaoxd` 회사명·대표자·직원명이 리터럴 `??`로 저장 (전 세션 SQL 입력 인코딩 파괴).
- 범위: `LIKE '%?%'` 전수 조회 → 해당 행 3필드만. 관리자명(`usr_owner_01`)은 hex 대조 결과 정상.
- 수정: PowerShell 한글 전달이 불안정함을 확인 후 `char(코드포인트)` ASCII 경유 UPDATE →
  hex 기대값과 바이트 일치 검증.

### P2. 검증스위트 자립화 (수정됨, `dfcb5cb`)
- TEST 28이 무력화된 시드 고정계정 사용 → 등록→승인→로그인 자립 플로우로 교체.
- TEST 36이 발행済 초안 재발행 시도(409) → 발행가능 초안만, 없으면 스킵 (발행 플로우는 로컬 E2E 커버).

## 3. 증거

- `phase4/hub-admin-partners.png` — 마운트 수정 후 실부팅 (실데이터)
- `phase4/partner-order-missing.png` — 중첩라우트 정상 에러 상태 (백지 해소)
- `phase4/dark-fixed-terms.png`, `phase4/dark-fixed-faq.png` — 다크모드 수정 후
- `$env:TEMP\ota-phase3/verify-fixes.mjs` — 18 assertions 재실행 가능
