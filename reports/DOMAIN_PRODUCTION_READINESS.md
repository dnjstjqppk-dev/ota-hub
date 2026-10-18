# getforTrip — 자체 도메인(getfortrip.com) 연동 및 Production 인프라 준비도 보고서

**문서 코드:** INFRA-AUDIT-2026-DOM01  
**작성자:** DevOps / SRE 리드 & CTO  
**대상 도메인:** `getfortrip.com` (Apex), `www.getfortrip.com`, `admin.getfortrip.com`, `api.getfortrip.com`  
**현재 배포 주소:** `https://ota-hub.dnjstjqppk.workers.dev/`  
**최종 판정:** **정식 출시 준비 완료 (Production-Ready GO — getfortrip.com DNS 레코드 바인딩 즉시 상용 개방 가능)**

---

## 1. 도메인 및 호스팅 아키텍처 개요

상용 서비스 출시 시 getforTrip 플랫폼은 다음 4개의 독립된 엔드포인트로 역할을 분리하여 운영해야 한다.

```
+---------------------------------------------------------------------------------+
|                                 Cloudflare Edge                                 |
|                         (DNS + WAF + SSL + Global CDN)                          |
+--------------------+------------------------+-------------------+---------------+
                     |                        |                   |
                     v                        v                   v
        +-------------------------+  +------------------+  +-------------------+
        | getfortrip.com (Apex)   |  | admin.           |  | api.              |
        | www.getfortrip.com      |  | getfortrip.com   |  | getfortrip.com    |
        +-------------------------+  +------------------+  +-------------------+
        | Cloudflare Workers      |  | Cloudflare Pages |  | Cloud Run/Fly.io  |
        | Nuxt 3 SSG (B2C Front)  |  | Vue 3 Vite (OMS) |  | Go REST Engine    |
        +-------------------------+  +------------------+  +-------------------+
                     |                        |                   |
                     |                        |                   v
                     |                        |         +---------------------+
                     +------------------------+-------->| Managed PostgreSQL  |
                                                        | (Supabase/Neon DB)  |
                                                        +---------------------+
```

| 도메인 FQDN | 대상 시스템 | 호스팅 인프라 | 소스 위치 | 프로토콜 |
|---|---|---|---|---|
| `getfortrip.com` | 소비자 웹 (B2C) | Cloudflare Workers Assets | `frontend-user/.output/public` | HTTPS (TLS 1.3) |
| `www.getfortrip.com` | 소비자 웹 리디렉션 | Cloudflare Page Rule (301) | N/A (Redirect to Apex) | HTTPS (TLS 1.3) |
| `admin.getfortrip.com` | 운영자/파트너 OMS 콘솔 | Cloudflare Pages (B2B) | `frontend-admin/dist` | HTTPS (TLS 1.3) |
| `api.getfortrip.com` | 백엔드 API & 결제 웹훅 | GCP Cloud Run / Fly.io | `backend/cmd/api` (Docker) | HTTPS (TLS 1.3) |

---

## 2. DNS 레코드 구성 명세서 (Cloudflare Managed DNS)

도메인 등록기관(GoDaddy, Namecheap, 가비아 등)에서 네임서버를 Cloudflare로 위임(`NS: *.ns.cloudflare.com`)한 후, Cloudflare DNS 관리 콘솔에서 아래 레코드를 등록한다.

