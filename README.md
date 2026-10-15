# ✈️ getfortrip Global OTA Platform

> **글로벌 최고 수준의 종합 여행 플랫폼(OTA) getfortrip 프로젝트**  
> Go 1.23+ 코어 백엔드 엔진, Nuxt 3 SPA 사용자 웹, Vue 3 Vite 관리자 콘솔, PostgreSQL 16 스키마 및 Zero-Mock 실데이터 연동.

- **공식 플랫폼명**: `getfortrip`
- **예정 도메인**: `getfortrip.com`
- **실서버 배포**: `https://ota-hub.dnjstjqppk.workers.dev`

---

## 🚀 빠른 시작 가이드 (Quick Start)

### 1. 백엔드 코어 엔진 (Go 1.23+)
- **위치**: `backend/`
- **실행 포트**: `http://localhost:8080`
```powershell
cd backend
go run cmd/api/main.go
# 또는 컴파일된 바이너리 실행:
.\server.exe
```
- **주요 엔드포인트**:
  - `GET /health`: 헬스체크 (`service: getfortrip-core-engine`)
  - `GET /api/v1/search/suggest`: getfortrip 전 도메인 자동완성 검색
  - `GET /api/v1/hotels`: 숙소 필터 검색
  - `GET /api/v1/flights`: 항공권 검색
  - `GET /api/v1/trains`: KTX / 신칸센 기차표
  - `GET /api/v1/cars`: 렌터카 및 공항픽업
  - `GET /api/v1/activities`: 투어 티켓 및 5G eSIM
  - `GET /api/v1/packages`: 항공+호텔 다이내믹 패키지
  - `POST /api/v1/bookings/calculate`: 정밀 환율/세금/할인 계산기
  - `POST /api/v1/bookings`: 15분 재고 락(Lock) 가예약 생성
  - `POST /api/v1/bookings/:id/pay`: 결제 승인 및 바우처 즉시 발급
  - `GET /api/v1/admin/dashboard`: 실시간 GMV 및 도메인 지표
  - `GET /api/v1/sse/events`: 실시간 가격/예약 변동 SSE 스트리밍

---

### 2. 사용자 웹 프론트엔드 (TypeScript + Vue 3 + Nuxt 3 + Tailwind CSS)
- **위치**: `frontend-user/`
- **실행 포트**: `http://localhost:3000`
```powershell
cd frontend-user
# 개발 서버 실행:
npm run dev
# 또는 정적 배포 빌드:
npm run generate
```
- **구현 페이지**:
  - `/`: 메인 홈 (GNB, 7대 도메인 탭 위젯, 타임딜 배너, 추천 도시, getfortrip Best)
  - `/hotels/list`: 숙소 검색 리스트 (12개 필터, 지도 분할 Map View)
  - `/hotels/:id`: 호텔 상세 (객실 타입/취소규정 비교 매트릭스, AI 리뷰)
  - `/hotels/booking`: 체크아웃 (실시간 계산기, 쿠폰/코인 차감, 즉시 발권)
  - `/flights/search`: 항공권 검색 (전후 7일 최저가 바, 직항 필터)
  - `/trains`: 고속철도 스케줄 및 승차권
  - `/cars`: 렌터카 및 공항 픽업/샌딩
  - `/things-to-do`: 명소 입장권, 일일투어, 5G eSIM
  - `/packages/builder`: 항공+호텔 결합 할인 패키지
  - `/moments`: 여행 모먼트 (getfortrip Moments) 포토 피드 및 작성
  - `/trip-best`: 2026 연간 호텔/명소 랭킹 어워드 (getfortrip Best)
  - `/deals`: 프로모션 및 쿠폰 다운로드 센터
  - `/rewards`: 회원 등급(Silver~Diamond+) 진행률 및 getfortrip 코인(G-Coins) 원장
  - `/my/bookings`: 전 도메인 통합 예약 관리, 바우처 출력 및 셀프 취소
  - `/help`: 24/7 고객센터 FAQ 및 1:1 상담

---

### 3. 관리자 콘솔 백오피스 (TypeScript + Vue 3 + Vite + Tailwind CSS)
- **위치**: `frontend-admin/`
- **실행 포트**: `http://localhost:3001`
```powershell
cd frontend-admin
npm run dev
# 또는 프로덕션 미리보기:
npm run preview -- --port 3001 --host
```
- **8대 관리자 모듈**:
  - `/dashboard`: 실시간 GMV, 일간 예약량, 도메인별 점유율, API 헬스체크
  - `/catalog`: 7대 도메인 상품 마스터 데이터 및 재고 제어
  - `/pricing`: 실시간 환율(FX) 테이블 및 가격 엔진 시뮬레이터
  - `/bookings`: 예약/발권 OMS (상태 전이 강제 집행, 수동 PNR 발권, 환불 승인)
  - `/promotions`: 프로모션 코드 발급 및 getfortrip 코인 제어
  - `/community`: getfortrip 모먼트 및 리뷰 CMS 검수
  - `/support`: 1:1 상담 티켓 및 결항/천재지변 긴급 공지 배너 발송
  - `/settlements`: 공급사 정산 대사 및 RBAC 관리자 작업 감사 로그

---

### 4. 데이터베이스 및 마이그레이션 (PostgreSQL 16)
- **위치**: `database/migrations/`
  - `000001_init_trip_schema.up.sql`: 14개 정규화 테이블 DDL
  - `000001_init_trip_schema.down.sql`: 롤백 DDL
  - `000002_seed_data.sql`: 7대 도메인 실데이터 시드

---

### 5. 브랜드 거버넌스 및 무결성 검증
```powershell
npm run check:branding
```
모든 커밋 및 빌드 파이프라인에서 getfortrip 단일 브랜드 명칭과 거버넌스 룰을 엄격히 검증합니다.
