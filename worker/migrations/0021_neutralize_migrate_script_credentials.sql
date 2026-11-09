-- 0021: neutralize the shared hash planted by the retired scripts/migrate-d1.js.
-- That script seeded ptn_htl_01/ptn_tour_01/ptn_car_01 with ONE shared PBKDF2
-- hash+salt and reset it on every run (2026-11-09 audit [B]). The script is now
-- a refusal stub, and this migration closes the hole for any database where it
-- ever ran — mirroring 0010, which neutralized the older 0003-planted hash.
--
-- The UPDATEs below only touch rows that still carry the published hash, so an
-- operator who already rotated a password keeps their value. The replacement is
-- not a valid hash format, so verifyPassword() always rejects it.
-- Rotate to a real password with: node scripts/rotate-partner-password.mjs <email> <new-password> --execute --remote
UPDATE partners
SET password_hash = 'DISABLED_BY_0021_ROTATE_BEFORE_LOGIN'
WHERE id IN ('ptn_htl_01', 'ptn_car_01', 'ptn_tour_01')
  AND password_hash = 'pbkdf2:sha256:100000:4a78ff00cace8af97d13f3ecfcc6b9fd:08e886547510d833517452c8ff882b2584009810c41c83c05d67a66869b915a5';

UPDATE partner_staff
SET password_hash = 'DISABLED_BY_0021_ROTATE_BEFORE_LOGIN'
WHERE id IN ('stf_hotel_01', 'stf_car_01', 'stf_tour_01')
  AND password_hash = 'pbkdf2:sha256:100000:4a78ff00cace8af97d13f3ecfcc6b9fd:08e886547510d833517452c8ff882b2584009810c41c83c05d67a66869b915a5';
