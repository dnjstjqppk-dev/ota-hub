# Muse 작업지시서 — getfortrip OTA (2026-11-25)

러너의 자동 진행(`/auto`)은 이 파일을 읽고 **"- [ ]" 카드를 위에서부터 하나씩** 맡긴다.
한 번에 카드 하나만 끝낸다. 끝낸 카드는 "- [x]"로 바꾸고, 같은 줄 끝에 결과를 한 줄로 적는다.
남은 카드가 없으면 마지막 답의 첫 줄에 `AUTOPILOT_DONE`을 쓴다.

## 현재 상태 (2026-11-25 기준)

- 실도메인이 운영 중이다. 아래 주소가 모두 200(www는 301)이다.

  | 주소 | 붙은 워커 |
  |---|---|
  | `https://getfortrip.com` | `ota-user` (SSR 사용자 포털) |
  | `https://www.getfortrip.com` | apex로 301 |
  | `https://admin.getfortrip.com` | `ota-admin` |
  | `https://partner.getfortrip.com` | `ota-partner` |
  | apex의 `/api/*`·`/out/*`·`/sitemap*`·`/llms*` | `ota-hub` (zone route) |

- **Cloudflare 계정:** 모든 리소스(워커 4개, `ota-hub-staging`, D1 `ota_production`·`ota_staging`, R2 2개)는 `f5c363135efe9b22ca66eb39f2f8e1da` 계정에 있다. 도메인 zone과 같은 계정이다. 예전 계정의 사본은 모두 지웠다.
- **workers.dev 주소:** `*.dnjstjq0824.workers.dev`. 스크립트·스모크·폴백 콘솔이 쓰므로 계속 켜 둔다(`workers_dev: true`).
- **도메인 연결 방식:** 대시보드 수작업이 아니라 각 wrangler 설정의 `routes`로 배포할 때 적용된다. 자세한 내용은 `docs/GO_LIVE_CHECKLIST.md` 4단계.
- **사업자등록 전이다.** PG·판매주체 ACTIVE·통신판매업 같은 상용 단계는 이 지시서의 범위가 아니다.

## 공통 규칙 (모든 카드)

- 로컬 구현과 로컬 테스트까지만 한다.
- **`git push` 금지.** main에 push하면 CI가 곧바로 운영에 배포한다.
- 카드마다 로컬 커밋은 해도 된다. post-commit 후크는 기본적으로 배포를 건너뛴다.
- 하지 않는 것:
  - `node scripts/build-and-deploy.js`, `npm run deploy`, `DEPLOY=1`
  - `wrangler deploy`, `wrangler secret`, `wrangler d1 ... --remote`, `wrangler r2 ... --remote`
- 운영에 보내도 되는 요청은 **인증 없는 읽기 전용 GET뿐**이다(`node scripts/smoke-production.js` 같은 것).
- `scripts/verify-production.js`를 운영 대상으로 돌리지 않는다. 비밀번호가 필요하고 QA 행을 쓴다.
- 수정 금지:
  - 모든 `wrangler*.jsonc`의 `account_id`·`routes`·`database_id`·`workers_dev`
  - `.github/**`
  - 이미 있는 `worker/migrations/*.sql`
  - `.env*`
  - `reports/**` (과거 기록이라 그대로 둔다)
- pre-commit 브랜드 가드가 다른 OTA 브랜드 이름을 거부한다. 문서에도 쓰지 않는다.
- Windows 환경이다.
  - `node --test`에는 디렉터리가 아니라 파일 글롭을 넘긴다.
  - `python3`는 동작하지 않는 스텁이니 스크립트는 node로 쓴다.
  - Vue 파일 다수가 CRLF다. 줄바꿈을 유지한다.
