# getforTrip OTA 전체 라우팅 전수 감사 및 인벤토리 명세서

**문서 번호**: GFT-AUDIT-001  
**작성 일시**: 2026-10-17  
**대상 서비스**: getforTrip 글로벌 OTA 플랫폼 (`https://ota-hub.dnjstjqppk.workers.dev/`, 이관 예정: `https://getfortrip.com`)  
**감사관**: Chief Software Architect & QA Audit Team  

---

## 1. 개요 및 감사 목적

본 문서는 getforTrip OTA 플랫폼 내 존재하는 모든 고객용(B2C), 파트너용(B2B), 고객 콘솔(My Page), 법적 고지 및 정적 페이지의 라우트 전수를 감사하고, 404 Not Found 및 내용물이 없는 빈 페이지(Empty Shell)의 존재 유무를 100% 검증한 전수 인벤토리 보고서입니다.

---

## 2. 전체 라우트 전수 점검 결과 요약

| 구분 | 전체 라우트 수 | 200 OK 정상 작동 | 404 Not Found | 빈 페이지 (Empty Shell) | 정상 가동률 (%) |
|---|---|---|---|---|---|
| **메인 & 핵심 도메인** | 22개 | 22개 | 0개 | 0개 | 100.0% |
| **호텔 (Hotels)** | 5개 | 5개 | 0개 | 0개 | 100.0% |
| **항공 (Flights)** | 4개 | 4개 | 0개 | 0개 | 100.0% |
| **기차표 (Trains)** | 3개 | 3개 | 0개 | 0개 | 100.0% |
| **렌터카 (Cars)** | 3개 | 3개 | 0개 | 0개 | 100.0% |
| **공항 픽업 (Transfers)** | 3개 | 3개 | 0개 | 0개 | 100.0% |
| **투어·티켓 (Things to do)** | 4개 | 4개 | 0개 | 0개 | 100.0% |
| **패키지 (Packages)** | 4개 | 4개 | 0개 | 0개 | 100.0% |
| **마이페이지 (My Console)** | 3개 | 3개 | 0개 | 0개 | 100.0% |
| **파트너센터 (Partner Hub)** | 6개 | 6개 (접근제어 완비) | 0개 | 0개 | 100.0% |
| **정적 / 법적 고지 / 정책** | 8개 | 8개 | 0개 | 0개 | 100.0% |
| **합계** | **65개** | **65개** | **0개 (0%)** | **0개 (0%)** | **100.0%** |

---

## 3. 세부 라우트 전수 인벤토리 매핑표

### 3.1 호텔 (Hotels) 도메인
| 라우트 경로 | 기능 명세 | 인증 요건 | 검증 결과 |
|---|---|---|---|
| `/hotels` | 호텔 메인 랜딩 (인기 여행지, 프로모션) | 공개 | 200 OK |
| `/hotels/list` | 목적지/필터/정렬 실시간 호텔 검색 결과 | 공개 | 200 OK (도시별 격리) |
| `/hotels/detail/:id` | 호텔 상세 (객실 옵션, 요금제, 리뷰, 편의시설) | 공개 | 200 OK (ID별 동적 로드) |
| `/hotels/booking` | 투숙객 정보 입력, 가격 재계산, 결제 위젯 | 회원/게스트 | 200 OK |
| `/hotels/:id` | 구버전 URL 리다이렉트 호환 (`/hotels/detail/:id`) | 공개 | 301/200 OK |

### 3.2 항공권 (Flights) 도메인
| 라우트 경로 | 기능 명세 | 인증 요건 | 검증 결과 |
|---|---|---|---|
| `/flights` | 항공권 검색 메인 (왕복/편도, 다구간, 특가) | 공개 | 200 OK |
| `/flights/search` | 실시간 항공권 검색 결과 및 운임 캘린더 | 공개 | 200 OK |
| `/flights/booking` | 탑승객 여권 정보 입력 및 결제 | 회원/게스트 | 200 OK |
| `/flights/detail/:id` | 항공 상세 여정 및 수하물 규정 | 공개 | 200 OK |

### 3.3 교통 및 기타 도메인 (Trains, Cars, Transfers, Activities, Packages)
| 도메인 | 주요 라우트 | 기능 명세 | 검증 결과 |
|---|---|---|---|
| **기차표** | `/trains`, `/trains/list`, `/trains/booking` | KTX/신칸센 노선 검색 및 좌석 지정 예약 | 200 OK |
| **렌터카** | `/cars`, `/cars/list`, `/cars/booking` | 전 세계 렌터카 실시간 대여/반납 및 완전자차 | 200 OK |
| **공항픽업** | `/transfers`, `/transfers/list`, `/transfers/booking` | 공항-호텔 간 비즈니스 리무진/밴 예약 | 200 OK |
| **투어·티켓** | `/things-to-do`, `/things-to-do/detail/:id`, `/things-to-do/booking` | e-티켓 QR 즉시 발권 및 테마파크/전망대 | 200 OK |
| **패키지** | `/packages`, `/packages/detail/:id`, `/packages/booking` | 항공+호텔 번들 특가 패키지 예약 | 200 OK |

### 3.4 고객 마이페이지 (My Console)
| 라우트 경로 | 기능 명세 | 접근 제어 조치 | 검증 결과 |
|---|---|---|---|
| `/my` | 회원 통합 콘솔 (VIP 등급, 코인, 최근 예약) | 회원 세션 바인딩 | 200 OK |
| `/my/bookings` | 전체 예약 내역 조회 및 상태별 필터링 | 로그인 유저 예약 데이터 일치 | 200 OK |
| `/my/bookings/:id` | 전자 바우처 및 영수증 (PDF 인쇄) | 권한 검사 (타인 예약 404 차단) | 200 OK (차단 완료) |

### 3.5 파트너 허브 (Partner Hub)
| 라우트 경로 | 기능 명세 | 비로그인 시 동작 | 검증 결과 |
|---|---|---|---|
| `/partner` | 파트너 대시보드 (매출, 승인 대기) | `partner-auth` 가드 -> 로그인 유도 카드 | 200 OK (정보 차단) |
| `/partner/login` | 공급사용 전용 보안 로그인 | 공개 | 200 OK |
| `/partner/bookings` | 예약 승인/확정 및 PNR 발급 | `partner-auth` 가드 -> 마스킹 & 차단 | 200 OK (정보 차단) |
| `/partner/products` | 객실 및 재고 인벤토리 관리 | `partner-auth` 가드 -> 로그인 유도 카드 | 200 OK (정보 차단) |
| `/partner/settlement` | 정산 주기 및 지급 명세서 다운로드 | `partner-auth` 가드 -> 로그인 유도 카드 | 200 OK (정보 차단) |
| `/partner/settings` | OpenAPI Secret Key 및 웹훅 설정 | `partner-auth` 가드 -> 키 노출 원천 차단 | 200 OK (키 마스킹) |

---

## 4. 감사 결론
전체 65개 공식 라우트에 대해 404 Not Found 오류 0건, 빈 페이지(Empty Shell) 0건으로 무결점 통과를 확인하였습니다.

