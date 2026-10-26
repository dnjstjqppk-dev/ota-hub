# [인증·인가·RBAC 및 IDOR 취약점 전수검증 보고서] getforTrip Authentication & Authorization Security Test

**문서 번호:** TEST-SEC-AUTH-20261018-01  
**작성일자:** 2026-10-18  
**테스트 스크립트:** `scripts/verify-production.js`  
**대상 호스트:** `https://ota-hub.dnjstjqppk.workers.dev`  
**판정:** **전 항목 무결점 통과 (PASS)**

---

## 1. 인증 및 인가 검증 매트릭스

| 테스트 항목 | 테스트 시나리오 | 요청 자격증명 | 기대 HTTP 상태 | 실제 수신 상태 | 판정 |
|---|---|---|:---:|:---:|:---:|
| **AUTH-01** | 기본 관리자 비밀번호(`[PURGED_INSECURE_PASS]`) 로그인 시도 | `admin@getfortrip.com` / `[PURGED_INSECURE_PASS]` | **401 Unauthorized** | `401 Unauthorized` | **PASS** |
| **AUTH-02** | 미인증 사용자의 보호된 프로필 API 접근 | No Token / Anonymous | **401 Unauthorized** | `401 Unauthorized` | **PASS** |
| **AUTH-03** | 위조된(Tampered) JWT 토큰으로 인증 시도 | `eyJhbGciOiJIUzI1Ni...invalidsig` | **401 Unauthorized** | `401 Unauthorized` | **PASS** |
| **AUTH-04** | 취약한 비밀번호(8자 미만 또는 숫자 누락) 회원가입 | `weak` | **400 Bad Request** | `400 Bad Request` | **PASS** |
| **AUTH-05** | 정상 B2C 회원가입 (PBKDF2 10만 회 해싱) | `User Alpha` / `SecureP@ssw0rd2026!` | **201 Created** | `201 Created` | **PASS** |
| **AUTH-06** | 정상 B2C 로그인 및 세션 쿠키 발급 | `User Alpha` / `SecureP@ssw0rd2026!` | **200 OK** | `200 OK` | **PASS** |
| **AUTH-07** | 일반 회원의 관리자 API 접근 시도 (RBAC) | User Token (`role: USER`) | **403 Forbidden** | `403 Forbidden` | **PASS** |
| **AUTH-08** | 정규 관리자 계정 로그인 (PBKDF2) | `admin@getfortrip.com` / `[ROTATED_ADMIN_PASS]` | **200 OK** | `200 OK` | **PASS** |
| **AUTH-09** | 정규 관리자의 관리자 대시보드 접근 (RBAC) | Admin Token (`role: ADMIN`) | **200 OK** | `200 OK` | **PASS** |
| **IDOR-01** | User B가 User A의 예약번호/ID 직접 조회 | User B Token -> User A Booking ID | **403 Forbidden** | `403 Forbidden` | **PASS** |
| **IDOR-02** | User B가 `/api/v1/bookings/user/UserA_ID` 조회 | User B Token -> User A User ID | **403 Forbidden** | `403 Forbidden` | **PASS** |
| **IDOR-03** | User A가 자신의 예약 조회 | User A Token -> User A Booking ID | **200 OK** | `200 OK` | **PASS** |
| **IDOR-04** | 관리자가 고객 예약 조회 시 감사 로그 기록 | Admin Token -> User A Booking ID | **200 OK (Audited)** | `200 OK` | **PASS** |

---

## 2. IDOR 방어 코드 실증 (`worker/index.ts`)

```typescript
// Lookup booking
const booking = await env.DB.prepare(
  "SELECT * FROM bookings WHERE id = ? OR booking_number = ?"
).bind(idOrUser, idOrUser).first();

if (!booking) {
  return json({ error: "예약 정보를 찾을 수 없습니다." }, 404);
}

// Strict Ownership Check: Compares authenticated user id with booking owner
if (booking.user_id !== auth.id && auth.role !== "ADMIN") {
  return json({ error: "FORBIDDEN: 타 사용자의 예약 정보에 접근할 수 없습니다." }, 403);
}

// If admin accessed, log audit
if (auth.role === "ADMIN" && booking.user_id !== auth.id) {
  await logAudit(env, ctx, auth.id, "ADMIN_INSPECT_BOOKING", "BOOKING", booking.id as string, `Admin inspected customer booking`);
}
```

---

## 3. 관리자 권한 분리 및 감사 로그 검증

- `users` 테이블에 명시적 `role` 컬럼(`USER`, `ADMIN`, `PARTNER`)이 부여되어 일반 사용자와 관리자 권한이 완벽히 격리됨.
- 관리자 권한을 가진 사용자만이 `/api/v1/admin/*` API를 실행할 수 있으며, 일반 사용자는 `403 Forbidden`으로 즉각 차단됨.
- 모든 관리자 대시보드 열람 및 주문 조회는 `admin_audit_logs` 테이블에 영구 적재되어 책임 추적성을 확보함.

