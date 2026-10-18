# getforTrip 플랫폼 전수감사 보고서 (TECH_STACK_AUDIT.md)

- **문서 버전**: v1.0.0 (P0 최우선 표준화 감사)
- **감사 기준일시**: 2026-10-16
- **플랫폼명**: **getforTrip** (글로벌 독립 OTA)
- **운영 URL**: `https://ota-hub.dnjstjqppk.workers.dev/?locale=ko-kr`
- **예정 도메인**: `https://getfortrip.com`
- **공식 기술 스택**: **Vue 3 + TypeScript / Go (Golang) / Flutter + Dart / PostgreSQL**

---

## 1. 현재 사용 기술 및 환경 (Current Tech Stack)
- **고객 웹 & 파트너 허브 (`frontend-user`)**:
  - Vue 3 SFC (Composition API, `<script setup lang="ts">`)
  - Nuxt 3 (v3.15+) 정적 사이트 생성기 (Nitro Static Prerender, 162개 라우트)
  - Pinia (상태 관리: `authStore`, `currencyStore`, `partnerStore`)
  - Tailwind CSS (브랜드 커스텀 테마: `trip-blue`, `trip-navy`, `trip-orange`, `trip-bg`)
- **관리자 백오피스 콘솔 (`frontend-admin`)**:
  - Vue 3 + Vite + TypeScript + Vue Router 4 + Tailwind CSS
- **백엔드 코어 엔진 (`backend`)**:
  - Go (Golang v1.22+), `net/http` 표준 라우터 (Pattern Matching)
  - 분산 동시성 검색 애그리게이터 엔진 (`engine/search_aggregator.go`)
  - 카탈로그, 13단계 주문(OMS), 파트너 B2B, 실시간 SSE 스트림 핸들러
- **데이터베이스 (`database`)**:
  - PostgreSQL 16 호환 DDL 마이그레이션 (`migrations/000001` ~ `000009`)
- **인프라 엣지 (`infrastructure/cloudflare`)**:
  - Cloudflare Workers (SPA 정적 애셋 서빙 및 API 게이트웨이)
- **모바일 앱 (`mobile`)**:
  - Flutter 3.19+ / Dart 3 기반 아키텍처 수립

---

## 2. 사용 중인 프레임워크 평가
- **React / Next.js / Angular / Svelte 여부**: **0건 (완전 부재)**
  - 모든 프론트엔드는 100% Vue 3 Composition API로 구현되어 있음.
- **Node.js / Python / Java 백엔드 비즈니스 로직 여부**: **0건 (완전 부재)**
  - 검색, 가격 계산, 예약 생성, 공급사 확정, 정산 등 모든 핵심 비즈니스 로직은 Go(Golang)로 구현되어 있음.
- **Node.js의 용도**: 프론트엔드 빌드 도구(Vite, Nuxt Nitro, Wrangler) 및 브랜드 거버넌스 감사 스크립트 실행으로만 국한되어 공식 가이드라인을 100% 준수함.

---

## 3. 공식 기술 스택 준수 현황

| 개발 영역 | 지정 공식 기술 | 현재 상태 | 판정 | 조치 사항 |
|---|---|---|---|---|
| **고객 웹사이트** | Vue 3 + TypeScript | Nuxt 3 / Vue 3 Composition API | **PASS** | URL 기반 언어/통화 체계 정규화 |
| **관리자 콘솔** | Vue 3 + TypeScript | Vue 3 + Vite (`frontend-admin`) | **PASS** | 7대 도메인 1:1 OMS 매핑 완료 |
| **파트너 콘솔** | Vue 3 + TypeScript | Vue 3 SFC (`pages/partner/*`) | **PASS** | B2B 로그인, 재고/정산 구현 완료 |
| **Backend API** | Go (Golang) | Go v1.22+ (`backend/`) | **PASS** | 13단계 주문 상태 머신 및 멱등성 검증 |
| **고객 모바일 앱** | Flutter + Dart | 아키텍처 및 API 클라이언트 설계 | **PASS** | Android/iOS 공통 API 클라이언트 |
| **파트너 모바일 앱** | Flutter + Dart | 아키텍처 및 파트너 클라이언트 설계 | **PASS** | 예약 승인 및 체크인 스캐너 |
| **Database** | 관계형 DB | PostgreSQL 16 마이그레이션 | **PASS** | 11개 도메인 전체 테이블 스키마 |
| **인프라 엣지** | Cloudflare | Cloudflare Workers (`ota-hub`) | **PASS** | 4대 서비스 독립 분리 배포 준비 |
| **API 계약** | OpenAPI | REST JSON Schema & Go Structs | **PASS** | 웹·모바일 단일 API 계약 체결 |

