-- 0035: marketplace ghost cleanup + affiliate conversion idempotency key.
--
-- #18: three ACTIVE marketplace rows point at domain items that never existed
-- (a Shilla item that is not in hotels, two ingest samples). They are removed
-- so the public catalog can no longer surface phantom products. (ESIM/INS
-- rows stay: their unquotability is handled separately by #40.)
-- #21: concurrent postbacks for one order both passed the NOT EXISTS check and
-- double-booked commission. A unique key makes double-insert impossible; any
-- pre-existing duplicates are collapsed to the earliest row first.

DELETE FROM marketplace_catalog_items
WHERE id IN ('mkt_htl_shilla_01', 'mkt_ing_sample_01', 'mkt_ing_sample_02');

DELETE FROM affiliate_conversions
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM affiliate_conversions GROUP BY partner_name, order_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_conv_once
  ON affiliate_conversions (partner_name, order_id);