- `npm --prefix frontend-user run build`를 하면 추적 파일 `frontend-user/.output/public/.gitkeep`이 지워진다. 빌드 뒤 `git checkout frontend-user/.output/public/.gitkeep`으로 되돌린다.
- 끝내기 전에 바뀐 쪽의 검사를 모두 통과시킨다.
  - 워커: `npm run typecheck` + `npm test`
  - 포털: 해당 포털 `npm test`, 그리고 타입체크(admin·partner는 `npx vue-tsc --noEmit`, user는 `npm run typecheck`)
  - 스크립트: `node --check <파일>`
- 판단이 필요한 곳은 가장 보수적으로, 최소한만 바꾸고 결과 줄에 적는다. 사람에게 되묻지 않는다.

## 카드

- [x] **M1 IndexNow 키 파일 실제로 서빙** — 지금 `worker/src/seo/indexnow.ts`의 `keyLocation`은 `https://{host}/{key}.txt`인데, 이 경로를 서빙하는 곳이 없다. apex는 `ota-user`가 받고, hub에는 핸들러가 없다. 그래서 `INDEXNOW_KEY`를 넣는 순간 소유 검증이 실패한다. `keyLocation`을 hub가 받는 경로인 `https://{host}/api/v1/seo/indexnow/{key}.txt`로 바꾼다. hub는 경로의 key가 `env.INDEXNOW_KEY`와 정확히 같을 때만 `text/plain` 본문 = key로 200을 돌려주고, 아니면 404를 돌려준다. 키가 없을 때도 404다. 완료 조건: 페이로드의 keyLocation, 일치 200, 불일치·미설정 404를 확인하는 유닛 테스트 추가, `npm run typecheck`·`npm test` 통과. → 완료: keyLocation을 `/api/v1/seo/indexnow/{key}.txt`로 변경, hub 핸들러+유닛 테스트 추가, typecheck 0오류·npm test 370pass/0fail/5skip.
- [x] **M2 스모크에 실도메인 점검 추가** — `scripts/smoke-production.js`에 `SITE_URL` 환경변수를 추가한다. 기본값은 `https://getfortrip.com`이고, 빈 문자열이면 아래 점검을 건너뛴다. 추가할 GET 점검(전부 읽기 전용, `redirect: 'manual'`):
  - apex 루트 200 HTML
  - `https://www.<도메인>/hotels?probe=1` → 301, Location이 apex의 같은 경로·쿼리
  - `admin.`·`partner.` 루트 200
  - apex `/api/v1/health` 200
  - apex `/sitemap.xml` 200 + `<urlset` 포함 (hub route 경유 증명)

  `scripts/deploy-staging.js`는 스테이징 스모크에 `SITE_URL=''`을 넘긴다. 그리고 지금은 사용자 포털 점검이 운영 `ota-user`를 찌르고 있으니, `USER_URL=''`이면 사용자 포털 점검을 건너뛰게 하고 스테이징에서는 그렇게 넘긴다. 완료 조건: `node --check` 통과, `node scripts/smoke-production.js`(운영 읽기 전용) 전부 PASS, `SITE_URL= node scripts/smoke-production.js`에서 도메인 점검이 SKIP으로 표시됨. → 완료: SITE_URL 6종 점검+USER_URL 스킵 추가, 스테이징은 둘 다 '' 전달, 운영 스모크 19종 전부 PASS·빈값 실행에서 SKIP 3건 표시 확인.
