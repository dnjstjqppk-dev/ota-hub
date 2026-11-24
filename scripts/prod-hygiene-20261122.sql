-- prod-hygiene-20261122.sql — Stage 1 운영 D1 위생 (audit §3–§4)
--
-- 실행 (승인 후, 로컬 인증 필요):
--   npx wrangler d1 execute ota_production --remote --file scripts/prod-hygiene-20261122.sql
-- 롤백: 실행 전 `node scripts/backup-d1.js --out backups` 로 덤프 확보.
--
-- 의도적 KEEP (삭제/수정 금지):
-- - bookings.bkg-init-001 (MANUAL_REVIEW_REQUIRED): scripts/verify-production.js
--   P0-06 IDOR/Admin/P0-04 테스트의 라이브 픽스처. 삭제 시 운영 검증이 깨짐.
-- - partners ptn_htl_01/ptn_tour_01/ptn_car_01: 카탈로그 partner_id 기본값으로
--   참조 중. 실파트너 교체 시 상품 remap과 함께 처리 (인간 결정 필요).
-- - affiliate travelpayouts 행: 이미 is_active=0 (0056 설계대로). 손대지 않음.

-- ── Step 0. 사전 확인 (읽기 전용 — 먼저 --command 로 실행) ──────────────
-- SELECT partner_id, affiliate_id, is_active FROM affiliate_partners_config;
-- SELECT COUNT(*) FROM activities WHERE daily_capacity IS NULL;
-- SELECT id, email, company_name, is_active FROM partners WHERE email LIKE 'verify\_%@partner.getfortrip.com' ESCAPE '\' OR email LIKE 'applicant\_%@partner.getfortrip.com' ESCAPE '\';
-- SELECT id, company_name, is_active FROM partners WHERE id = 'ptn_mw62m1m2_yaoxd';

-- ── P0-3. 더미 제휴 시크릿 비활성화 ─────────────────────────────────────
-- 저장소에 노출된 더미 HMAC 키가 운영에서 ACTIVE였음 (/out/ 리다이렉트 및
-- 가짜 전환 포스트백 위조 가능). is_active=0 + secret_key='' 로 완전 차단
-- (affiliate.ts: /out/는 ACTIVE 요구, 포스트백은 ACTIVE + 24자 이상 키 요구).
UPDATE affiliate_partners_config SET is_active = 0, secret_key = '' WHERE partner_id IN ('agoda', 'klook', 'myrealtrip');

-- ── P1-2. activities 수용량 NULL 해소 (시드 기본값 30) ──────────────────
UPDATE activities SET daily_capacity = 30 WHERE daily_capacity IS NULL;

-- ── P1-2. 호텔 실좌표 (전 14건이 롯폰기 한 점에 찍혀 있었음) ─────────────
-- frontend-user/data/hotelCatalog.ts 와 동일 값 (랜드마크 실측 좌표).
UPDATE hotels SET latitude = 37.5125, longitude = 127.1025 WHERE id = 'htl_seoul_01';
UPDATE hotels SET latitude = 37.5553, longitude = 127.0052 WHERE id = 'htl_seoul_02';
UPDATE hotels SET latitude = 37.5079, longitude = 127.0613 WHERE id = 'htl_seoul_03';
UPDATE hotels SET latitude = 35.6595, longitude = 139.7292 WHERE id = 'htl_tokyo_01';
UPDATE hotels SET latitude = 35.6852, longitude = 139.6913 WHERE id = 'htl_tokyo_02';
UPDATE hotels SET latitude = 35.6894, longitude = 139.6915 WHERE id = 'htl_tokyo_03';
UPDATE hotels SET latitude = 34.663, longitude = 135.5025 WHERE id = 'htl_osaka_01';
UPDATE hotels SET latitude = 34.7055, longitude = 135.5005 WHERE id = 'htl_osaka_02';
UPDATE hotels SET latitude = 13.7168, longitude = 100.5133 WHERE id = 'htl_bangkok_01';
UPDATE hotels SET latitude = 13.7209, longitude = 100.5334 WHERE id = 'htl_bangkok_02';
UPDATE hotels SET latitude = 33.5902, longitude = 130.4108 WHERE id = 'htl_fukuoka_01';
UPDATE hotels SET latitude = 33.5898, longitude = 130.3986 WHERE id = 'htl_fukuoka_02';
UPDATE hotels SET latitude = 48.8537, longitude = 2.2876 WHERE id = 'htl_paris_01';
UPDATE hotels SET latitude = 48.8713, longitude = 2.3316 WHERE id = 'htl_paris_02';

-- ── P1-3. QA 잔재 파트너 비활성화 (삭제 아님 — FK 보존) ──────────────────
-- verify_*/applicant_*@partner.getfortrip.com = verify-production.js 자가생성 QA 계정.
UPDATE partners SET is_active = 0 WHERE email LIKE 'verify\_%@partner.getfortrip.com' ESCAPE '\' OR email LIKE 'applicant\_%@partner.getfortrip.com' ESCAPE '\';
UPDATE partner_api_keys SET is_active = 0, revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE partner_id IN (SELECT id FROM partners WHERE email LIKE 'verify\_%@partner.getfortrip.com' ESCAPE '\' OR email LIKE 'applicant\_%@partner.getfortrip.com' ESCAPE '\');
-- 플레이스홀더 ("운영 파트너(정보 업데이트 예정)") 비활성화.
UPDATE partners SET is_active = 0 WHERE id = 'ptn_mw62m1m2_yaoxd';

-- ── Step 4. 사후 확인 (읽기 전용) ───────────────────────────────────────
-- SELECT partner_id, is_active, LENGTH(secret_key) FROM affiliate_partners_config;
-- SELECT COUNT(*) FROM activities WHERE daily_capacity IS NULL;
-- SELECT COUNT(DISTINCT latitude || ',' || longitude) FROM hotels;
-- SELECT id, email, is_active FROM partners WHERE is_active = 1;
