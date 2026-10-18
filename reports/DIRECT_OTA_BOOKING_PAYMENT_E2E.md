# [직접 결제형 OTA 예약·결제 E2E 아키텍처 및 상태머신 명세서] getforTrip Direct Booking & Payment Lifecycle

**문서 번호:** SPEC-OTA-E2E-20261018-01  
**작성일자:** 2026-10-18  
**상태머신 엔진:** `backend/internal/engine/state_machine.go` & `worker/index.ts`  
**보안 원칙:** 결제 없는 확정 금지 (Zero Unpaid Confirmation), 공급사 확정 전 바우처 발급 금지 (Zero Unconfirmed Voucher)

---

## 1. 비즈니스 모델 분리: 직접 결제형 OTA vs 제휴 아웃링크 메타서치

getforTrip 플랫폼은 상용 거래의 안정성을 위해 거래 흐름을 명확히 이원화하여 처리한다:

```
[사용자 상품 탐색]
       |
       +---> [제휴사 위탁 상품 (Meta-Search Outlink)]
       |        |-- 암호화 서명 딥링크 생성 (/out/:partner/:itemId)
       |        |-- D1 클릭 원장 기록 (affiliate_clicks)
       |        |-- 제휴사(Trip.com, Agoda 등) 웹 결제 완료
       |        +-- S2S 웹훅 수신 (/api/v1/webhooks/postback) -> 전환 확정
       |
       +---> [자체 직접 결제 상품 (Direct OTA Booking)]
                |-- 서버 측 견적 및 재고 잠금 (15분 타임아웃)
                |-- 결제 대기 주문 생성 (status: PENDING_PAYMENT, voucher: NULL)
                |-- 공인 PG 결제창 호출 (PortOne / Toss Payments)
                |-- PG사 S2S 결제 통보 웹훅 수신 및 금액 교차 검증
                |-- 공급사(Bedbank/GDS) 실제 예약 확정 API 호출
                +-- 공급사 PNR 수신 시 최종 CONFIRMED 및 QR 바우처 발급
```

---

## 2. 8단계 엄격 상태머신 (Strict State Machine)

| 상태 코드 | 상태 명칭 | 허용 가능한 전이 조건 | 바우처 발급 여부 | 고객 안내 문구 |
|---|---|---|:---:|---|
| **`PENDING_PAYMENT`** | 결제 대기 | 주문서 생성 완료, 재고 15분 잠금 | ❌ 불가 (`NULL`) | "결제 기한 내에 결제를 완료해주세요." |
| **`PAYMENT_PROCESSING`** | 결제 승인 중 | PG사 승인 요청 진행 중 | ❌ 불가 (`NULL`) | "결제 승인 여부를 확인하고 있습니다." |
| **`PAID`** | 결제 완료 | PG 실거래 웹훅 수신 및 금액/통화 100% 일치 확인 | ❌ 불가 (`NULL`) | "결제가 확인되었습니다. 공급사에 예약을 요청 중입니다." |
| **`SUPPLIER_REQUESTED`**| 공급사 예약 중 | 공급사 API(Bedbank/GDS)에 예약 전문 발송 | ❌ 불가 (`NULL`) | "호텔/항공사에 최종 확정을 요청하고 있습니다." |
| **`CONFIRMED`** | 예약 및 발권 확정 | 공급사 PNR/확정번호 수신 완료 | **✅ 발급 (`VCHR-*`)** | "예약이 확정되었습니다. E-티켓 바우처를 확인하세요." |
| **`SUPPLIER_FAILED`** | 공급사 마감/실패 | 객실 소진 또는 항공 운임 변동으로 발권 실패 | ❌ 취소 | "공급사 마감으로 예약이 실패했습니다. 전액 자동 환불됩니다." |
| **`AUTO_REFUNDED`** | 자동 환불 완료 | `SUPPLIER_FAILED` 발생 시 PG 결제 취소 API 자동 실행 | ❌ 파기 | "결제 금액이 카드사로 전액 환불 접수되었습니다." |
| **`CANCELLED`** | 고객/관리자 취소 | 취소 규정에 따른 위약금 차감 후 환불 완료 | ❌ 무효화 | "예약이 정상적으로 취소되었습니다." |

---

## 3. P0-04 결함 조치: 클라이언트 임의 확정(`/pay`) 원천 차단

기존 코드에서는 로그인 세션이나 서명 헤더만 존재하면 `POST /api/v1/bookings/:id/pay` 호출로 즉시 `CONFIRMED` 처리되던 치명적 결함이 존재했다.

### 수정 코드 및 동작 원리 (`worker/index.ts`):
```typescript
// P0-04: Reject direct client-side payment confirmation!
if (path.startsWith("/api/v1/bookings/") && path.endsWith("/pay") && method === "POST") {
  return json(
    {
      error: "DIRECT_CONFIRMATION_FORBIDDEN: 클라이언트 임의 결제 승인은 엄격히 차단됩니다. 검증된 PG 결제 웹훅 또는 공급사 거래 조회를 통해서만 확정됩니다.",
    },
    403
  );
}
```

### 바우처 발급 차단 원칙:
- 주문 생성 시 `voucher_code`는 무조건 `NULL`로 DB에 저장된다.
- 오직 공급사 확정번호가 서버 측에서 인증되었을 때만 유효한 `voucher_code`가 생성 및 노출된다.
- 실서버 E2E 검증(`[TEST 12]` 및 `[TEST 15]`):
  - 미결제 주문의 `voucherCode === null` 검증 통과 (PASS).
  - 클라이언트가 `/pay` 호출 시 `403 Forbidden` 차단 검증 통과 (PASS).

---

## 4. 공급사 예약 실패 시 보상 트랜잭션 (Saga Compensation Pattern)

1. **상황:** 고객 카드 승인은 완료(`PAID`)되었으나, 호텔/항공사 API 응답에서 `ROOM_SOLD_OUT` 또는 `FARE_EXPIRED` 발생.
2. **조치 절차:**
   - 즉시 상태를 `SUPPLIER_FAILED`로 전이.
   - PG 결제 취소 API(`POST /v1/payments/{paymentKey}/cancel`) 비동기 호출.
   - D1 원장에 환불 원장 기록 및 상태를 `AUTO_REFUNDED`로 전환.
   - 알림톡/이메일로 고객에게 즉각 안내 발송.
   - 관리자 OMS 대시보드에 긴급 처리 건으로 플래그 표시.

이로써 고객이 돈만 지불하고 객실을 배정받지 못하거나, 유효하지 않은 가짜 바우처를 들고 공항/호텔에 방문하는 사고가 원천 차단된다.

