# [도메인 및 SSL/TLS 인증서 검증 보고서] getfortrip.com Domain & Security Certificate Audit

**문서 번호:** OPS-DOM-SSL-20261018-01  
**작성일자:** 2026-10-18  
**대상 도메인:** `getfortrip.com`, `www.getfortrip.com`, `admin.getfortrip.com`  
**현재 라이브 호스트:** `https://ota-hub.dnjstjqppk.workers.dev/`  
**보안 프로토콜:** HTTPS (TLS 1.3, HSTS Enabled)  
**판정:** **인프라 설정 완료 (DNS 위임 대기 중 - CONDITIONAL ON REGISTRAR DELEGATION)**

---

## 1. SSL/TLS 및 보안 헤더 검증 실측치

`https://ota-hub.dnjstjqppk.workers.dev/api/v1/health`에 대한 실서버 헤더 검증 결과:

```http
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
X-XSS-Protection: 1; mode=block
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
Content-Type: application/json; charset=utf-8
Server: cloudflare
```

- 모든 트래픽은 TLS 1.3 암호화 채널로 강제되며, 평문 HTTP 요청은 301 영구 리디렉션으로 자동 승격됨.
- HSTS(`max-age=31536000`) 정책이 적용되어 브라우저 다운그레이드 공격을 차단함.

---

## 2. getfortrip.com 정식 도메인 연결 설정 가이드

1. **도메인 레지스트라(가비아, 후이즈, 네임스핀 등) 네임서버 설정:**
   - Cloudflare 할당 Anycast 네임서버로 변경.
2. **Cloudflare DNS 레코드 구성:**
   - `@` (Apex): `CNAME` -> `ota-hub.dnjstjqppk.workers.dev` (Proxied)
   - `www`: `CNAME` -> `ota-hub.dnjstjqppk.workers.dev` (Proxied)
   - `admin`: `CNAME` -> `ota-hub.dnjstjqppk.workers.dev` (Proxied)
3. **Cloudflare Workers Custom Domains 바인딩:**
   - Workers 설정의 "Triggers" -> "Custom Domains"에서 `getfortrip.com` 추가.
4. **SSL/TLS 암호화 모드:**
   - **Full (Strict)** 모드 활성화.

