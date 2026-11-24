# Stage 1 조치 리포트 (2026-11-24) — 감사 P0·P1 코드 결함 해소

- 선행 문서: [`COMMERCIAL_READINESS_AUDIT_20261122.md`](COMMERCIAL_READINESS_AUDIT_20261122.md) §3–§4, §8-Stage 1
- 범위: 외부 계약 없이 개발팀이 즉시 수정 가능한 항목 (배포·운영 D1 쓰기는 미실행 — 승인 대기)

## 1. 조치 결과 요약

| ID | 항목 | 상태 | 검증 |
|---|---|---|---|
| P0-1 | `ota-user` SSR 503/404 (workers.dev 직접 fetch 차단) | **수정 완료 (배포 대기)** | 유닛 2건 + Nuxt 빌드 + 번들 내 플러그인/헤더 규칙 확인 |
| P0-2 | 주간 D1 백업 FTS5 실패 | **수정·실증 완료** | 운영 원격 백업 93/93 + 복원검증 PASS (무결성·FK 무위반) |
| P0-3 | 운영 더미 제휴 시크릿 ACTIVE | **SQL 준비 (실행 대기)** | 로컬 D1 전건 `success:true` |
| P1-1 | 3포털 보안 헤더 0개 | **수정 완료 (배포 대기)** | 빌드 산출물에서 규칙 확인 |
| P1-2 | 호텔 가짜 좌표·수용량 NULL | **수정 완료 (운영 반영 대기)** | 유닛 회귀 + 로컬 D1 효과 확인 |
| P1-3 | QA 잔재 파트너 | **SQL 준비 (실행 대기)** | 로컬 D1 전건 `success:true` |
| P1-4 | 여행업 등록번호 정책 충돌 | **수정 완료 (배포 대기)** | e2e 2/2 PASS |
| P1-5 | 임시 파일·비밀번호 인용·High 취약점 | **부분 완료** | 아래 §3 참조 |

## 2. 변경 내용

- **P0-1**: `frontend-user/wrangler.jsonc`에 `ota-hub` Service Binding(`API`) 추가.
  신규 `frontend-user/plugins/00.hub-binding.server.ts`가 SSR 절대 URL을
  `env.API.fetch()`로 전달 (바인딩 없으면 기존 fetch로 폴백 — 로컬 개발 무영향).
  순수 판별식 `frontend-user/utils/hubBinding.ts` + `tests/hub-binding.test.mjs`.
- **P0-2**: `scripts/backup-d1.js`를 `d1 export` → `d1 execute` 기반 스키마+행 덤프로
  재작성 (가상 테이블 정의 포함, FTS 섀도우 제외, `d1_migrations` 포함).
  `scripts/verify-backup-restore.mjs`의 테이블 집계에 `CREATE VIRTUAL TABLE` 반영.
  워크플로우(`db-backup.yml`) 변경 불필요 — 다음 주간 실행부터 녹색 예상.
- **P0-3/P1-2/P1-3**: `scripts/prod-hygiene-20261122.sql` (실행 전 백업 선행 기재).
  - 제휴 3사 `is_active=0, secret_key=''` ( travelpayouts는 이미 비활성 — 미포함).
  - `activities` NULL 수용량 → 30, 호텔 14건 실좌표 UPDATE.
  - `verify_*`/`applicant_*@partner.getfortrip.com` + 플레이스홀더 1건 비활성화(삭제 아님),
    해당 API 키 revoke.
- **P1-1**: `frontend-admin/public/_headers`, `frontend-partner/public/_headers` 신설,
  `frontend-user/nuxt.config.ts` `/**` routeRules 헤더 (hub `SECURITY_HEADERS`와 동일 4종, CSP 제외).
- **P1-2 코드**: `hotelCatalog.ts`에 `latitude/longitude` 필수화 + 14곳 실좌표,
  `catalog-truth.test.mjs`에 좌표 회귀 테스트.
- **P1-4**: `admin.ts` ACTIVE 게이트에서 여행업 등록번호 제외 (통신판매업 기준으로 푸터와 통일),
  `EntitiesView.vue` 선택 표기, e2e 2건 기대치 갱신 (면허 없이 ACTIVE 200 + 면허 저장 200).
- **P1-5**: `temp_master_prompt.md` 삭제, `FULL_AUDIT_20261109.md` 비밀번호 인용 redacted
  (코드는 이미 정리됨 — 리포트 인용만 남아 있었음).

## 3. 의도적 제외·보류 (감사안과 다른 판단 2건 포함)

1. **`bkg-init-001` 유지**: 감사안은 정리 대상이나, `scripts/verify-production.js`
   P0-06/P0-04의 라이브 픽스처라 삭제·상태 변경 시 운영 검증이 깨짐. 유지가 정답.
2. **목 파트너 3건(`ptn_htl_01` 등) 유지**: 카탈로그 `partner_id` 기본값으로 참조 중.
   실파트너 교체 시 상품 remap과 함께 처리해야 하므로 인간 결정으로 이관.
3. **호텔 이미지**: `thumbnail_url/images`는 라이선스 있는 실사진 소싱이 필요해 코드로
   메울 수 없음 (가짜 이미지 삽입 금지). 사업 측 소싱 필요.
4. **관리자 MFA 2명**: 당사자 등록 행위라 코드 조치 불가. 등록 후 `admin_mfa_secrets` 확인 필요.
5. **High 취약점**: 모두 nuxt/vite/nitropack 하위 transitive라 메이저 업그레이드 없이 해소
   불가. Critical 0 유지 중이므로 회귀 리스크 감수 대신 보류 (배포 파이프라인 안정 우선).
6. **P1-6**(PG 택1·NDC 스텁): 구조적 한계로 Stage 2~3 계약 시점에 설계 결정 필요.

## 4. 게이트 실측 (2026-11-24)

- 유닛: 349건 중 **344 pass, 0 fail, 5 skip** (신규 5건 포함)
- 타입체크: worker·admin·partner 모두 exit 0 / 브랜딩 가드 PASS (556 파일)
- e2e(엔터티 게이트 2건, 로컬): **2/2 PASS**
- Nuxt 빌드: 성공 (플러그인·헤더 규칙 번들 내장 확인)
- 운영 원격 백업(읽기전용): 93/93 테이블·799행 덤프 + **RESTORE-VERIFY PASS**
- 위생 SQL: 로컬 D1 전건 성공 + 효과 확인 (수용량 NULL 0건)

## 5. 승인 항목 실행 결과 (2026-11-24 후반 — 전건 완료)

1. **위생 SQL 운영 실행**: 사전 백업 후 실행, 사후 확인 전건 일치
   (제휴 3사 `is_active=0`·키 삭제, 수용량 NULL 0건, 호텔 14/14 좌표, 활성 파트너 3건).
2. **배포**: [`5eb9583`](https://github.com/dnjstjqppk-dev/ota-hub/commit/5eb9583) 푸시 →
   CI [#45321459120](https://github.com/dnjstjqppk-dev/ota-hub/actions/runs/45321459120) 성공 후 배포.
   운영 재측정: 목록 6종·상세 3종 **전부 200** (P0-1 해소), 3포털 보안 헤더 4종 송출 (P1-1 해소).
3. **`Weekly D1 Backup` 수동 실행**: [#45324043667](https://github.com/dnjstjqppk-dev/ota-hub/actions/runs/45324043667)
   **success** — 덤프 93/93 테이블·820행, `RESTORE-VERIFY PASS` (P0-2 해소).

Stage 1 코드·운영 조치는 종료. 정식 상용화는 Stage 2~3(도메인·시크릿·사업자·계약·법무) 완료 후 재판정.
