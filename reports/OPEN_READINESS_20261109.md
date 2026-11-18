# OTA 오픈 가능 수준 판정 — 2026-11-18 (현행화)

> 대상: `main@060c597`(TG-21까지 완료 + CI 배선 수정) + 본 문서(하단 §4).
> 모든 수치는 직접 실행·관측(측정일 표기). 원장 182/182 + CR-01~09 해소,
> TG-11·TG-13~TG-21 완료. TG-12 보류(사용자 결정), TG-14 계약 블록.
> 선행 보고서: [Phase 5 상용화 판정](PHASE5_COMMERCIALIZATION.md) (조건부 GO),
> [전수 감사 리포트](FULL_AUDIT_20261109.md), [갭 원장](COMMERCIALIZATION_GAPS_20261110.md),
> [상용화 감사](COMMERCIAL_READINESS_AUDIT.md), [TG 백로그](TRIP_GRADE_BACKLOG.md).

## 1. 판정: 조건부 GO 유지 (코드 완성, 외부 연동이 블로커)

코드·테스트·문서·게이트는 전부 녹색이며 계획된 기능 범위(TG-12·TG-14 제외)가
남김없이 구현됐다. 그러나 실제 돈이 오가는 정식 오픈은 아래 블로커
(운영 마이그레이션·외부 자격·계약)가 막고 있다. 파일럿(폐쇄·지인)
수준은 가능.

## 2. 게이트 증거 (2026-11-17~18 관측, TG-21 코드)

| 게이트 | 결과 | 근거 |
|---|---|---|
| 유닛 | 302pass·0fail (총307, skip 5) | 11-17 `npm test` (이후 제품코드 변경 없음 — CI 배선·문서만) |
| 로컬 E2E | 212/212 + stripe 3/3 + suppliers 4/4 + replica 3/3 | 11-17 각 fresh 격리DB 1회차 (e2e_tg21·e2e_stripe·e2e_sup3·e2e_rep2) |
| 타입체크 | exit 0 | 11-17 `npm run typecheck` (이후 제품코드 변경 없음) |
| Go 백엔드 | PASS | 11-18 pre-commit 후크 `go test ./...` |
| 브랜딩 가드 | PASS | 11-18 `npm run check:branding` (606 파일 스캔) |
| 3포털 빌드 | exit 0 | 11-17 `node scripts/build-all.js` (이후 제품코드 변경 없음) |
| 의존성 감사 | critical 0 | 11-17 `npm audit --omit=dev --audit-level=critical` (4 패키지) |
| 운영 검증 | 43/47 + live-settle 1 skip | 11-18 `scripts/verify-production.js` fresh 격리DB(verify_1118) 재측정. 잔여 4종(T11·T13·T14·T20)은 prod-진실·환경조건부로 로컬 적색이 정상 (§5-0). T21(register 분리)·T33(신규 플래그 3종) 기대치 수리済. |
| CI | fast·e2e 녹색, deploy 차단 | run 44257914473 (11-18): fast ✓(1m34s)·e2e ✓(13m41s, D1 212/212 + stripe 3/3 + suppliers 4/4 + replica 3/3). deploy잡은 `CLOUDFLARE_API_TOKEN` 7403 만료로 실패 — 시크릿 교체 필요 (§5-0). |
| 레드드릴 | RED→GREEN (매 TG) | TG-11~TG-21 각 증거에 기재 ([TG 백로그](TRIP_GRADE_BACKLOG.md)). CI 배선도 3회 적색→수정→녹색으로 검증됨. |
| 마이그레이션 | D1 0053 · PG 90T/111idx | 11-17 덤프·델타 적용済 (gft-pg). 운영은 0027~0044만 적용 (§5-0). |

## 3. WO-OTA 10종 매핑 (전부 통과 테스트에 귀속)

| ID | 기능 | 검증 |
|---|---|---|
| 01 | 위시리스트 서버 동기화 | E2E wishlist + #182 검증 |
| 02 | 최저가 알림 | E2E user data |
| 03 | 비밀번호 재설정 | E2E auth reset (single-use) + #163 스코프 |
| 04 | 여권/쿠폰 지갑 | E2E flight passport + coins/coupons |
| 05 | 취소·위약금 정산 | E2E cancellation + #135-145 정산 |
| 06 | 실투숙 인증 리뷰 | E2E reviews |
| 07 | 제휴 아웃링크 | E2E postback + #132 제한 + #175 정식화 |
| 08 | 사이트맵 + JSON-LD | E2E sitemap + 운영 T20 |
| 09 | 재고 홀딩 + 하한가 | E2E inventory + quote |
| 10 | 레이트리밋 + CORS | E2E 전역 + #141/#142/#164/#179 |

## 4. d4443a4 이후 변경 (P0→TG-21 전 범위, 커밋済)

