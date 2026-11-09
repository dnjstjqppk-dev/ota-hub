-- 0025: resolve dangling marketplace seed references (2026-11-09 audit [m]).
-- 0005's catalog attribution rows point at upstream supplier ids that were
-- never registered. Register them as unintegrated placeholders so the ids
-- resolve; nothing sells through them (NOT_INTEGRATED is never bookable).
-- Also unsticks ing_sample_02: it was seeded PUBLISHED with no published
-- item, a state the publish flow refuses to touch. REVIEWED = awaiting publish.
INSERT OR IGNORE INTO suppliers (id, name, product_domain, adapter, integration_status, transaction_model, notes) VALUES
('sup_airalo_01', 'Airalo (미계약)', 'ESIM', 'none', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_chubb_01', 'Chubb (미계약)', 'INSURANCE', 'none', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_korail_01', 'Korail (미계약)', 'TRAIN', 'none', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_koreanair_01', 'Korean Air (미계약)', 'FLIGHT', 'none', 'NOT_INTEGRATED', 'MERCHANT_OF_RECORD', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_shilla_01', '신라호텔 (미계약)', 'HOTEL', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_lotte_01', '롯데월드 (미계약)', 'ACTIVITY', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_mobility_01', '모빌리티 (미계약)', 'CAR', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_tokyo_tower', '도쿄 타워 (미계약)', 'ACTIVITY', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.'),
('sup_bateaux_mouches', 'Bateaux-Mouches (미계약)', 'ACTIVITY', 'none', 'NOT_INTEGRATED', 'AGENCY', 'Upstream placeholder for 0005 marketplace seeds.');

UPDATE url_product_ingestions SET status = 'REVIEWED' WHERE id = 'ing_sample_02' AND status = 'PUBLISHED' AND published_item_id IS NULL;
