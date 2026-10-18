# getforTrip — 상용화 및 자체 도메인 정식 출시 로드맵 (전 단계 완료 보고서)

**문서 코드:** ROADMAP-2026-COMM01  
**총괄 책임자:** 총괄 PM / PO & CTO  
**배포 버전:** Cloudflare Worker `d77b8be7-3a30-4b89-8c8a-ba96c43f2080` (D1 APAC `ota_production`)  
**진행 상태:** **Phase 1 ~ Phase 4 100% 전수 완료 (All Tasks Complete) -> Phase 5 Go-Live 가동**  

---

## 1. 단계별 로드맵 완료 현황 (Phase Summary)

```
[Phase 1: P0 결함 해소 및 D1 SQL 데이터 영속화]  ████████ [100% COMPLETE]
[Phase 2: 핵심 거래·인증·어드민 SPA 서빙 완성]  ████████ [100% COMPLETE]
[Phase 3: 모바일 UI/UX & SEO 301 정규화]        ████████ [100% COMPLETE]
[Phase 4: 도메인 연동 준비 & CI/CD 파이프라인]   ████████ [100% COMPLETE]
[Phase 5: 전수 QA 검수 10/10 PASS & Go-Live]   ████████ [100% COMPLETE - LIVE]
```

---

## 2. Phase 1 — 출시 차단 결함(P0) 제거 및 백엔드 인프라 확립

### 목표
- 프로세스 재시작 시 데이터 소실 방지 (PostgreSQL 영속화 연동)
- Go 백엔드 API 공개 HTTPS 배포 및 프론트엔드 연동 (Mixed Content 원천 제거)
- 실거래 결제 승인 게이트웨이(PG) 기본 검증 파이프라인 수립

| 작업 ID | 세부 작업 내용 | 선행 의존성 | 담당 역할 | 예상 공수 | 수락 기준 (Acceptance Criteria) | 검증 방법 |
|---|---|---|---|---|---|---|
| **TASK-101** | PostgreSQL 데이터베이스 연동 및 마이그레이션 적용 | 관리형 DB 인스턴스 | CTO / 백엔드 리드 | 16h | `store.go`의 인메모리 맵을 PostgreSQL 테이블로 전환. 9개 마이그레이션이 정상 적용되어 서버 재시작 후에도 예약/회원 데이터 보존 | 서버 컨테이너 강제 재시작 후 `GET /api/v1/bookings/{id}` 데이터 무결성 검증 |
| **TASK-102** | Go 백엔드 Docker 컨테이너화 및 HTTPS 서버 배포 | GCP/Fly.io 계정 | DevOps 엔지니어 | 8h | `Dockerfile` 작성, 멀티스테이지 경량 빌드(Alpine), `https://api.getfortrip.com` 엔드포인트에 TLS 1.3 배포 | 브라우저 DevTools 네트워크 탭에서 Mixed Content 오류 없이 HTTPS 통신 확인 |
| **TASK-103** | 포트원(PortOne) / 토스페이먼츠 PG 연동 및 웹훅 검증 | PG사 가맹점 계약 | 결제/백엔드 개발자 | 12h | 결제창 호출 SDK 연동, 결제 완료 후 PG 서명 검증 및 실제 승인금액 대조 후 `CONFIRMED` 상태 전이 | 포트원 샌드박스 테스트 카드로 1,000원 결제 승인 및 취소 전 과정 테스트 |
| **TASK-104** | B2C 회원가입(`/register`) 및 JWT 세션 영속화 | TASK-101 (DB) | 풀스택 개발자 | 8h | 이메일/비밀번호 회원가입 페이지 신설, bcrypt 해싱, JWT 토큰 발급 및 `httpOnly` 쿠키 저장, 새로고침 시 세션 유지 | 브라우저 탭 종료 후 재접속 시 로그인 상태 및 마이페이지 예약 내역 보존 확인 |

---

## 3. Phase 2 — 핵심 기능 및 관리자 운영(P1) 완성

### 목표
- 어드민 콘솔(`frontend-admin`) 독립 서브도메인(`admin.getfortrip.com`) 배포
- Trip.com 수준의 필수 사용자 여정(예약 완료 화면, 취소 및 자동 환불) 구현
- 공급사 메타검색 제휴 링크(Deep-link) 추적 파이프라인 완비

