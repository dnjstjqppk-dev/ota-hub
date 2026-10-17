# getforTrip OTA — Security and Privacy Audit Report

## 1. 개요 및 보안 준수 원칙
getforTrip OTA 플랫폼은 글로벌 고객의 결제 정보 및 여권/연락처 등 민감 개인정보(PII)를 처리하므로, 전자상거래법, 개인정보보호법(PIPA), GDPR 및 PCI-DSS 준수를 전제로 보안 아키텍처를 수립하였습니다.

---

## 2. 주요 취약점 감사 및 조치 결과

### 2.1 SSR PII 노출 취약점 원천 차단 (P0-08 조치 완료)
- **점검 내용**: Nuxt 3 서버 사이드 렌더링(SSR) 및 정적 생성(SSG) 시 전역 스토어(`authStore`)에 기본값으로 하드코딩되어 있던 테스트 계정(`김여행`, `DIAMOND VIP`, `28,500 G`, 예약 7건)이 검색 엔진 봇 및 익명 방문자의 정적 HTML로 누출되던 취약점 점검.
- **조치 결과**:
  - `authStore`의 초기 상태를 `isLoggedIn: false`, `user: null`로 정규화.
  - 마이페이지(`/my/`, `/my/bookings/`, `/my/profile/`)에 비로그인 게이트웨이 템플릿을 필수 적용하여 인증 세션이 없는 경우 어떠한 개인정보도 사전 렌더링되지 않도록 차단 완료.

### 2.2 인증 및 세션 보안 (Authentication & Session)
- **JWT 토큰 정책**:
  - Access Token: 유효기간 15분, 암호화 서명 (HS256 / RS256).
  - Refresh Token: 유효기간 14일, Redis에 화이트리스트 관리 및 강제 로그아웃/폐기 지원.
  - 전송 방식: 브라우저 JavaScript에서 접근 불가능한 `HttpOnly`, `Secure`, `SameSite=Lax` 쿠키 사용으로 XSS 탈취 원천 차단.

### 2.3 파트너 포털 접근 통제 (RBAC & B2B 보안)
- 파트너 포털 로그인 시 하드코딩된 데모 계정 선택기(`demo selector`)를 완전히 제거.
- 비인가 사용자의 B2B API 호출 방지를 위해 HMAC-SHA256 기반 서명 및 API 키 인증을 강제.
- B2B API 레이트 리밋: 분당 최대 600회 초과 시 `429 Too Many Requests` 자동 반환.

### 2.4 데이터베이스 암호화 및 마스킹
- **비밀번호**: Argon2id 알고리즘(메모리 64MB, 반복 3회)을 적용하여 안전하게 일방향 암호화.
- **여권번호 및 계좌번호**: AES-256-GCM 알고리즘으로 컬럼 레벨 암호화 저장.
- **UI 마스킹**: 화면 출력 시 이름(`홍*동`), 이메일(`ho***@gmail.com`), 여권번호(`M1234****`) 자동 마스킹 필터 적용.

### 2.5 OWASP Top 10 대응 현황
1. **Injection (SQL/NoSQL)**: ORM 및 파라미터화된 쿼리(Prepared Statements) 100% 강제.
2. **Broken Access Control**: 리소스 접근 시 세션의 `user_id` 또는 `partner_id`와 데이터 소유자를 백엔드에서 반드시 대조.
3. **Cryptographic Failures**: TLS 1.3 강제 적용, HSTS(Strict-Transport-Security) 헤더 활성화.
4. **Security Misconfiguration**: Cloudflare WAF를 통해 악성 봇, SQLi, XSS 페이로드 실시간 차단.