| 페이즈 | 커밋 | 내용 | E2E/유닛 |
|---|---|---|---|
| P0 #1-12 | 8a2a54a·806b37c | 코인·정산·수용량·캘린더·문구 | 78/66 |
| Phase 1+2 | 29081f4·469200e 외 | A·B·C ADDENDUM 26종 | — |
| P1 6a-6c | 1077824·b1feb13·00e947a | 게이트·고스트·프론트 | — |
| P1 6d-6g | 22df382·f90939e·294e5b3·7e95e8d | RBAC·이행·운영·문구·Go (0037·0038) | 122/85 |
| P2a | 46b23f5 | 돈 정합·경합 (0039) | 127/85 |
| P2b | 4ca028d | 인덱스·무결성 (0040) | 135/87 |
| P2c | 39eb059 | 프론트·어드민 | —/94 |
| P2d | 784d022 | 보안 하드닝·MFA·PII (0041) | 145/96 |
| P2e | 7aedf2e | 슬롯·바우처·커버리지 (0042) | 151/105 |
| P2f | 9938998 | CI·verify·관측 | 151/114 |
| P2g | 800558d | Go·문구·API·제한·프로브 | 167/121 |
| P3a | 153f2f0 | 합계·멱등·REAL·UI (0043·0044) | 171/130 |
| P3b | cf89140 | 게이트·문구·CI·문서 | 176/130 |
| P3c | e5400b0 | 라우팅·코드통일·검증 | 187/130 |
| Phase 7 | 11-13 | 아래 §4-7 | 188/134 |
| CR-01~09 | 6fa6d91에 포함 | 상용화 감사 9종 시정 (검증 E2E 199/199) | 199/192 |
| TG-09·TG-10 | 88d2645 | Redis ephemeral + 폴백 | 189/177 |
| TG-11 | 8f7aa83 | 잡 큐·사가·데드레터 (0046) | 192/185 |
| TG-13 | 6fa6d91에 포함 | OTel·SLO·상태페이지 (0048) | 201/203 |
| TG-15 | 6fa6d91에 포함 | ISR·SSR·허브애셋 (p95 566ms) | 203/— |
| TG-16 | 6fa6d91에 포함 | 검색 FTS5·SEO (p95 143ms, 0049) | 205/— |
| TG-17 | 6fa6d91에 포함 | Stripe·3DS·FDS·차지백 (0050) | 205+3/224 |
| TG-18 | 6fa6d91에 포함 | NDC/GDS 어댑터·브레이커 (0051) | 205+4/253 |
| TG-19 | 6fa6d91에 포함 | 웨어하우스·추천·실험 (0052) | 208/267 |
| TG-20 | 6fa6d91에 포함 | 읽기복제본·DR·리전 (RTO 2.8s) | 208+3/279 |
| TG-21 | 6fa6d91 | ML 마크업·다이제스트·CS봇 (0053) | 212/302 |
| CI 배선 | dcbe311·1cd980e·060c597 | stale-server 정리·웹훅시크릿·BASE | CI 212+3+4+3 |

상세 분량은 [갭 원장](COMMERCIALIZATION_GAPS_20261110.md) ([x] 182건),
[TG 백로그](TRIP_GRADE_BACKLOG.md) (CR-01~09·TG-11·TG-13~TG-21 [x]) 참조.
E2E 표기 "205+3" = 메인 205 + 별도 스위트 3 (합산 아님).
유닛 "—" = 해당 시점 집계 미기재 (최종 302pass·0fail·총307은 §2).

## 4-7. Phase 7 델타 (본 커밋)

- verify T38·T39 수리 (시드 의존 → 필터 정합 + 자가 3P행 증명).
- verify T31 수리 (C1 진실: PENDING 로그인은 200, 영업 API가 403).
- Go 예약 ID 충돌 수정 (UnixNano + 원자 시퀀스, 50연속 무중복 테스트).
- MFA 콘솔 UI (로그인 TOTP 단계 + 내 보안 등록/확인/해제 + 상태 API + 테스트 4종).
- 파트너 동의 저장은 미구현 유지 — 약관이 법무 검토 전 초안이라
  enforce 시점·방식 결정 없이 기록 체계를 만들지 않음 (사용자 결정 §7-6).

## 5. 블로커 (정식 오픈 전 필수 — 코드 밖)

### 5-0. 운영 반영·검증 잔여 (코드 완료, 실행 필요)

0. **CI 시크릿 만료**: GitHub `CLOUDFLARE_API_TOKEN`이 7403으로 거부돼
   deploy잡이 실패한다 (11-18 run 44257914473 재확인). 주간 D1 백업도
   같은 인증 오류로 미동작 중. Cloudflare 토큰 재발급 후 시크릿 교체가 먼저다.
