# [웹훅 및 결제 보안 전수검증 보고서] getforTrip S2S Webhook & Payment Security Audit

**문서 번호:** TEST-SEC-WEBHOOK-20261018-01  
**작성일자:** 2026-10-18  
**테스트 스크립트:** `scripts/verify-production.js` (TEST 16, 17, 19, 20)  
**대상 호스트:** `https://ota-hub.dnjstjqppk.workers.dev/api/v1/webhooks/postback`  
**판정:** **전 항목 무결점 통과 (PASS)**

---

## 1. 웹훅 보안 방어 매트릭스

| 테스트 항목 | 테스트 시나리오 | 전달 파라미터 / 헤더 | 기대 상태 | 실제 응답 | 판정 |
|---|---|---|:---:|:---:|:---:|
| **WH-01** | 고정 테스트 백도어 서명(`test_sandbox_verified_sig`) 전송 | `X-Signature: test_sandbox_verified_sig` | **403 Forbidden** | `403 Forbidden` | **PASS** |
| **WH-02** | 타임스탬프 누락 요청 전송 | `X-Signature: <valid_format>`, 타임스탬프 누락 | **400 Bad Request** | `400 Bad Request` | **PASS** |
| **WH-03** | 서명 누락 요청 전송 | 타임스탬프 존재, 서명 헤더 누락 | **400 Bad Request** | `400 Bad Request` | **PASS** |
| **WH-04** | 300초(5분) 초과 만료된 타임스탬프 전송 (Replay Attack) | `X-Timestamp: <now - 600s>` | **403 Forbidden** | `403 Forbidden` | **PASS** |
| **WH-05** | 비인가된 가짜 결제 증명 헤더 전송 (`X-Payment-Proof`) | `X-Payment-Proof: fake_receipt` | **401 Unauthorized** | `401 Unauthorized` | **PASS** |
| **WH-06** | 미등록 제휴사 식별자로 웹훅 전송 | `partner: unknown_partner` | **404 Not Found** | `404 Not Found` | **PASS** |
| **WH-07** | 합법적인 HMAC-SHA256 암호화 서명 전송 | 정규 파트너 시크릿 키 기반 서명 + 현재 시각 | **200 OK** | `200 OK (CONFIRMED)` | **PASS** |
| **WH-08** | 동일한 주문 번호로 웹훅 재전송 (Idempotency) | 동일한 `order_id` / `click_id` 재호출 | **200 OK (Idempotent)** | `200 OK (중복 무시)` | **PASS** |

---

## 2. 타이밍 공격 방어 및 서명 대사 구현

```typescript
// P0-05: Constant-time comparison prevents side-channel timing analysis
function constantTimeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

- 서명 비교 시 일반적인 문자열 `===` 비교 대신 비트 단위 XOR 연산의 `constantTimeCompare`를 적용하여 타이밍 공격을 방어함.
- 타임스탬프 오차 허용 범위를 300초 이내로 강제하여 네트워크 패킷 스니핑 후 재전송하는 리플레이 공격을 완벽히 차단함.
- 멱등성 검사를 통해 이미 확정된 거래에 대해 중복 커미션이 지급되거나 주문 상태가 비정상 변경되는 것을 원천 차단함.

