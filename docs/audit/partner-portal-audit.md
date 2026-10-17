# getforTrip OTA — Partner Portal Audit Report

## 1. 개요 및 B2B 목적
getforTrip 파트너 포털(Partner Portal)은 호텔 체인, 렌터카 업체, 투어사, 차량 기사 등 입점 공급사(Supplier)가 자사의 상품, 가격, 재고를 직접 관리하고 예약 바우처를 수신하는 B2B 시스템입니다.

- **포털 진입점**: `/partner/login/`
- **관리 대시보드**: `/partner/`
- **주문 접수처**: `/partner/bookings/`
- **상품 및 재고(ARI)**: `/partner/products/`
- **법인 및 정산 설정**: `/partner/settings/`
- **B2B 연동 API 문서**: `/partner/api-docs/`

---

## 2. P0 결함 조치 결과 및 보안 감사

### 2.1 비로그인 개인정보 노출 차단 (P0-01 조치 완료)
- **점검 내용**: 비로그인 상태에서 `/partner/` 및 하위 경로 접근 시 파트너 대시보드, 고객명, 연락처, API 키가 노출되는지 여부 전수 조사.
- **조치 결과**: 
  - 미인증 요청에 대해 클라이언트 및 SSR 수준에서 로그인 게이트웨이 화면만 출력되도록 접근 제어 강화.
  - 로그인 폼의 하드코딩된 데모 계정 자동완성(demo selector)을 완전히 제거하여 보안 권고 준수.
  - 모든 실제 고객 개인정보는 B2B 공급사에게도 마스킹 처리(`김*수`, `010-****-5678`)되어 표시되도록 필터링.

### 2.2 파트너사 데이터 격리 (Multi-Tenant Data Isolation)
- 파트너 포털의 모든 API 요청은 헤더의 `Authorization: Bearer <Partner_JWT>`를 기반으로 백엔드에서 `partner_id`를 검증합니다.
- 파트너 A는 파트너 B의 예약, 객실, 가격, 정산 데이터를 절대로 조회하거나 조작할 수 없습니다 (Row Level Security 및 Go 미들웨어 이중 격리).

### 2.3 OpenAPI v1.4 REST 명세서 정식 배포 (`/partner/api-docs`)
- **배경**: 기존 푸터의 "OpenAPI 문서" 링크가 잘못된 설정 경로(`/partner/settings`)로 연결되어 있던 결함 해소.
- **제공 기능**:
  - `POST /api/v1/partner/ari`: Availability, Rate, Inventory 일괄 동기화 규격
  - `GET /api/v1/partner/bookings`: 자사 예약 목록 페이징 및 폴링 규격
  - `POST /api/v1/partner/bookings/{id}/confirm`: PMS 확정 PNR 반환 웹훅 규격
  - HMAC-SHA256 서명 기반 웹훅 보안 및 레이트 리밋 (분당 600회) 명세 완비.