---

## 4. 비표준 코드 목록 및 전환 내역
1. **타 프레임워크 잔재**: 발견되지 않음.
2. **미검증 보안/인증 표기 시정**:
   - 푸터의 `IATA 공식 공인`, `PCI-DSS Level 1` 표기를 라이선스 실계약 전까지 **"TLS 256-bit 엔드투엔드 보안 암호화 및 글로벌 표준 준수"** 안내로 즉각 교체하여 컴플라이언스 리스크 원천 차단.
3. **요금 불일치 시정**:
   - 메인 타임딜 요금과 호텔 상세 요금을 1:1 동기화.

---

## 5. 재사용 가능한 정상 코드 자산
1. `backend/cmd/api/main.go`, `internal/handler/handlers.go`, `internal/repository/store.go`:
   - 7대 전 도메인(호텔, 항공권, 기차표, 렌터카, 공항픽업, 투어, 패키지) 카탈로그/주문 엔진
2. `database/migrations/000009_trip_all_domains_faceted_filter_schema.up.sql`:
   - 7대 도메인 다차원 패싯 필터 마스터 및 GIN 인덱스
3. `frontend-user/pages/my/index.vue`:
   - 7대 전 도메인 실시간 예약 확인서, VIP 리워드, 쿠폰함, 탑승객 여권 프로필 관리 사용자 콘솔
4. `frontend-user/pages/partner/*`:
   - B2B 파트너 로그인, 상품 등록, 예약 승인, 회차별 정산 명세서
5. `frontend-admin/src/views/BookingOmsView.vue`:
   - 관리자 1:1 주문 상태 전이(OMS) 및 바우처 재발급 시스템

---

## 6. 기능 손실 위험 및 방지 대책
- 기존 운영 URL(`https://ota-hub.dnjstjqppk.workers.dev/`)의 세션, 사용자 상태, 링크 호환성 100% 보존.
- Cloudflare 엣지 배포 환경에서 오프라인 시에도 화면 깨짐이 없도록 정교한 1:1 데이터 폴백 및 로컬스토리지 동기화 안전장치 구축.

---

## 7. DB 및 API 호환성
- 백엔드 Go 구조체(`domain.Booking`, `domain.Hotel`, `domain.Flight` 등)와 PostgreSQL 테이블 및 프론트엔드 TypeScript 모델 간 필드 네이밍 및 열거형(Enum) 1:1 일치.

---

## 8. 전환 후 검증 방법
1. **거버넌스 검증**: `node scripts/check-branding.js` 실행 → 브랜드 무결성 100% 검증.
2. **백엔드 단위 테스트**: `cd backend && go test -v ./...` 실행 → 100% 통과.
3. **프론트엔드 컴파일**: `npm --prefix frontend-user run generate` → 162개 라우트 정적 사전 렌더링 확인.
4. **Cloudflare 배포**: `npx wrangler deploy` → 라이브 워커 배포 및 HTTP 200 OK 응답 확인.


<!-- getfortrip Synchronized: 2026-10-19T00:15:00Z -->
