-- 0023: per-product minimum sellable total (하한가, WO-OTA 09).
-- NULL (or absent policy row) = no floor. When set, quotes whose cash-due
-- total would fall below the floor are refused, so coupons/coins can never
-- push a protected product under its contracted minimum.
ALTER TABLE product_policies ADD COLUMN floor_price_minor INTEGER;
