# 🏛️ getfortrip Brand Governance & Engineering Policy

> **문서 버전**: v1.0.0  
> **최종 개정일**: 2026-10-15  
> **효력 범위**: 전체 저장소 (`frontend-user`, `frontend-admin`, `backend`, `database`, `docs`, `config`, CI/CD)

---

## 1. 플랫폼 공식 명칭 및 단일화 원칙

1. **공식 플랫폼명 (Official Platform Name)**:
   - **`getfortrip`** (모두 소문자 표준 워드마크)
   - 어떠한 상황에서도 플랫폼 공식 명칭은 `getfortrip`으로 단일화한다.
2. **공식 서비스 표기**:
   - 국문 표기 시: `getfortrip` (불필요한 음차 표기 지양)
   - 영문 표기 시: `getfortrip`
3. **예정 도메인 (Scheduled Domain)**:
   - **`getfortrip.com`**
   - 현재 배포 중인 클라우드플레어 환경(`ota-hub.dnjstjqppk.workers.dev`)에서 정식 도메인(`getfortrip.com`) 구매 및 DNS 연결 시 무중단 전환되도록 코드 레벨 상수로 분리 관리한다.

---

## 2. 금지 브랜드명 및 엄격 차단 규정 (Anti-Patterns)

> [!CAUTION]
> 우리는 **Trip.com**이 아니며, **TripScanner**도 아닙니다.
> 타 플랫폼으로 오인될 수 있는 모든 명칭과 레거시 표기는 전면 금지됩니다.

### 🚫 절대 사용 금지 문자열
아래 문자열은 대소문자를 불문하고 코드베이스, UI 컴포넌트, 메타데이터, 주석, 데이터베이스 시드, 문서에 삽입할 수 없습니다.

| 금지 문자열 | 차단 사유 | 대체 규정 |
| :--- | :--- | :--- |
| `TripScanner`, `Trip Scanner`, `tripscanner` | 레거시 가칭 오인 방지 | `getfortrip` |
| `Trip.com`, `trip.com`, `트립닷컴` | 타사 브랜드 카피 및 혼동 방지 | `getfortrip` |
| `tripcdn.com` | 타사 CDN 외부 자산 의존 금지 | 로컬 `/public` 승인 자산 사용 |
| `tripclone` | 클론 표기 잔존 금지 | `getfortrip` |
| `Trip Coins`, `트립코인` | 레거시 포인트 명칭 | `getfortrip Coins (G-Coins)` |
| `Trip.Best` | 타사 랭킹 명칭 카피 금지 | `getfortrip Best` |
| `트립 모먼트` | 타사 커뮤니티 명칭 카피 금지 | `여행 모먼트 (getfortrip Moments)` |

---

## 3. 브랜딩 공용 상수(Config) 단일 소스 원칙

모든 브랜드명, 도메인, 로고 경로, 저작권 문구는 하드코딩하지 않고 단일 소스(Single Source of Truth) 설정 파일에서 참조해야 합니다.

1. **사용자 프론트엔드**:
   - 파일 위치: `frontend-user/config/brand.ts`
   - 객체명: `BRAND`
   - 속성: `BRAND.name`, `BRAND.plannedDomain`, `BRAND.currentDeployUrl`, `BRAND.tagline`, `BRAND.logoUrl` 등
2. **관리자 프론트엔드**:
   - 파일 위치: `frontend-admin/src/config/brand.ts`
   - 객체명: `BRAND`
3. **백엔드 코어 엔진**:
   - 서비스 식별자: `getfortrip-core-engine`
   - 모듈명: `getfortrip/backend`
   - 예약 코드 포맷: `GFT-YYYYMMDD-XXXX`

---

## 4. 로고 및 시각 자산(Assets) 사용 규칙

1. **공식 승인 자산 목록**:
   - `/logo.svg`: 메인 가로형 풀 로고 (라이트 테마용)
   - `/logo-white.svg`: 화이트 가로형 로고 (다크 테마 및 푸터/사이드바용)
   - `/symbol.svg`: 엠블럼 심볼 (정사각형 아이콘, 모바일/PWA)
   - `/favicon.svg` & `/favicon.ico`: 브라우저 파비콘
2. **외부 자산 차용 금지**:
   - 타사 CDN이나 비공식 이미지 링크를 파비콘/로고로 사용하는 것을 전면 금지합니다.
   - 모든 로고 자산은 프로젝트 내 `/public` 디렉터리에 자체 호스팅되어야 합니다.

---

## 5. 자동화된 브랜드 무결성 검증 (Automated Quality Gate)

### 5.1 사전 커밋(Pre-commit Hook) 자동 검사
`.githooks/pre-commit` 단계에서 `node scripts/check-branding.js`가 자동으로 실행됩니다.
- 금지 문자열이 탐지될 경우 exit code 1로 커밋이 즉시 중단됩니다.

### 5.2 수동 및 CI 검사 명령어
```powershell
npm run check:branding
```
PR 생성, CI 파이프라인 빌드, 실서버 배포 전 반드시 브랜드 검증을 통과해야 합니다.

---

## 6. 향후 도메인(`getfortrip.com`) 전환 절차

도메인 구매 완료 시 다음 절차를 따릅니다:
1. `frontend-user/config/brand.ts` 및 `frontend-admin/src/config/brand.ts`의 `productionDomain` 활성화.
2. Cloudflare Dashboard에서 Custom Domain `getfortrip.com`을 `ota-hub` Worker에 연결.
3. CORS 및 Allowed Origins를 `https://getfortrip.com`, `https://admin.getfortrip.com`으로 갱신.
4. 이때에도 브랜드 소스 오브 트루스는 영구히 `getfortrip`을 유지합니다.


<!-- getfortrip Synchronized: 2026-10-19T00:15:00Z -->