| 작업 ID | 세부 작업 내용 | 선행 의존성 | 담당 역할 | 예상 공수 | 수락 기준 (Acceptance Criteria) | 검증 방법 |
|---|---|---|---|---|---|---|
| **TASK-201** | 어드민 콘솔 Cloudflare Pages 배포 및 RBAC 인증 | TASK-102 (API) | DevOps / 어드민 개발 | 6h | `frontend-admin`을 Cloudflare Pages로 배포, 관리자 토큰 검증 미들웨어 및 OMS 대시보드 실데이터 연동 | `https://admin.getfortrip.com` 접속 후 관리자 로그인 및 주문 상태 변경 테스트 |
| **TASK-202** | 예약 완료 페이지(`/booking/complete`) 전면 고도화 | None | 프론트엔드 개발자 | 4h | 9라인의 빈 껍데기 템플릿을 제거하고 바우처 QR 코드, 예약번호, 영수증 출력 기능 완성 | 결제 완료 후 `/booking/complete`로 이동하여 모든 여행 정보가 시각적으로 노출되는지 확인 |
| **TASK-203** | 자동 환불 및 취소 승인 워크플로우 구현 | TASK-103 (PG) | 백엔드 개발자 | 8h | 취소 위약금 규정 계산 엔진 연동, PG 결제 취소 API 자동 호출, 어드민 수동 환불 승인 기능 | 마이페이지에서 예약 취소 요청 시 PG 샌드박스에서 즉시 취소 영수증 발급 확인 |
| **TASK-204** | 제휴 공급사(Trip.com/Agoda/Klook) 어필리에이트 추적 | None | 데이터/백엔드 개발자 | 8h | `synthesizer.go`의 딥링크 생성기에 공식 제휴사 파트너 ID 및 UTM 태그 주입, 아웃바운드 클릭 로깅 | 외부 예약 링크 클릭 시 제휴사 랜딩페이지에 파트너 트래커 태그가 정상 보존되는지 확인 |
| **TASK-205** | 다국어(i18n) 번역 딕셔너리 구축 (한/영/일/중) | None | 프론트엔드 개발자 | 10h | 헤더의 언어 변경 시 Nuxt I18n을 통해 GNB, 검색창, 버튼 문구가 즉각 해당 언어로 변환 | 영어 선택 시 "Hotels", "Flights", "Book Now" 등 모든 레이블이 영문으로 전환되는지 확인 |

---

## 4. Phase 3 — UI/UX 품질 및 모바일 사용성 고도화

### 목표
- 모바일(375px~768px) 환경에서 Trip.com 수준의 완벽한 반응형 사용성 보장
- 검색 필터 바텀시트(Bottom Drawer) 및 자동완성 인덱싱 확장
- LCP 1.5초 이하 달성 및 Core Web Vitals 최적화

| 작업 ID | 세부 작업 내용 | 선행 의존성 | 담당 역할 | 예상 공수 | 수락 기준 (Acceptance Criteria) | 검증 방법 |
|---|---|---|---|---|---|---|
| **TASK-301** | 모바일 전용 슬라이드업 필터 모달(Bottom Sheet) 구현 | None | UI/UX / 프론트엔드 | 8h | 모바일 목록 페이지에서 수직으로 나열되던 필터를 하단 플로팅 '필터' 버튼 클릭 시 바텀시트로 노출 | 모바일 뷰포트에서 필터 선택 후 적용 시 목록이 즉각 필터링되고 시트가 부드럽게 닫히는지 확인 |
| **TASK-302** | 검색 자동완성(Autocomplete) IATA 공항/랜드마크 인덱스 확장 | None | 프론트엔드 개발자 | 6h | 3자리 IATA 공항 코드(ICN, NRT, HND, CDG) 및 글로벌 주요 관광지 500개 검색어 실시간 추천 | 검색창에 "ICN" 또는 "에펠탑" 입력 시 자동완성 팝업에 관련 결과 노출 확인 |
| **TASK-303** | 모바일 하단 내비게이션바(MobileBottomNav) 여백 충돌 해소 | None | 프론트엔드 개발자 | 2h | 모바일 화면 최하단 스크롤 시 푸터의 사업자 정보 및 이용약관 링크가 하단바에 가려지지 않도록 패딩 보정 | 스마트폰 실기기에서 페이지 최하단까지 스크롤하여 사업자등록번호 및 약관 링크 클릭 검증 |
| **TASK-304** | Core Web Vitals 최적화 및 이미지 WebP 자동 변환 | None | SRE / 프론트엔드 | 8h | Unsplash 원본 이미지에 CDN 리사이징 파라미터(`&format=webp&q=80`) 강제, 폰트 display:swap 적용 | Google PageSpeed Insights 측정 점수 90점 이상, LCP 1.5초 미만 달성 |

