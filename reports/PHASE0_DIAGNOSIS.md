# Phase 0 현황 진단 — getfortrip OTA 상용화 미션 (2026-11-07)

> 방법: 7개 병렬 진단 에이전트(3포털 뷰 전수 + Worker API + DB + 공통 + 모바일/검색) + 비판자 교차검증 + 1차 갭해소.
> 핵심 결함 3건(moments 상하행, 파트너 가드, product/staff PATCH 부재)은 부모가 원문 직접 재확인.
> 범례: WORKS=실데이터 동작 / BROKEN=깨짐 / MISSING=없음 / DUMMY=하드코딩 가짜.

## 0. 총평

- 관리자·파트너는 전 페이지 실데이터 동작. 깨짐은 엣지 2건뿐.
- 사용자는 핵심 예약결제 흐름은 실동작이나 DUMMY 5개·BROKEN 2개가 섞여 있음.
- Flutter 앱은 존재하지 않음(신규 제작 or 모바일웹 대체 판단 필요).
- Go 백엔드는 인메모리 목 API로 실트래픽 없음. 실서버는 Cloudflare Worker + D1.

## 1. 포털별 카운트

| 포털 | 라우트/뷰 | WORKS | BROKEN | DUMMY | MISSING(기능) |
|---|---|---|---|---|---|
| frontend-admin | 14뷰 | 14(3개 협소) | 0 | 0 | 배너관리자, 단독로그, 일반설정 |
| frontend-partner | 10라우트 | 10(2개 부분) | 2엣지 | 0 | 주문상세, 웹훅로그/테스트, 비번찾기, 승인상태 |
| frontend-user | 45+페이지 | 대부분 | 2 | 5 | 없음(전 링크 해소) |

## 2. 관리자(14/14 WORKS)

Dashboard, BookingOms(9상태칩+SidePanel), Catalog(읽기전용), Users(정지 없음-스키마 부재 고지),
Partners(승인/정산율), Settlements, Community, FeatureFlags, UrlIngestion, Suppliers 전부 실동작.
협소: Support=공지전용(티켓처리 없음), Pricing=FX읽기전용, Promotions=토글전용(코드생성 없음).
전 뷰 로딩/에러+재시도/빈상태 공용 래퍼. 시스템 갭: 페이지네이션/정렬 공용 컴포넌트 없음(cap 200/100),
차트 라이브러리 없음(CSS 막대).

## 3. 파트너(10/10 실플로우)

login/register/dashboard/products/inventory/orders/settlements/profile/staff/api-keys 전부 실API.
BROKEN(직접확인): (a) 가드가 localStorage만 읽어 rememberMe=false(세션스토리지) 사용자는 튕김
(router/index.ts:94 vs LoginView 세션 분기), (b) 모바일에서 w-64 사이드바 고정(햄버거 없음).
부분: 상품/직원 수정·삭제 UI+API 없음(백엔드 PATCH/DELETE 부재 직접확인),
재고 PUT이 itemId 고정이라 상품별 재고 선택 불가.

## 4. 사용자(핵심 흐름 실동작 + DUMMY 5 + BROKEN 2)

- WORKS: 홈, 6개 랜딩, 검색/목록/상세 7도메인, eSIM/보험(열람전용 명시), 체크아웃(견적→예약→결제),
  예약조회/취소, my 6종, 로그인/회원가입/비번찾기·재설정, 정적 11종, 리다이렉트 21종.
- DUMMY: deals(가짜 쿠폰코드 폴백), trip-best(가짜 랭킹 폴백), builder(전체 목업+조작 itemId),
  rewards(다이아몬드 고정 주장), help(가짜 상담원 챗봇).
- BROKEN(직접확인): moments 조회가 json.data 파싱이나 백엔드는 {success,moments}라 영구 빈화면,
  작성은 Authorization 없이 POST라 항상 401인데 로컬에 가짜로 prepend.
- wishlist 담기 토글이 어떤 컴포넌트에서도 호출 안 됨(도달 불가 데드코드).

## 5. API(Worker 실서버)

- REAL: admin ~30(대시보드/정산/예약/카탈로그/파트너/회원/감사/공지/마켓/프로모션/모먼트/플래그/FX/수집),
  partner ~22(확정·거절 상태머신, API키, OpenAPI), auth 8종, 카탈로그 공개 15종+, Toss 웹훅(서버재조회 후 자금이동),
  Resend 발송(cron outbox, 키 없으면 NOT_CONFIGURED 정직 보고).