- [x] **M3 verify-production 도메인 토폴로지 테스트** — `scripts/verify-production.js`는 2026-11-25에 `getfortrip.com`도 운영으로 취급하도록 고쳤다(`PROD_DOMAIN`). 이 가드는 건드리지 않는다. 헤더 주석(5행 부근)에 실도메인을 운영 대상으로 명시한다. 그리고 읽기 전용 테스트 1개를 추가한다: `SITE_URL`(기본 `https://getfortrip.com`)의 apex·www 301·admin·partner·apex `/api/v1/health`. 운영에 대해 실행하지 말고 `node --check`로만 확인한다. 완료 조건: `node --check` 통과, 추가한 테스트가 쓰기 요청을 하지 않음을 결과 줄에 명시. → 완료: 헤더에 실도메인 운영 명시+51번 읽기 전용 테스트 추가(가드 미변경, 프롬프트 50→51). 추가 테스트는 인증 없는 GET 5건(apex·www 301·admin·partner·health)뿐이라 쓰기 요청 없음. `node --check` 통과, 운영 미실행.
- [ ] **M4 운영 문서 최신화 (도메인·계정 이전 반영)** — `docs/GO_LIVE_CHECKLIST.md` 1·2·3·4·5·6·7단계와 상단 전제 문단의 운영 명령 예시를 실도메인 `https://getfortrip.com/api/v1/...`로 바꾼다. 상단 verify 명령은 `BASE_URL=https://getfortrip.com`으로 바꾼다. "한눈에 보는 게이트" 표에 도메인 행(4단계 확인 항목)을 추가한다. `README.md`(있으면 `ARCHITECTURE.md`도)에는 호스팅 토폴로지 절을 추가하거나 갱신한다: 계정 1개, 워커 5개, custom domain·route 목록, workers.dev 유지 이유, 스테이징 주소. `docs/STAGING.md`에는 "2026-11-25 새 계정에서 재개통, 빈 DB에 마이그레이션 58개+시드로 새로 시작(이전 스테이징 데이터 없음)"을 적는다. `reports/**`는 수정하지 않는다. 완료 조건: `node scripts/check-branding.js` 통과, 문서 안 `dnjstjqppk` 0건(`git grep dnjstjqppk -- docs README.md ARCHITECTURE.md`).
- [ ] **M5 www의 정적 파일도 apex로 보내기** — `frontend-user/server/middleware/canonical-host.ts`는 페이지 요청만 301시킨다. `www.getfortrip.com/robots.txt` 같은 정적 파일은 Nitro(cloudflare-module)가 미들웨어보다 먼저 `ASSETS`로 내보내서 200이 된다(검색엔진 중복 신호). Nitro 설정이나 엔트리 수준에서 www 요청을 정적 파일보다 먼저 301시킬 수 있는지 조사해서 구현한다. 확인은 `npx wrangler dev -c frontend-user/wrangler.jsonc --port 8811 --local-upstream www.getfortrip.com`으로 띄운 뒤 `/robots.txt`·`/about`이 둘 다 301인지 본다. 이 방식에서는 Host 헤더로 시험할 수 없다. 깔끔한 방법이 없으면 코드를 바꾸지 말고 `docs/GO_LIVE_CHECKLIST.md` 4단계에 "대표 조치: Cloudflare Redirect Rule `www.getfortrip.com/*` → `https://getfortrip.com/$1` (301)"을 추가하고, 결과 줄에 그렇게 판단한 이유를 적는다. 완료 조건: 위 로컬 확인 결과, 또는 문서 추가 + 사유.

### 검색 최적화 — SEO + AEO·GEO·LLMO·AIO (대표 지시 2026-11-25)

대표 지시: 검색 최적화를 할 때 기존 SEO와 함께 AEO(답변 엔진), GEO(생성형 검색), LLMO(LLM 최적화), AIO(AI 개요) 대응 요소를 전부 넣는다.

**이미 있는 것 (다시 만들지 말 것):**
- `robots.txt` (AI 봇 8종 허용)
- `/llms.txt`, `/llms-full.txt` (`worker/src/seo/llms.ts`)
- `/sitemap-index.xml` + 도메인별 sitemap
- `useSeoPage`(canonical·hreflang 4개 로캘)
- `useJsonLd.ts`: Organization·WebSite+SearchAction·BreadcrumbList·ItemList·Hotel/LodgingBusiness·Product/Offer·Flight·TrainTrip·TouristTrip·FAQPage 빌더
- `SeoFaq.vue` 컴포넌트