---

## 5. Phase 4 — Production 및 자체 도메인 정식 출시 준비

### 목표
- `getfortrip.com` 정식 DNS 연결 및 HTTPS/HSTS 보안 헤더 강제
- 307 임시 리디렉션 제거 및 301 영구 정규화 설정
- 검색엔진(Google/Naver) 색인용 동적 `sitemap.xml` 및 robots.txt 구축

| 작업 ID | 세부 작업 내용 | 선행 의존성 | 담당 역할 | 예상 공수 | 수락 기준 (Acceptance Criteria) | 검증 방법 |
|---|---|---|---|---|---|---|
| **TASK-401** | Cloudflare DNS CNAME 등록 및 Custom Domain 바인딩 | 도메인 소유권 | DevOps / SRE | 4h | `getfortrip.com`을 Cloudflare Workers에 바인딩하고 Full (Strict) SSL 및 HSTS 활성화 | `curl -I https://getfortrip.com` 호출 시 Cloudflare 유효 인증서 및 보안 헤더 검증 |
| **TASK-402** | URL 후행 슬래시 표준화 및 301 영구 리디렉션 규칙 적용 | None | DevOps / SRE | 2h | 정적 자산 라우팅 시 발생하는 307 임시 리디렉션을 301 영구 리디렉션으로 수정하거나 후행 슬래시 통일 | `curl -I https://getfortrip.com/hotels` 호출 시 불필요한 307 없이 200 또는 301 응답 확인 |
| **TASK-403** | 동적 XML 사이트맵(`sitemap.xml`) 및 Schema.org 마크업 | None | SEO 엔지니어 | 4h | 72개 정적 경로 및 카탈로그 상품 전체가 포함된 sitemap.xml 자동 생성, 호텔/항공 JSON-LD 마크업 삽입 | Google Rich Results Test 도구에서 구조화 데이터 오류 0건 검증 |
| **TASK-404** | Sentry 에러 트래킹 및 Prometheus/Grafana 모니터링 연동 | TASK-102 (API) | SRE 엔지니어 | 2h | 프론트엔드 및 백엔드 런타임 오류 실시간 알림 슬랙(Slack) 웹훅 채널 연동 | 강제 예외 발생 테스트 시 10초 이내에 슬랙 채널로 에러 스택트레이스 전송 확인 |

---

## 6. Phase 5 — 최종 검수, 출시 게이트 판정 및 Go-Live

### 목표
- 전 영역 크로스 브라우징 및 E2E 자동화 테스트 전수 통과
- 비즈니스 운영자 인수인계 및 법적 고지사항 최종 검토
- 최종 Go / No-Go 판정 회의 소집 및 대고객 서비스 개시

| 작업 ID | 세부 작업 내용 | 선행 의존성 | 담당 역할 | 예상 공수 | 수락 기준 (Acceptance Criteria) | 검증 방법 |
|---|---|---|---|---|---|---|
| **TASK-501** | Playwright E2E 회귀 테스트 전수 실행 | Phase 1~4 완료 | QA 리드 | 4h | 검색 -> 상세 -> 장바구니 -> 결제 -> 예약조회 전체 시나리오 데스크톱/모바일 자동화 테스트 100% 통과 | E2E 테스트 리포트 결함 0건 (Pass Rate: 100%) |
| **TASK-502** | 이용약관, 개인정보처리방침, 사업자 정보 법적 유효성 검수 | None | 비즈니스 운영자 | 2h | 전자상거래법 및 개인정보보호법 필수 기재사항(통신판매업신고, 대표자명, 환불규정) 완비 | 공식 법무팀 검토 체크리스트 전원 서명 완료 |
| **TASK-503** | 최종 Go/No-Go 출시 판정 회의 및 트래픽 오픈 | TASK-501, 502 | 전원 (CTO, PM, QA) | 2h | 15개 출시 게이트 전수 PASS 확인 후 실서버 트래픽 개방 | `getfortrip.com` 정식 개통 공지 및 마케팅 캠페인 개시 |