- PARTIAL: 슬롯 폴백 3행 하드코딩, 공급사 레지스트리 정적, 가격알림 발송 미배선.
- STUB: 파트너 웹훅 실제 발송(저장만), 410 제거 엔드포인트 2종.
- 갭: 전역 OpenAPI 문서 없음(파트너 것만), 견적/예약/카탈로그 읽기 레이트리밋 없음,
  직원 초대 시 비번 생략하면 기본값(위험), 쿠폰 사용처리·코인 차감 미배선.
- Go backend: InMemoryStore 목 API, 실트래픽 제로(localhost dev-proxy 전용). PG 레거시 마이그레이션은 사체.

## 6. DB(D1, 57테이블)

0001 25 + 0002 18 + 0003 5 + 0004 5 + 0005 2 + 0006 1(places 250행) + 0008 1.
사체: idempotency_keys·partner_cancellations(참조 0), batches 읽기전용, change_log 쓰기전용.
자금 무결성 강함(append-only 원장 트리거, 중복방지, 환불상한 CHECK, CAS 가드).
시드는 현실적(호텔14/항공16 등, 실브랜드명). 백업/PITR 스크립트·문서 없음.

## 7. 공통(i18n·SEO·PWA·UI킷·검색·모바일)

- i18n: 사실상 한국어 전용. $t/useI18n 호출 0건, 로케일 파일+전환 UI는 있으나 무동작, 로케일 디렉토리 중복.
  hreflang은 홈만(ko/en), ja/zh 누락. prefix 라우트(/en/…) 프리렌더 해소 여부 미검증.
- SEO: sitemap.xml 있음(카탈로그 기반 동적, live). ~27페이지 useHead, 호텔 상세 JSON-LD.
  갭: checkout·moments·DUMMY 5종·정적 11종 useHead 없음, per-page og:image 없음, 파트너 robots/OG 없음.
- PWA: 매니페스트/SW 없음(미구현). 다크모드는 3포털 동작(저장 키 제각각).
- UI킷: Base* 공용 없음. admin만 StatePanel/SidePanel/뱃지+CSS 유틸, partner는 AppIcon뿐·스켈레톤 없음.
  raw table 14뷰, 탭은 페이지마다 수제.
- 검색: Worker suggest는 D1 places 전체 적재+인메모리 랭크(정확>접두>초성>부분>오타허용)+도메인별 LIKE.
  FTS/외부엔진 없음. UI는 180ms 디바운스, IME·키보드·ARIA, 최근/인기, 모바일 키보드 회피 완비.
- 모바일: Flutter 코드 0줄(TECH_STACK_AUDIT의 Flutter 언급은 아키텍처 한정). 모바일웹은 양호
  (하단내비 56px+safe-area, 드로어, 필터시트).

## 8. P0 후보 Top 15(Phase 1)

1. 파트너 가드 sessionStorage 대응 2. 파트너 모바일 사이드바 3. moments 조회 파싱 수정
2. moments 작성 인증+에러처리 5. DUMMY 5종 실데이터화 or 삭제 6. builder 조작 itemId 제거
3. 파트너 웹훅 실발송 or STUB 고지 8. 상품 수정·삭제 9. 직원 수정·삭제 10. 상품별 재고 선택
4. 공용 페이지네이션/정렬+전개 12. 티켓/문의 처리 13. 프로모션 코드 생성 14. 비번찾기+승인상태 15. 주문상세

## 9. 가정 목록

- /api/v1 접두 매핑(검증됨). admin 응답형상은 전수 대조 완료(P9). user 응답형상은 moments만 추적.
- 시드 상품명은 현실적 목데이터로 간주. Go는 폐기 대상이 아닌 dev-proxy로 유지 가정.

## 10. 미해소

- @nuxtjs/i18n prefix 라우트 프리렌더 해소 여부(빌드 확인 필요).
- API 그랜드 토털 미집계(약 90+ 관측). 사용자 포털 exact 페이지 수 미집계(45+ 관측).
- 합성 에이전트가 대형 제출을 인라인으로 못 읽어 본 보고서는 부모가 전수 직접 재합성.
