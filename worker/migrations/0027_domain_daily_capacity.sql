-- 0027: per-date sellable capacity for ACTIVITY / TRANSFER / PACKAGE.
--
-- P0 2026-11-10: these three domains loaded capacity=null, so holdTargets()
-- returned [] and BOTH the quote availability check and the guarded booking
-- hold INSERT were silently skipped — unlimited paid oversell on LIVE.
-- NULL (unset) now refuses sale with INVENTORY_NOT_CONFIGURED; operators set
-- daily_capacity per product (admin catalog PATCH / bulk) to open sales.
--
-- SAFETY (Phase 1 directive): the backfill below covers ONLY the known mock
-- seed ids. Every other existing row keeps daily_capacity = NULL and stays
-- unsellable until a partner/admin enters the real inventory — unverified
-- products must never inherit an arbitrary stock number.
ALTER TABLE activities ADD COLUMN daily_capacity INTEGER;
ALTER TABLE transfers ADD COLUMN daily_capacity INTEGER;
ALTER TABLE packages ADD COLUMN daily_capacity INTEGER;
UPDATE activities SET daily_capacity = 30 WHERE id IN (
  'act_disney_tokyo', 'act_usj_osaka', 'act_fuji_tour',
  'act_lotte_world', 'act_louvre_tour', 'act_esim_japan'
);
UPDATE transfers SET daily_capacity = 10 WHERE id IN (
  'tf_icn_van_01', 'tf_icn_sedan_01', 'tf_icn_comfort_01', 'tf_icn_luxury_01',
  'tf_gmp_van_01', 'tf_hnd_van_01', 'tf_nrt_van_01', 'tf_kix_van_01'
);
UPDATE packages SET daily_capacity = 16 WHERE id IN (
  'pkg_tokyo_4d3n', 'pkg_osaka_3d2n', 'pkg_bangkok_5d4n', 'pkg_paris_6d5n'
);
