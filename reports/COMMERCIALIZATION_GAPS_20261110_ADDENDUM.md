# 상용화 갭 보강 목록 — 2026-11-10 (ADDENDUM)

> 본 문서는 [COMMERCIALIZATION_GAPS_20261110.md](COMMERCIALIZATION_GAPS_20261110.md)(182건)에
> **없던** 항목만 담는다. 모든 항목은 본 세션이 코드 원문을 직접 열어 확인했다.
> 기준 트리: `main@d4443a4` + 미커밋 델타(14:00 전후 수정분). 유닛 66/66 · tsc 0 관측. E2E·운영 미실행.
> 기존 182건은 표본 6건(#13·#23·#32·#36·#48·#65)을 재확인해 6/6 사실이었다. 나머지 176건은 재검증하지 않았다.

## 기존 P0 12건 진행 상태 (작업 트리 기준)

| # | 상태 | 근거 |
|---|---|---|
| 1·2 코인 미복원 | 미커밋 수정 중 | `coinRestoreStmtsOnce` + confirm FAILED 경로 복원 |
| 3 수수료취소 정산 유지 | 미커밋 수정 중 | `supplierGone` 시 정산 REFUNDED |
| 4 캘린더 unit/override | 미커밋 수정 중 | `unitId:'default'` + `loadNightlyOverrides` |
| 5 safety 1588 | 미커밋 수정 | 1588 문자열 0건 |
| 6 무제한 오버셀 | 미커밋 수정 중 | `0027` + `assertInventoryConfigured`. 단, 0027이 기존 행 전부에 30/10/16 임의 수용량을 넣는다 → 운영 적용 전 실수용량으로 교체 필요 |
| 7~12 허위 문구 | 미착수 | news/about/faq/sustainability/careers diff 없음 |

## 신규 A — 법적 의무와 연결된 코드 갭

- [x] A1. **회원탈퇴 없음.** → 완료 (29081f4 / `routes/auth.ts` POST /auth/me/withdraw, `0029_account_lifecycle.sql`, `my/profile.vue`). 비밀번호 확인 + 진행예약 차단 + PII 파기 + retained_records 5년 분리보관. E2E A1 통과
- [x] A2. **약관 동의 이력 미저장.** → 완료 (29081f4 / `lib/consents.ts`, `0028_user_consents.sql`, `routes/auth.ts` register). 가입 시 TERMS/PRIVACY/MARKETING 버전·시각·IP·UA append-only 기록. E2E A3 내 등록이력 검증 통과
- [x] A3. **결제 시 간주동의.** → 완료 (29081f4 / `booking-service.ts` validateTxConsents + consentStmts, `checkout/index.vue` 필수 3종 체크박스). 간주 문구 폐기, 버전 불일치 시 CONSENT_STALE. 유닛 consents 3건 + E2E A3 통과
- [x] A4. 마케팅 수신동의 변경/철회 → 완료 (29081f4 / PATCH /auth/me marketingConsent + `my/profile.vue` 토글). 변경마다 동의일 기록. E2E A4 통과
- [x] A5. **푸터 사업자 표시 누락.** → 완료 (29081f4 / `GlobalFooter.vue`, `composables/useCompany.ts`, `nuxt.config.ts` NUXT_PUBLIC_COMPANY_*). 미입력값은 "준비 중" 표시, Phase 7 사전검사에서 감지
- [x] A6. 개인정보처리방침 CPO·위탁·국외이전 → 완료 (29081f4 / `privacy.vue` v2.1 + `0030_legal_versions_2_1.sql`). CPO 바인딩, 4사 위탁/국외이전 테이블, 암호화 실측 문구(PBKDF2/AES-256-GCM/TLS)
- [x] A7. 판매형태 고지 모순 → 완료 (29081f4 / `terms.vue` v2.1 제2·3·4·5·6조, 푸터/결제 문구, `serializeBooking` salesType + `BookingDetail.vue` 표시). E2E A7 통과
- [x] A8. 회원 정지 불가 → 완료 (29081f4 / PATCH /admin/users isActive + `lib/auth.ts` 상태 게이트 + `UsersView.vue`). 사유 필수, 세션 즉시 종료, 본인 정지 금지. E2E A8 통과

## 신규 B — 돈·정산

- [x] B1. **PG 측 취소 미반영.** → 완료 (3399ba4 / `payments/provider.ts` CANCELED/PARTIAL_CANCELED lookup, `booking-service.ts` applyExternalCancel, `routes/webhooks.ts`). PG 확인 외부취소 기록(재실행 없음) + 재고·코인·정산 동기화 + `?key=` 시크릿 + 멱등. 유닛 1건 + E2E B1 2건 통과
- [x] B2. **이용 전 지급 가능.** → 완료 (3399ba4 / `routes/marketplace.ts` settle 게이트 + `completePastBookings` fulfillment 동기화). COMPLETED + 서비스종료일 경과 + 환불 미진행 강제. E2E B2(기존 배치 테스트 내) 통과
- [x] B3. **지급 후 환불 환수 없음.** → 완료 (3399ba4 / `0031_settlement_recovery.sql` settlement_recoveries, `recordRecoveryIfSettled`, settle 차감, `startRefund` 승인파크). COMPLETED→MANUAL 분쟁 엣지 계약변경 포함. E2E B3 2건 통과
- [x] B4. 실제 지급 수단 없음 → 완료 (3399ba4 / settle payout_method/reference 기록 + 정직한 응답문구 + 배치 명세서 JSON/CSV). 자동이체 레일 없음 명시. E2E B4 통과
- [x] B5. 수수료 세금계산서 발행 없음 → 완료 (3399ba4 / 명세서에 tax_invoice_email·입금계좌 + issuance: MANUAL). 발행사 미계약 상태 정직 표시, 수동발행 워크플로 지원. E2E B4/B5 통과
- [x] B6. 고객 결제영수증 노출 없음 → 완료 (3399ba4 / GET /bookings/:id/receipt + `BookingDetail.vue` 영수증 블록). 기록된 결제·환불·카드사 마스킹 전부 실측 노출. E2E B6 통과
- [x] B7. **어드민 임의 취소·부분환불·오프라인환불 기록 없음.** → 완료 (3399ba4 / force-cancel·refund·offline-refund API + `applyRefundSucceeded` 공용화 + `BookingOmsView.vue` 직권처리 UI + 고객 마스킹). E2E B7 통과
- [x] B8. (권장) 결제수단 카드 단일 → 완료 (3399ba4 / `checkout/index.vue` 카드/계좌이체/가상계좌 선택 → Toss v2 전달). 빌드 통과 (PG 실연동 시 검증 필요)

## 신규 C — 운영·상품·인프라

- [x] C1. **파일 업로드 인프라 0.** → 완료 (469200e / `0032_uploads.sql`, `routes/uploads.ts` R2 multipart, `lib/auth.ts` requirePartnerOnboarding, `routes/partner.ts` PENDING 로그인+프로필, `routes/admin.ts` DOCS_REQUIRED 승인게이트, 파트너 프론트 온보딩 유도+배너). 서류 자동 프로필 연결, 승인 전 업무 API ACTIVE 전용 유지. E2E C1 온보딩+C1/C2 루프(실제 업로드) 통과
- [x] C2. 사업자 진위확인 → 완료 (469200e / `services/business-verify.ts` NTS API, POST /admin/partners/:id/verify-business NTS_API 01-only/MANUAL+note, BUSINESS_NOT_VERIFIED 승인게이트, `PartnersView.vue`). 유닛 nts + E2E 게이트 통과
- [x] C3. **알림 4종뿐** → 완료 (469200e / `services/email-service.ts` 결제완료·취소완료·환불완료·공급사거절 4종 템플릿+트리거, SMS/KAKAO fail-closed). 유닛 email + E2E 유지 통과
- [x] C4. 메일 처리량 상한 → 완료 (469200e / OUTBOX_BATCH_LIMIT 기본 50·상한 200). 크론 처리량 2.5배, E2E 유지 통과
- [x] C5. **일정 변경 허위 표시** → 완료 (469200e / 상세·결제 화면 "일정 변경 가능" 문구·배지 제거, 취소 후 재예약 안내로 교체)
- [x] C6. 다단계 취소수수료 미적용 → 완료 (469200e / `domain/pricing.ts` TIERED 정책, 견적 스냅샷+computeCancellation 동시 적용). 유닛 domain TIERED 통과
- [x] C7. **신규 상품 SEO 미렌더** → 완료 (469200e / GET /api/v1/seo/snapshot + `scripts/gen-seo-snapshot.mjs` + `prerender-routes.json`/`generatedCatalog.json` + `nuxt.config.ts` SEO_DETAIL_ROUTES + `useGeneratedCatalog.ts` fallback). 클린 시드 기준 62 routes, build-all 718 routes prerender 성공
- [x] C8. **상품 콘텐츠 출처 문제** → 완료 (469200e / `0033_content_cleanup.sql` DB 정리 + 정적 카탈로그 평점 null화 + `database/migrations/` 레거시 날조 시드 17건 삭제 + 리뷰 0건 "신규" UI). 잔존 Unsplash는 도시 에디토리얼 6건(이미지 출처 명시)만
- [x] C9. Cloudflare CPU 한도 → 완료 (469200e / `PBKDF2_ITERATIONS` env 범위조절 + drift 시 자동 rehash + `GO_LIVE_CHECKLIST.md` 유료 플랜 전제 명시). 기본 100k 유지. 유닛 crypto 통과
- [x] (원장 외 추가수정) B1/B7 환불 인식취소 분개 누락 → 완료 (469200e / `domain/ledger.ts` fulfilmentReversedPartial + `booking-service.ts` recognitionReversalStmts/unrecordedFeeMinor, applyRefundSucceeded·applyExternalCancel 장착). run당 stranded 6건 → 0건, E2E ledger 통과
- [x] (`806b37c`) C10. `brand.ts:34` "GDS·NDC 실시간 직연동 발권" 상수 — 사용처 0이지만 허위, 삭제 [S]

## 코드 밖 필수 (기존 OPEN_READINESS §5 + 보강)

기존 9종(토스 가맹·PII 키·판매주체 ACTIVE·Resend·Sentry·실공급사 계약·법무검토·도메인·파트너 실정보)에 더해:
- 여행업 등록(국외/국내, 기획상품 판매 시 종합여행업) + **영업보증보험 가입** — 체크리스트는 등록번호만 요구
- 통신판매업 신고 실등록(현재 표시 번호는 근거 없음 — 기존 P0 #8)
- 개인정보 처리위탁 계약(Cloudflare·Toss·Resend·Sentry) 및 국외이전 근거
- 정산 지급용 법인계좌·이체 수단, 세금계산서 발행 수단
- 고객센터 전화·운영시간(사업자 정보 표시 의무)
