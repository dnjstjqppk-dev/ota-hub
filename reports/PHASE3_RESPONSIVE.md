# Phase 3 반응형 + 스크린샷 검수 — getfortrip 3포털 (2026-11-07)

> 방법: 실운영(ota-hub/admin/partner workers.dev) 대상 headless Chrome 캡처 —
> 46개 화면 × 3뷰포트(375/768/1440) = 138샷 + 온보딩 제외 재캡처 72샷 + 인터랙션 4건.
> 자동 지표(콘솔 에러·XHR 실패·가로 오버플로우) + 핵심 화면 육안 검수 병행.

## 1. 결과 요약

| 지표 | 결과 |
|---|---|
| HTTP 200 (138 캡처) | 138/138 |
| 페이지 가로 오버플로우 | 0건 |
| 콘솔 에러 | 3건 → 모두 동일 원인 (파트너 `/orders/:id` blank, P0로 수정) |
| XHR 실패 | 7건 → 모두 동일 원인 (Unsplash 404 이미지 1건, 수정) |
| 드로어/메뉴/필터시트 인터랙션 | 4/4 PASS |

## 2. 발견·수정 (본 커밋 포함)

### P0. 파트너 중첩 라우트 새로고침 시 백지 (수정됨)
- 현상: `/orders/:id` 직접 접속·새로고침 시 완전 백지 + 콘솔 모듈 MIME 에러.
- 원인: `frontend-partner/vite.config.ts`의 `base: './'` —
  중첩 경로에서 `./assets/*.js`가 `/orders/assets/*.js`로 해석되어 SPA 폴백 index.html을 받고 부팅 실패.
- 수정: admin/partner 모두 `base: '/'`, 허브 서브패스(`/admin/*`, `/partner/*`)는
  `worker/index.ts`의 `/assets/*` 폴백(루트 미스 → `/admin`, `/partner` 순 조회)으로 유지.
  에셋 파일명은 content-hash라 폴백 충돌 없음. 사용자 포털(Nuxt)은 `/assets` 미사용이라 영향 없음.

### P1. 파트너 모바일 빈 상태 메시지 잘림 (수정됨)
- 현상: 375px에서 빈 테이블(상품/주문/정산/직원/대시보드 최근주문)의 중앙 메시지가
  min-width 테이블 안에서 잘려 스와이프해야 읽힘.
- 수정: 5개 뷰 6개 테이블에 조건부 min-width —
  데이터가 없을 땐 `w-full !min-w-0`, 있을 땐 기존 스크롤 테이블 유지.
- 참고: 데이터 테이블 자체는 `overflow-x-auto` 설계대로 스와이프 가능 (결함 아님).

### P1. 깨진 상품 이미지 (수정됨)
- 현상: `photo-1590559899731-a372a146979d`가 Unsplash 404 → things-to-do/패키지/홈에서 ORB 차단.
- 조치: 저장소 전체 Unsplash ID 22건 전수 검증 → 사망 1건만 확인.
  검증된(200 image/jpeg) 기존 ID로 교체 — 프론트 카탈로그 3종 + `seed_catalogs_remote.sql` +
  운영 D1 5행(`htl_seoul_03`, `htl_osaka_01`, `htl_fukuoka_02`, `act_usj_osaka`, `pkg_osaka_3d2n`) UPDATE 완료.
  운영 API 재조회로 사망 ID 소멸 확인.

### P2. 특가 배지에 원시 enum 노출 (수정됨)
- 현상: `/deals` 쿠폰 카드에 `PERCENTAGE`/`FIXED_AMOUNT` 그대로 표시.
- 수정: `정률 할인`/`정액 할인` 한글 라벨 매핑 (모르는 값은 원문 폴백).

## 3. 결함 아님 (확인됨)

- 파트너/관리자 테이블이 375px에서 좌측만 보이는 것 → `overflow-x-auto` 의도 설계, 스와이프로 전체 접근.
- 관리자 드로어 하단 "이름 없음" → 검수 스크립트가 토큰만 주입해 생긴 아티팩트 (실로그인은 사용자명 저장).
- 온보딩 모달이 캡처마다 뜬 것 → 미해제 시 매 방문 노출이 정상 UX (`getfortrip_onboarded_v1` 영구 해제).
- 파리 호텔에 열대 리조트 사진 → 목 이미지 재사용 (실공급사 계약 시 실사진 교체 예정, 기존 잔여 항목).
- `ing_sample_02`가 PUBLISHED인데 `published_item_id` 없음 → 현 발행 코드(원자적 claim)와 무관한 레거시 행.

## 4. 인터랙션 검증 (375px)

| 케이스 | 결과 |
|---|---|
| 파트너 햄버거 → 드로어 (`#partner-nav` x=0, w=256) | PASS (Phase 1 수정 동작 확인) |
| 관리자 햄버거 → 드로어 | PASS |
| 사용자 전체 메뉴 (aria-expanded=true) | PASS |
| 호텔 목록 필터 → 바텀시트 (등급/평점/요금/유형/혜택 + 적용 버튼) | PASS |

## 5. 게이트

- 브랜딩 PASS, 유닛 48/48, admin/partner 빌드 PASS (절대경로 에셋 + 신규 클래스 컴파일 확인),
  Nuxt generate PASS (484 라우트 — `/en|ja|zh` prefix 라우트도 프리렌더 확인됨, Phase 0 미해소 해소).

## 6. 검수 샷 (대표)

- `phase3/interact-partner-drawer.png` — 파트너 모바일 드로어 열림
- `phase3/interact-user-filter.png` — 호텔 필터 바텀시트
- `phase3/partner-375-orders-ord-qa-missing.png` — 수정 전 `/orders/:id` 백지 증거
- `phase3/partner-375-staff.png` — 수정 전 직원표 잘림 증거
- `phase3/user-375-hotels-list-vp.png` — 사용자 호텔 목록 (375px)
- `phase3/admin-375-dashboard.png` — 관리자 대시보드 (375px)

전체 210샷 원본은 검수 환경(`$env:TEMP\ota-phase3\shots*`) 보관.