**S 카드 공통 규칙:**
- **정직 원칙.** FAQ 답변·요약·평점·통계·날짜는 DB나 사이트에 이미 있는 실데이터·정책 문구에서만 만든다. 값이 없으면 그 항목을 출력하지 않는다. 지어낸 Q&A, 평점, "업계 1위" 같은 주장, 가짜 sameAs 링크는 금지다.
- **화면과 구조화 데이터가 같아야 한다.** JSON-LD에 넣은 Q&A·가격·평점은 화면에도 같은 값으로 보여야 한다.
- 사용자 문구는 ko/en/ja/zh 4개 로캘 모두 넣는다(`frontend-user/i18n/locales`).
- 사용자 포털을 바꿨으면 `npm --prefix frontend-user test`와 `npm --prefix frontend-user run typecheck`를 통과시킨다.

- [ ] **S1 robots.txt 그룹 버그 수정 + AI 봇 정비** — 지금 이름이 있는 봇 그룹(GPTBot 등)에는 `Allow: /`만 있다. robots 규칙상 이름이 있는 그룹은 `*` 그룹을 상속하지 않으므로, 이 봇들에게는 `/my`·`/api`·`/checkout` 등도 허용된 상태다. 모든 이름 그룹에 `*` 그룹과 같은 Disallow 목록을 넣는다. 답변·검색용 봇도 같은 규칙으로 추가한다: `ChatGPT-User`, `Claude-User`, `Claude-SearchBot`, `Perplexity-User`, `Applebot`, `Applebot-Extended`, `Amazonbot`, `DuckAssistBot`, `meta-externalagent`, `Daumoa`. 학습·검색 허용 정책 자체는 지금처럼 허용으로 유지한다. 완료 조건: `frontend-user/tests`의 robots 테스트를 확장해 "모든 User-Agent 그룹이 비공개 경로를 Disallow"를 검증, 테스트 통과.
- [ ] **S2 AEO — FAQ 실제 배선** — `SeoFaq.vue`는 어디에도 쓰이지 않아서 FAQPage 스키마가 한 번도 나가지 않는다. 다음 페이지에 연결한다.
  - 7개 도메인 랜딩(`/hotels`·`/flights`·`/trains`·`/cars`·`/transfers`·`/things-to-do`·`/packages`), `/faq`, `/help`, `/esim`, `/insurance`
  - Q&A는 이미 사이트에 있는 정책·도움말 문구(약관·환불 규정·FAQ 페이지 i18n 키)에서 페이지 주제에 맞는 것만 가져온다. 예: 취소·환불, 결제 수단, 바우처 수령, 가격에 포함된 세금.
  - 답변 첫 문장은 질문에 바로 답하는 한 문장(answer-first)으로 쓰고, 뒤에 근거 정책 페이지 링크를 붙인다.

  완료 조건: 각 페이지 SSR HTML에 화면 Q&A와 1:1로 같은 FAQPage JSON-LD가 있음을 검사하는 테스트, 테스트 통과.
