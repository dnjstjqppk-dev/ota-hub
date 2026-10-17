# getforTrip OTA — Provider API Integration Matrix

## 1. 개요
getforTrip 글로벌 OTA의 각 도메인별 공식 연동 공급사(Provider/GDS/PMS/Aggregator), 연동 프로토콜, SLA 및 장애 대응 매트릭스입니다.

---

## 2. 도메인별 연동 공급사 매트릭스

| 도메인 | 주 공급사 (Primary) | 보조 공급사 (Secondary) | 연동 프로토콜 | 실시간성 (SLA) | 장애 시 폴백(Fallback) 정책 |
|---|---|---|---|---|---|
| **호텔 (Hotels)** | Hotelbeds, WebBeds | 직계약 B2B PMS (Siteminder, D-EDGE) | REST JSON, SOAP/XML | p95 < 800ms | 2차 어그리게이터 자동 재시도, 실패 시 즉시 전액 환불 |
| **항공 (Flights)** | Amadeus (NDC / 1A) | Sabre (1S), 직연동 LCC (Navitaire) | NDC REST API, Edifact | p95 < 1,500ms | 1A 응답 지연(>2s) 시 1S 보조 GDS 스위칭 |
| **기차 (Trains)** | 코레일 KTX/SRT API, JR Systems (일본) | SilverRail (유럽 유로스타/TGV) | REST JSON, Proprietary Socket | p95 < 1,000ms | 발권 실패 시 3회 지수 백오프 재시도 |
| **렌터카 (Cars)** | Rentalcars Connect, Cartrawler | 롯데렌터카/SK렌터카 직연동 API | REST JSON | p95 < 1,200ms | 대체 차종(동급 이상) 무료 업그레이드 제공 |
| **투어/티켓 (Things-to-Do)**| Klook B2B, Viator Partner API | 현지 직계약 바우처 발급사 | REST JSON, Webhook | p95 < 600ms | 즉시 확정 불가 상품은 2시간 이내 수동 승인 큐 이관 |
| **공항 픽업 (Transfers)** | Mozio, Talixo | 현지 프리미엄 리무진 협력사 | REST JSON, FlightStats API | p95 < 500ms | 항공기 지연 추적 자동 연동, 기사 배정 실패 시 긴급 콜밴 파견 |
| **전자결제 (PG)** | 토스페이먼츠 (Toss Payments) | Stripe (글로벌 외화), 카카오페이, 네이버페이 | REST JSON, Webhook HMAC-SHA256 | p95 < 400ms | PG 장애 시 보조 결제 수단 자동 제안 |

---

## 3. 웹훅 및 비동기 상태 동기화 규격
1. **항공 PNR 상태 변경 (Schedule Change / Cancellation)**:
   - Amadeus Notification Webhook을 수신하여 고객에게 알림톡/SMS 자동 발송.
2. **호텔 PMS 실시간 재고 갱신 (ARI Webhook)**:
   - 파트너사의 객실 매진 이벤트 수신 시 Cloudflare KV 및 Redis 캐시를 50ms 이내에 즉시 Invalidate.
3. **결제 웹훅 멱등성 (Idempotency)**:
   - PG사로부터 중복 웹훅이 수신되더라도 `transaction_code` 고유 키를 기반으로 단 1회만 결제 승인 원장에 반영.