1. **운영 D1 0045~0053 미적용** (0047 CR 가산형 + TG-11·TG-13~TG-21분).
   배포 파이프라인 0단계 또는 `docs/GO_LIVE_CHECKLIST.md` 0단계 수동 적용.
   0027~0044는 11-14 사고로 적용된 상태 — 아래 6번 결정과 함께 확인할 것.
2. **verify 로컬 잔여 4종** (T11·T13·T14·T20): prod-진실·환경조건부
   테스트로 로컬 적색이 정상. 운영 실행에서 판정한다.
   11-18 로컬 재측정 43/47 확정 (신규 적색 2종은 기대치 수리로 해소).
3. **wrangler 인증 만료** (Cloudflare 7403): `npx wrangler login` 필요.
4. **운영 verify+T41**: `TEST_ADMIN_PASSWORD` 필요 (에이전트 미보유).
5. **`temp_master_prompt.md` 구 해시**: 사용자 파일 — 직접 삭제.
6. **11-14 사고 keep/rollback 미결정**: 미승인 운영 변경(D1 0027~0044 +
   3포털 재배포, 스모크 11/11 PASS). 0043 DROP 포함이라 롤백이 단순하지 않음.
   keep/rollback 사용자 결정 전까지 운영 추가 변경 금지.

### 5-1. 외부 자격·계약 9종 (정식 오픈 전 필수)

1. **결제 비활성** — `paymentProvider: DISABLED`. 코드는 toss·stripe·sandbox
   3종 + 3DS·FDS·차지백까지 지원하나 키 미등록이라 비활성. Toss 실가맹점 등록 후
   `TOSS_SECRET_KEY` + `PAYMENT_PROVIDER=toss` (또는 Stripe 실키) 필요.
2. **여권 암호화키 없음** — `piiEncryptionKey: false`. 여권 포함 예약(항공)이
   503으로 막힌다. `PII_ENC_KEY`(32바이트 base64) 등록 필요.
3. **판매주체 미가동** — `sellerEntityActive: false`. 실사업자 등록·활성 필요.
4. **메일 미설정** — `emailProvider: NOT_CONFIGURED`. Resend 키 필요.
5. **오류알림 미가동** — `errorReporting: NOT_CONFIGURED`. Sentry DSN 필요
   (GitHub Secret + `wrangler secret put SENTRY_DSN`).
6. **실공급사 계약 없음** — ndc·gds 어댑터 + 브레이커·머니게이트는
   완성됐으나 스텁 대상으로만 검증됨. 카탈로그는 목시드, 미계약 상품 409 차단 중.
7. **약관 법무 검토 미완** — Legal v2.0 + 파트너 약관 v1.0 counsel review 필요.
8. **도메인 미연결** — workers.dev 3URL 운영 중, getfortrip.com 예정.
9. **운영 파트너 실정보 미등록** — `ptn_mw62m1m2_yaoxd` 플레이스홀더.
   실정보 수령 시 SQL 업데이트.

## 6. 포털별 상태

- **사용자**: 빌드·200·결제/예약/취소/리뷰/코인 E2E + CI 녹색.
  항공 여권예약만 PII 키 없어 503 (블로커 2). eSIM·보험은 판매준비중 표시.
  공개 `/status` + 추천 레일 + CS 봇 + OAuth 스텁 추가 (TG-13·TG-19·TG-21).
- **관리자**: 200, 카탈로그 CRUD/bulk·제휴·법무·MFA 콘솔 E2E + CI 녹색.
  SLO·인사이트·마케팅·리뷰·스레드 화면 추가 (TG-13·TG-19·TG-21).
- **파트너**: 200, 주문/정산/웹훅/API키 E2E + CI 녹색.
  정산서·메시지·주문 스레드 추가 (TG-19).

## 7. 다음 액션

상세 순서는 [개통 체크리스트](../docs/GO_LIVE_CHECKLIST.md) 0→10단계.

0. 11-14 사고 keep/rollback 결정 → 운영 D1 0045~0053 적용 + NULL·DROP 확인 (§5-0).
1. Toss 실가맹 + `PII_ENC_KEY` + 실사업자 ACTIVE → 결제/여권/정산 파일럿.
2. Sentry DSN 2곳 등록 → verbose `/health` errorReporting: SENTRY 확인.
3. Resend + 도메인 + 법무 확정 → 정식 오픈 게이트 재측정.
4. verify 로컬 재측정 후 운영 verify 47/47 + T41 실정산 (`TEST_ADMIN_PASSWORD` 필요).
5. `temp_master_prompt.md` 구 해시 직접 삭제 + wrangler 재로그인 + CI 시크릿 교체.
6. 파트너 동의 저장 여부·방식 결정 (법무 검토 후).
