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

- A1. **회원탈퇴 없음.** API·UI 0. `privacy.vue:48`은 "탈퇴 시 즉시 파기"를 약속. 탈퇴 + 거래기록 법정보존분 분리·익명화 필요 [M]
- A2. **약관 동의 이력 미저장.** `auth.ts:39-47`은 동의 여부만 검사하고 버전·시각을 저장하지 않음(`marketing_consent`만 저장). `legal_documents` 버전과 연결 0 → 개정 시 재동의 불가 [M]
- A3. **결제 시 간주동의.** `checkout/index.vue:333` "결제하면 동의한 것으로 봅니다". 공급사에 여행자 정보 제공(제3자 제공) 별도 명시 동의 + 기록 필요 [S]
- A4. 마케팅 수신동의 변경/철회 UI·API 없음, 동의일 미기록 [S]
- A5. **푸터 사업자 표시 누락.** `GlobalFooter.vue:52`는 상호·신고번호만 표시. 대표자·주소·사업자등록번호·전화·호스팅제공자 없음 [S]
- A6. 개인정보처리방침: 보호책임자 성명·직책 없음(`privacy.vue:81` 팀명+메일). 처리위탁·국외이전(Cloudflare·Toss·Resend·Sentry) 고지 0건 [S]
- A7. "통신판매 중개" 표시(`GlobalFooter.vue:54`, checkout:333) vs 1P 직판(`ptn_direct_01`, MERCHANT_OF_RECORD) 모순 → 판매형태별 고지 분리 [S]
- A8. 회원 정지 불가 (`admin.ts:848` NOT_SUPPORTED). 사기·부정사용 대응 수단 없음 [M]

## 신규 B — 돈·정산

- B1. **PG 측 취소 미반영.** `webhooks.ts`는 UNKNOWN 결제만 재조회. 토스 대시보드 취소·부분취소·차지백 시 돈은 나갔는데 예약은 확정 유지 [M]
- B2. **이용 전 지급 가능.** 정산행이 바우처 발급 시점에 PENDING으로 생성(`booking-service.ts:872`), settle은 PENDING/HELD면 바로 지급(`marketplace.ts` settle). 이용완료·취소기한 경과 게이트 없음 [S]
- B3. **지급 후 환불 환수 없음.** 환불 시 정산 REFUNDED 전환은 PENDING/HELD만(`booking-service.ts:943`). SETTLED 건은 플랫폼 손실, 다음 정산 상계 없음 [M]
- B4. 실제 지급 수단 없음. "지급 완료 처리"는 상태 변경뿐. 대량이체 파일/펌뱅킹/정산명세서 없음 [M]
- B5. 수수료 세금계산서 발행 없음(`tax_invoice_email` 수집만) [M]
- B6. 고객 결제영수증 노출 없음(`payments.raw_json`에만 잘려 저장) [S]
- B7. **어드민 임의 취소·부분환불·오프라인환불 기록 없음.** supplier-decision은 CONFIRM/REJECT/RETRY_REFUND만(`booking-service.ts:1190-1218`). 확정 후 공급사 취소·불가항력·CS 보상 처리 불가 [M]
- B8. (권장) 결제수단 카드 단일(`checkout/index.vue:142`). 간편결제·계좌이체 없음 [M]

## 신규 C — 운영·상품·인프라

- C1. **파일 업로드 인프라 0.** R2 바인딩·업로드 엔드포인트 없음 → 사업자등록증·통장사본(`business_cert_url` 쓰기 경로 0), 상품 이미지, 리뷰/모먼트 사진 불가. 파트너가 서류 없이 승인됨 [L]
- C2. 사업자 진위확인(국세청 상태조회) 없음 [S]
- C3. **알림 4종뿐**(PASSWORD_RESET·PRICE_ALERT·BOOKING_CONFIRMED·FLIGHT_TICKETED). 결제완료·접수, 취소접수, 환불완료, 공급사 거절, 결제만료, 문의답변, 파트너 신규주문·승인/반려 없음. SMS/KAKAO는 enum만 있고 발송기 없음(`email-service.ts:117`). 기존 #120 확장 [M]
- C4. 메일 처리량 상한: 크론 5분당 20건(`flushOutbox` limit 20) = 시간당 240건 [S]
- C5. **일정 변경 기능 없음**인데 정책 화면에 "일정 변경 가능" 표시(`hotels/detail/[id].vue` PolicyNotice) [M]
- C6. 고객에게 보이는 다단계 취소수수료(tiers)가 환불 계산엔 미적용 — 기존 #16을 표시·광고 문제로 격상 [M]
- C7. **신규 상품 SEO 미렌더.** static preset이 하드코딩 ID만 prerender(`nuxt.config.ts:24-60`). 어드민/파트너 등록 상품은 SPA 셸만 나가는데 사이트맵엔 노출 [M]
- C8. **상품 콘텐츠 전반 출처 문제.** 실존 호텔(시그니엘 등)에 Unsplash 스톡 이미지 148건 + 임의 편의시설(`hotelCatalog.ts:52-75`). 홈 "평점 높은 호텔"·trip-best 랭킹도 날조 평점 기반. 기존 #60보다 범위 넓음 [L]
- C9. (미확인) Cloudflare 플랜·한도: PBKDF2 100k(`crypto.ts:68`), D1 단일 DB 용량, Time Travel 보존기간. 플랜에 따라 CPU 한도 초과 가능 [S]
- [x] (`806b37c`) C10. `brand.ts:34` "GDS·NDC 실시간 직연동 발권" 상수 — 사용처 0이지만 허위, 삭제 [S]

## 코드 밖 필수 (기존 OPEN_READINESS §5 + 보강)

기존 9종(토스 가맹·PII 키·판매주체 ACTIVE·Resend·Sentry·실공급사 계약·법무검토·도메인·파트너 실정보)에 더해:
- 여행업 등록(국외/국내, 기획상품 판매 시 종합여행업) + **영업보증보험 가입** — 체크리스트는 등록번호만 요구
- 통신판매업 신고 실등록(현재 표시 번호는 근거 없음 — 기존 P0 #8)
- 개인정보 처리위탁 계약(Cloudflare·Toss·Resend·Sentry) 및 국외이전 근거
- 정산 지급용 법인계좌·이체 수단, 세금계산서 발행 수단
- 고객센터 전화·운영시간(사업자 정보 표시 의무)