- [ ] **S3 AEO — 상세 페이지 답변 블록 + speakable** — 호텔·투어·렌터카·픽업·패키지 상세에 "한눈에 보기" 요약을 넣는다. 2~3문장, 실데이터 필드로만 만든다: 위치·체크인/아웃·취소 규정·포함 사항·최저가 KRW. 상품 필드에 값이 있을 때만 그 상품 전용 FAQ(체크인 시간, 취소 가능 여부, 포함 사항 등)를 만든다. 요약 블록에는 `speakable`(cssSelector) WebPage 스키마를 단다. 완료 조건: 필드가 비어 있으면 해당 문장·FAQ가 출력되지 않는 테스트, 테스트 통과.
- [ ] **S4 LLMO — 페이지별 마크다운 사실 시트** — hub에 `GET /api/v1/seo/md/{domain}/{id}`를 추가한다(apex `/api/*` route로 이미 노출됨). 응답은 `text/markdown`이고, 상품명·도시·가격(KRW, 세금 기준 명시)·판매 방식(직판/제휴)·취소 규정·평점(검증 리뷰 수와 함께, 0건이면 생략)·정규 URL·최종 갱신 시각을 담는다. 비활성·비공개 상품은 404다. 상세 페이지 `<head>`에 `<link rel="alternate" type="text/markdown" href="...">`를 넣고, `llms-full.txt`의 "Catalog detail routes"에 이 경로 패턴을 추가한다. robots.txt는 `/api/`를 막고 있으므로 모든 그룹에 `Allow: /api/v1/seo/`를 `Disallow: /api/`보다 위에 넣는다(RFC 9309 최장 일치 규칙). M1의 IndexNow 키 파일도 이 경로로 열린다. 완료 조건: 워커 유닛 테스트(형식·404·평점 0건 생략), `npm run typecheck`·`npm test` 통과.
- [ ] **S5 GEO — llms.txt 실데이터화 + 다국어** — `llms-full.txt`에 D1에서 집계한 사실을 넣는다: 도메인별 공개 상품 수, 주요 도시 목록, 가격 범위(KRW), 지원 결제 통화, 지원 로캘, 마지막 집계 시각. 1시간 캐시이고 테이블이 없으면 그 줄만 생략한다. `/llms.txt`에 로캘 경로(`/en`·`/ja`·`/zh`) 안내를 추가한다. 회사 사실(상호·대표·주소·사업자번호)은 `runtimeConfig`나 env에 값이 있을 때만 넣는다. 지금은 비어 있으니 출력하지 않는다. 완료 조건: 빈 DB에서도 200, 숫자는 쿼리 결과와 같음을 확인하는 유닛 테스트, 테스트 통과.
- [ ] **S6 GEO·AIO — 엔티티와 신선도 신호** — Organization JSON-LD에 `logo`·`url`을 넣는다. `contactPoint`는 회사 CS 값이 설정됐을 때만, `sameAs`는 새 env `NUXT_PUBLIC_SAME_AS`(쉼표 목록)가 비어 있지 않을 때만 넣는다. 상세·정책 페이지에 DB `updated_at`(정책은 문서 개정일)을 "최종 업데이트"로 화면에 보이고 `dateModified`로도 넣는다. 모든 상세 페이지에 BreadcrumbList가 나오는지 확인하고, 빠진 도메인은 채운다. 완료 조건: sameAs·contactPoint 미설정 시 미출력, 설정 시 출력하는 테스트, 테스트 통과.
- [ ] **S7 AIO — 상품 구조화 데이터 완전성** — 상세 Offer에 `price`·`priceCurrency`(KRW)·`availability`(판매 가능 여부에서 매핑)·`url`을 빠짐없이 넣고, 견적 유효 규칙이 있으면 `priceValidUntil`도 넣는다. `aggregateRating`은 검증 리뷰가 1건 이상일 때만 넣는다(기존 규칙 유지 확인). 목록 페이지 ItemList에 `url`·`position`이 맞는지 확인한다. 완료 조건: 리뷰 0건이면 rating 없음, 품절이면 `OutOfStock`인지 확인하는 테스트, 테스트 통과.
- [ ] **S8 sitemap 신선도 + hreflang + IndexNow 연동** — 도메인 sitemap의 각 `<url>`에 그 상품의 `updated_at` 기반 `<lastmod>`를 넣는다(없으면 생략). `xhtml:link` hreflang 대체 URL 4개 로캘과 x-default를 넣는다. 상품 생성·수정·비활성화 때 IndexNow 큐에 URL을 넣는 경로가 있는지 확인하고, 없으면 연결한다. 키가 없으면 큐잉하지 않는다(M1 이후). 완료 조건: sitemap 유닛 테스트(lastmod·hreflang·XML 이스케이프), 테스트 통과.
- [ ] **S9 국내 검색엔진·소유 확인 메타** — `NUXT_PUBLIC_NAVER_SITE_VERIFICATION`, `NUXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env가 있을 때만 `<meta name="naver-site-verification">`·`<meta name="google-site-verification">`를 출력한다. og:image·og:locale·twitter:card가 모든 공개 페이지에 있는지 확인하고, 빠진 곳을 채운다. 네이버용 RSS `/rss.xml`(특가·신규 상품 최신 50개, 실데이터)을 hub에 추가하고, robots.txt에 hub route가 필요한지 확인한다. apex `/rss.xml`은 지금 route에 없으므로, route 추가가 필요하면 결과 줄에 "대표 조치: wrangler.jsonc routes에 `getfortrip.com/rss.xml` 추가 필요"라고 적는다(직접 수정 금지). 완료 조건: env 유무별 메타 출력 테스트, RSS 유닛 테스트, 테스트 통과.
- [ ] **S10 AI 유입 측정 + 로컬 SEO 감사 스크립트** — 분석 이벤트(`analytics_events`)에 유입 출처 분류를 추가한다. referrer나 utm에서 AI 답변 엔진(chatgpt.com·chat.openai.com·perplexity.ai·copilot.microsoft.com·gemini.google.com·claude.ai 등)을 `ai_answer`로 분류하고, 관리자 인사이트에서 출처별 세션 수를 볼 수 있게 한다. `scripts/seo-audit.mjs`도 만든다: 로컬 `wrangler dev`나 `vite preview` 대상으로 주요 공개 페이지의 title·description·canonical·hreflang·JSON-LD 파싱 가능 여부·FAQ 화면/스키마 일치·robots 메타를 점검하고 실패 시 exit 1. 운영 대상 실행은 GET만이므로 허용한다. 완료 조건: 분류 유닛 테스트, 감사 스크립트 로컬 실행 결과를 결과 줄에 요약, 테스트 통과.

## 이번 자동 진행에서 하지 않는 것 (대표 조치 목록)

아래는 사람(대표)이 직접 해야 한다. Muse는 손대지 않는다.

- **CI 배포 토큰:** GitHub 저장소 시크릿 `CLOUDFLARE_API_TOKEN`에 `getfortrip.com` zone 권한을 추가해야 한다. 2026-11-25 run 45562298648 결과는 아래와 같다.
  - fast·E2E는 통과했다. 새 계정의 D1 확인과 `ota-hub` 업로드도 성공했다.
  - zone route 갱신은 `No access to the specified resource`로 실패했다.
  - 운영은 영향이 없었다. 같은 코드였고, 기존 route가 유지됐다.
  - 필요한 권한: **Zone → Workers Routes: Edit**, **Zone → DNS: Edit**, **Zone → Zone: Read** (대상 zone `getfortrip.com`). 고치기 전에는 push 배포가 계속 실패한다.
- **메일:** Resend에서 `getfortrip.com` 발신 도메인 인증(SPF·DKIM·DMARC DNS 레코드)을 하고, `RESEND_API_KEY` 시크릿과 `EMAIL_FROM` vars를 넣는다.
- **소셜 로그인:** 카카오·구글·네이버 콘솔에 리다이렉트 URI `https://getfortrip.com/api/v1/auth/oauth/{kakao|google|naver}/callback`을 등록하고 `OAUTH_*` 키를 넣는다.
- **검색엔진:** Google Search Console·네이버 서치어드바이저에 사이트 소유 인증(DNS TXT)을 하고 `https://getfortrip.com/sitemap-index.xml`을 제출한다.
- **사업자등록 이후:** `docs/GO_LIVE_CHECKLIST.md` 1~3단계(판매주체·직영 상품·PII 키)와 7~9단계(토스·Stripe 키, 웹훅)를 진행한다.
- 운영 배포, 원격 DB 마이그레이션, 시크릿 변경.
