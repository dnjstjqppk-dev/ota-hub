-- 0010: neutralize the well-known seed partner credentials.
-- 0003 planted three partners (and three staff rows) with the password
-- 'Partner2026!SecureKey', which was also printed on the extranet login page.
-- Any database that ran 0003 must stop accepting that password.
--
-- The UPDATEs below only touch rows that still carry the published hash, so an
-- operator who already rotated a password keeps their value. The replacement is
-- not a valid hash format, so verifyPassword() always rejects it.
-- Rotate to a real password with: node scripts/rotate-partner-password.mjs <email> <new-password> --execute --remote
UPDATE partners
SET password_hash = 'DISABLED_BY_0010_ROTATE_BEFORE_LOGIN'
WHERE id IN ('ptn_htl_01', 'ptn_car_01', 'ptn_tour_01')
  AND password_hash = 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4';

UPDATE partner_staff
SET password_hash = 'DISABLED_BY_0010_ROTATE_BEFORE_LOGIN'
WHERE id IN ('stf_hotel_01', 'stf_car_01', 'stf_tour_01')
  AND password_hash = 'pbkdf2:sha256:100000:178c3ab91950c4dfa89b982f4f18a4f6:b591e05763c607026962d7d4fd4edb6182982c1d49e9ca77cad4dbba876785b4';
