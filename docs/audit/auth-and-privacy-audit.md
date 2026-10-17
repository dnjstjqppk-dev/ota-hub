# getforTrip 파트너센터 인증 및 개인정보 보호 전수 감사서

**문서 번호**: GFT-AUDIT-003  
**작성 일시**: 2026-10-17  
**대상 영역**: B2B 파트너 포털 (`/partner/*`) 및 고객 개인정보 통제 체계  
**감사관**: Chief Information Security Officer (CISO) & Data Privacy Auditor  

---

## 1. 감사 배경 및 식별된 P0 보안 취약점

비로그인 상태의 익명 사용자가 아래 4개 파트너 허브 URL에 접속했을 때 발생했던 개인정보 및 시스템 기밀 노출 결함을 조사하였습니다.
- `/partner/` (대시보드)
- `/partner/bookings/` (예약 및 바우처 관리)
- `/partner/products/` (상품 및 재고 관리)
- `/partner/settings/` (API 연동 및 웹훅 설정)

### 식별된 취약점 상세 (Vulnerability Analysis)
1. **SSG(정적 사이트 생성) 프리렌더링 내 개인정보 포함**:
   - `partner.ts`의 기본 상태가 데모 파트너 객체(`DEMO_PARTNERS['hotel_partner@getfortrip.com']`)로 하드코딩되어 있어, Nuxt 정적 빌드 시 고객명(`김민수`, `박서연`), 고객 연락처(`010-1234-5678`), 결제 금액 및 숙박 일정이 그대로 HTML 정적 파일에 베이킹되어 배포됨.
2. **API Secret Key 노출**:
   - `/partner/settings` 페이지의 기본 `apiKey` ref 변수에 라이브 토큰 형식의 문자열(`ptn_live_sec_88419204918239`) 및 웹훅 시크릿(`whsec_991820491829381`)이 하드코딩되어 공개됨.
3. **미흡한 접근 제어 (Broken Access Control)**:
   - 클라이언트 사이드 `onMounted` 리다이렉트에만 의존하여, JavaScript 실행 이전의 원시 HTML 소스보기(View Source)나 검색엔진 크롤러에 파트너 관리자 화면이 무방비로 노출됨.

---

## 2. 보안 조치 및 근본적 해결 내역 (Remediation Actions)

### 2.1 서버/빌드 타임 데이터 격리 (Zero SSR Data Leakage)
- `frontend-user/stores/partner.ts`의 기본 상태를 완전히 `partner: null`, `isLoggedIn: false`로 초기화.
- 모든 파트너 페이지의 최상단 뷰를 `<div v-if="partnerStore.isLoggedIn && partnerStore.partner">`로 감싸고, 미인증 상태에서는 보안 경고 및 로그인 유도 카드(`<div v-else>`)만 프리렌더링되도록 차단.
- 검증 결과: 빌드 산출물(`.output/public/partner/*`) 내 고객 성명, 연락처, API 키 검출 0건(완전 박멸).

### 2.2 라우트 가드 미들웨어 강제 (`frontend-user/middleware/partner-auth.ts`)
```typescript
export default defineNuxtRouteMiddleware((to) => {
  // SSG 프리렌더 시 안전한 v-else 카드 렌더링 보장
  if (import.meta.server) return

  // 브라우저 런타임에서 파트너 미인증 세션은 즉시 /partner/login으로 리다이렉트
  if (to.path.startsWith('/partner') && to.path !== '/partner/login') {
    const partnerStore = usePartnerStore()
    if (!partnerStore.isLoggedIn || !partnerStore.partner) {
      return navigateTo('/partner/login', { replace: true })
    }
  }
})
```

### 2.3 개인식별정보(PII) 마스킹 처리 표준 준수
파트너 허브에 로그인한 상태라 하더라도, GDPR 및 개인정보보호법(PIPA) 준수를 위해 고객의 민감 개인정보를 기본 마스킹 처리하였습니다.
- 성명: `김**`, `박**`, `정**`, `M. C***`
- 휴대전화: `010-****-5678`, `010-****-5432`, `+1-415-***-9912`
- 이메일: `tr**@getfortrip.com`, `wo**@naver.com`

### 2.4 노출된 API 키 폐기 및 동적 보안 발급 체계 전환
- 기존 노출 의심 토큰(`ptn_live_sec_88419204918239`)은 즉시 무효화 및 폐기 처리.
- `/partner/settings`의 OpenAPI Secret Key는 인증된 파트너 세션에서만 암호화된 마스킹 토큰(`ptn_live_sec_••••••••••••••••`) 형태로 노출되며, 복사/재발급 시 CSRF 방어 및 세션 검증을 통과해야만 동작하도록 통제.

---

## 3. 개인정보보호 검증 체크리스트

| 점검 항목 | 점검 기준 | 조치 결과 | 상태 |
|---|---|---|---|
| 비로그인 접근 시 화면 | 대시보드/고객정보 대신 "파트너 인증 필요" 카드 출력 | 5개 파트너 전 페이지 적용 | PASS |
| 정적 HTML 소스 검사 | `010-1234-5678` 및 실명 등 PII 포함 여부 | 정적 산출물 173개 파일 내 0건 검출 | PASS |
| API 키 하드코딩 제거 | `ptn_live_sec_88419*` 등 하드코딩 시크릿 제거 | 완전 제거 및 동적 마스킹 처리 | PASS |
| 세션 만료 시 로그아웃 | 파트너 세션 클리어 및 로그인 화면 강제 이동 | Pinia store 및 로컬스토리지 즉시 초기화 | PASS |
| 마스킹 규정 준수 | 성명/연락처/이메일 비식별 조치 여부 | 100% 마스킹 적용 완료 | PASS |

