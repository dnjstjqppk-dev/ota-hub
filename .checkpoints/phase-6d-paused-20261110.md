# OTA checkpoint — Phase 6d COMPLETED (2026-11-11, commit 22df382)

## Completion record (2026-11-11 resume session)
- Rebuilt virgin DB `C:\tmp\e2e_6d3` (migrations 0001-0036 + catalog/transfer seeds + generated admin seed).
- Split-brain preflight green (API register → d1 hit → cleaned).
- Gates: fresh E2E 104/104 (100 + 4 new 6d), tsc 0, unit 83/83, build-all exit 0, branding PASS.
- Ledger #32-37 → [x]; commit `22df382` (31 files, SKIP_DEPLOY=1, no push).
- :8798 wrangler (pid 33004) stopped top-down; port free. OPEN_READINESS.md untouched (stale since d4443a4 — 6a-6c also ledger-only).
- Next: 6e (#38-47) → 6f (#48-57) → 6g (#58-65) → P2 → P3 → Phase 7.

--- Original paused note below ---

## Where we are
- Committed through Phase 6c: `00e947a` (P1 #23-27·#30-31).
- Phase 6d (P1 #32-37, 보안·권한): code + E2E tests DONE, uncommitted (31 files).
  Gates so far: `tsc 0`, unit 83/83, admin+partner+user builds pass.
  Fresh-E2E NOT yet green: first 6d run (e2e_6d) failed 2 tests due to my #36
  fixture pollution; fix applied; rerun on e2e_6d2 was CANCELLED mid-run.
  Server on :8798 was also cancelled. Nothing committed for 6d yet.

## 6d changes (all uncommitted, DO NOT LOSE — no checkout/reset)
Worker:
- `worker/src/lib/auth.ts`: `AuthJar` type, named `authCookie(token,env,name,maxAge)`,
  `clearAuthCookie()`. Jars: getfortrip_jwt / _admin_jwt / _partner_jwt.
- `worker/src/routes/auth.ts`: /admin/login sets admin jar; new POST
  /api/v1/admin/logout; new POST /api/v1/auth/me/password (#37: current-pw
  verify + policy + revoke + resetSubjectSessions + requireRelogin + clear jar).
- `worker/src/routes/partner.ts`: needOwner() on api-keys POST/DELETE (#32),
  webhook GET/PUT/rotate (#34); profile bank mask ****+last4 for non-owner (#33);
  partner login (staff+owner) sets partner jar with remember flag (7d vs session);
  new POST /api/v1/partner/logout.
- `worker/src/routes/marketplace.ts`: public /marketplace/catalog SELECT allowlist
  (#36: hides supply_cost/commission/payout/margin/external_sku/source_url/
  registered_by/supplier_id; keeps retail_price/seller_name/etc).
- `worker/test/e2e/api.e2e.mjs`: 4 new tests — #32/#33/#34 staff-vs-owner,
  #36 allowlist, #37 password change, #35 jar issuance + cookie-only auth.

Frontend (#35 memory-token + cookie restore, #37 UI):
- user: `composables/useApi.ts` (memory token, never localStorage),
  `stores/auth.ts` (rewritten: cookie restore via /auth/me, server logout),
  `pages/login.vue` (+credentials, ?changed=1 notice), `pages/register.vue`
  (+credentials), `pages/my/profile.vue` (#37 password form), `app.vue` (comment).
- admin: `config/api.ts` (memory token + credentials:include),
  `composables/session.ts` (saveSession→memory, restoreSession via /auth/me
  with memory-Bearer fallback, clearSession→POST /admin/logout),
  `router/index.ts` (async guard), `views/LoginView.vue` (/admin/login jar).
- partner: `config/api.ts` (rewritten: memory token, savePartnerInfo,
  clearPartnerSession→POST /partner/logout, restorePartnerSession via
  /partner/profile), `router/index.ts` (async guard), `views/LoginView.vue`
  (remember flag, NO document.cookie jar — deleted that line), all 11 other
  views + Login/Register/Forgot/Reset: `credentials: 'include'` on all 35
  fetch(apiUrl) calls (verified fetch-count == creds-count per file).
  `partnerToken()` returns '' (never null) so `Bearer ${...}` degrades to
  empty Bearer → server falls through to cookie. Never "Bearer null".

## Key findings recorded
- Prod topology: ota-hub serves API + user assets same-origin (cookies flow).
  Admin/partner SPAs are cross-origin on workers.dev staging (Lax cookies
  blocked → memory Bearer covers session, re-login after reload) but
  same-site on launch domains (getfortrip.com + subdomains → jars flow).
  Worker CORS already allows credentials + origin reflection (http.ts).
- Residual honesty note for ledger #35: active-session XSS can still read the
  in-memory token; persistent 7-day theft eliminated. Full cookie-only needs
  CSRF tokens (future work, out of 6d scope).
- #37: out of scope confirmed — partner ProfileView has NO password UI, so
  user-portal API+UI only. Admin using /auth/me/password clears user jar only
  (their admin jar survives but token is server-dead → re-login; acceptable).
- API-key sessions (requirePartner fallback) resolve to isOwner=true (no
  staffId) — pre-existing design, out of 6d scope, do NOT change silently.
- B3 settle 500 root cause seen in server log: CHECK amount_minor > 0 —
  triggered by CATALOG attribution from my #36 fixture (seller ptn_htl_01 is
  a supplier, not a partner). Fixture now uses scratch id htl_scratch_36 +
  finally-DELETE. #18 ghost test runs BEFORE #36 in file order — safe.

## Resume steps (in order)
1. `git status` — confirm 31 uncommitted files intact (incl. e2e test fix).
2. Restore build-deleted tracked file:
   `git checkout -- frontend-user/.output/public/.gitkeep`
   (deleted by Nuxt build; must NOT be part of the commit).
3. Rebuild virgin DB `C:\tmp\e2e_6d3` (migrations + seed-fresh).
   Hygiene: kill parent node of :8798 listener, verify port-free, start
   `wrangler dev --port 8798 --persist-to C:\tmp\e2e_6d2|6d3`, preflight /legal.
   NOTE: e2e_6d2 was seeded but its E2E run was cancelled mid-suite → dirty;
   use a fresh dir (e2e_6d3), do NOT reuse e2e_6d2 without wiping.
4. Full `npm run test:e2e` (BASE 8798, E2E_PERSIST_TO new dir) → expect 104/104
   (100 + 4 new). If green: `node scripts/build-all.js`, branding check,
   then RESTORE snapshot JSONs if build-all repollutes from :8799
   (`git checkout -- frontend-user/data/generatedCatalog.json
   frontend-user/prerender-routes.json`; expect 62 routes).
5. Update `reports/COMMERCIALIZATION_GAPS_20261110.md` #32-37 → [x] (6d / files).
6. Atomic commit with `$env:SKIP_DEPLOY='1'` (post-commit hook auto-deploys!):
   staged file list = the 31 files MINUS .gitkeep restore (i.e. do not stage
   the .gitkeep deletion). Suggested msg: `Phase 6d (P1 #32-37): partner
   OWNER-only RBAC, bank masking, HttpOnly jars + memory tokens, catalog
   allowlist, password change`.
7. Continue: 6e (#38-47 이행·공급) → 6f (#48-57) → 6g (#58-65) → P2 → P3 → Phase 7.

## Standing constraints (still in force)
- Never `git checkout -- .` / `git reset --hard`. Local commits OK, never push.
- Per-phase gates: tsc 0 + unit + fresh isolated E2E + build-all + branding +
  ledger [x] + atomic commit. No fake business/key values in code.
- :8799 server is shared/protected — use 8797/8798 + C:\tmp\e2e_* only.
- E2E snapshot files stay clean-DB (62 routes).