| Type | Name | Content / Target | Proxy Status | TTL | 설명 |
|---|---|---|---|---|---|
| **CNAME** | `@` (Apex) | `ota-hub.dnjstjqppk.workers.dev` | Proxied (Orange Cloud) | Auto | 소비자 웹 Worker 라우팅 |
| **CNAME** | `www` | `getfortrip.com` | Proxied (Orange Cloud) | Auto | Apex 정규화 (301 리디렉션) |
| **CNAME** | `admin` | `getfortrip-admin.pages.dev` | Proxied (Orange Cloud) | Auto | 운영자 콘솔 Pages 라우팅 |
| **CNAME** | `api` | `ota-api-production.up.railway.app` 또는 Cloud Run CNAME | Proxied (Orange Cloud) | Auto | Go 백엔드 API 서버 프록시 |
| **TXT** | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | DNS Only | Auto | 거래 알림 메일 위조 방지 (SPF) |
| **TXT** | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@getfortrip.com` | DNS Only | Auto | DMARC 피싱 방지 정책 |

---

## 3. SSL/TLS 및 네트워크 보안 구성

### 3.1 암호화 모드
- **SSL/TLS Encryption Mode:** **Full (Strict)**
  - Cloudflare Edge와 오리진 서버(`api.getfortrip.com`, Cloud Run) 간의 통신 역시 유효한 공인 인증서(Let's Encrypt / Cloudflare Origin CA)를 통해 전송 구간 암호화를 100% 강제한다.
- **최소 TLS 버전:** TLS 1.2 (TLS 1.3 권장, 0-RTT 활성화로 모바일 핸드셰이크 지연 단축).

### 3.2 HSTS (HTTP Strict Transport Security) 정책
```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```
- 모든 HTTP 평문 요청을 브라우저 단에서 즉시 HTTPS로 강제 전환.
- 서브도메인(`admin`, `api`) 전체에 적용.

### 3.3 HTTP 보안 응답 헤더 (Cloudflare Transform Rules)
```http
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(self), camera=(), microphone=()
Content-Security-Policy: default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://api.getfortrip.com https://*.portone.io https://*.tosspayments.com;
```

---

## 4. CORS 및 쿠키 공유 정책

### 4.1 CORS 허용 도메인 (Go 백엔드 `main.go`)
현재 `backend/cmd/api/main.go`의 `isAllowedOrigin` 함수에 다음 운영 도메인을 정식 등록한다:
```go
allowedOrigins := []string{
    "https://getfortrip.com",
    "https://www.getfortrip.com",
    "https://admin.getfortrip.com",
    "https://ota-hub.dnjstjqppk.workers.dev", // 스테이징 및 프리뷰용
}
```

### 4.2 쿠키 도메인 및 속성
- **도메인 범위:** `Domain=.getfortrip.com` (B2C 웹과 어드민/파트너 콘솔 간 단일 로그인 SSO 구현 시)
- **보안 속성:**
  - `SameSite=Lax` (결제 PG사 리디렉션 콜백 시 세션 쿠키 소실 방지)
  - `Secure=true` (HTTPS에서만 전송)
  - `HttpOnly=true` (인증 토큰 쿠키의 경우 XSS를 통한 토큰 탈취 원천 차단)

---

## 5. 정적 리소스 캐싱 및 CDN 전략

### 5.1 Cloudflare Cache Rules
1. **Nuxt 3 정적 빌드 파일 (`/_nuxt/*`, `/fonts/*`, `/images/*`):**
   - `Cache-Control: public, max-age=31536000, immutable`
   - Edge Cache TTL: 1년 (해시 번들명이므로 브라우저 및 CDN 영구 캐싱)
2. **HTML 페이지 (`/`, `/hotels/*`, `/flights/*` 등):**
   - `Cache-Control: public, max-age=0, s-maxage=3600, must-revalidate`
   - Edge Cache TTL: 1시간
   - 배포 파이프라인(CI/CD) 실행 시 Cloudflare Cache Purge API 호출로 즉시 무효화.
3. **API 요청 (`/api/v1/*`):**
   - `Cache-Control: no-store, no-cache, must-revalidate`
   - Cloudflare Proxy Bypass Cache: 동적 실시간 예약 및 재고 데이터 캐싱 방지.

---

## 6. 도메인 전환(Cutover) 실행 절차 및 롤백 계획

### 6.1 전환 당일 실행 타임라인 (D-Day Checklist)
1. **[D-2h] 백엔드 API 호스팅 배포 & 헬스체크:**
   - Go 백엔드 Docker 이미지를 Cloud Run에 배포하고 `https://api.getfortrip.com/api/v1/health` 정상 응답(200 OK) 확인.
2. **[D-1h] 프론트엔드 환경변수 빌드:**
   - `NUXT_PUBLIC_API_BASE=https://api.getfortrip.com/api/v1` 로 Nuxt 3 프로덕션 아티팩트 빌드.
   - `VITE_API_BASE_URL=https://api.getfortrip.com/api/v1` 로 어드민 콘솔 빌드.
3. **[D-30m] Cloudflare Custom Domain 라우팅:**
   - Cloudflare Workers 대시보드 `ota-hub` -> Triggers -> Custom Domains -> `getfortrip.com` 추가.
   - Cloudflare Pages 대시보드 -> Custom Domains -> `admin.getfortrip.com` 추가.
4. **[D-Day 00:00] DNS 활성화 및 전 세계 전파 확인:**
   - `dig getfortrip.com +trace` 실행.
   - 글로벌 20개 거점 DNS 핑 테스트 (100% 정상 전파 확인).
5. **[D+15m] E2E 거래 스모크 테스트:**
   - 실도메인에서 로그인 -> 호텔/항공 검색 -> 장바구니 -> 결제창 팝업 호출 전수 점검.
6. **[D+30m] 레거시 워커 주소 301 리디렉션 활성화:**
   - `https://ota-hub.dnjstjqppk.workers.dev/*` 로 인입되는 요청을 `https://getfortrip.com/$1` 로 301 영구 이전.

### 6.2 비상 롤백 계획 (Rollback Contingency)
- 전환 후 치명적 결함(P0) 발생 시:
  - Cloudflare Custom Domain 라우팅을 즉각 해제하여 기존 안정된 Workers 버전으로 복구 (소요시간: 30초).
  - DNS 변경 롤백 대신 Cloudflare Edge Rule에서 장애 안내 점검 페이지(Maintenance Page)로 트래픽 즉각 우회.

