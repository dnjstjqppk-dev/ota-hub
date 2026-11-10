-- 0033: C8 stock-photo & fabricated-score cleanup (activation flags already
-- exist on all 7 catalog tables via 0014/0017).

-- Drop fabricated seed amenities only on rows carrying stock photos (the same
-- fabricated batch). Partner-entered rows (upload URLs or NULLs) are untouched.
UPDATE hotels SET amenities_json = '[]' WHERE thumbnail_url LIKE '%unsplash%' OR images_json LIKE '%unsplash%';

-- Stock photos out (partner uploads replace them); scores recomputed from real
-- reviews, NULL when none exist yet.
UPDATE hotels SET thumbnail_url = NULL WHERE thumbnail_url LIKE '%unsplash%';
UPDATE hotels SET images_json = '[]' WHERE images_json LIKE '%unsplash%';
UPDATE hotels SET review_count = (SELECT COUNT(*) FROM reviews WHERE domain_type = 'HOTEL' AND target_id = hotels.id);
UPDATE hotels SET review_score = (SELECT AVG(rating) FROM reviews WHERE domain_type = 'HOTEL' AND target_id = hotels.id);
UPDATE cars SET image_url = NULL WHERE image_url LIKE '%unsplash%';
UPDATE transfers SET image_url = NULL WHERE image_url LIKE '%unsplash%';
UPDATE activities SET thumbnail_url = NULL WHERE thumbnail_url LIKE '%unsplash%';
UPDATE activities SET review_count = (SELECT COUNT(*) FROM reviews WHERE domain_type = 'ACTIVITY' AND target_id = activities.id);
UPDATE activities SET review_score = (SELECT AVG(rating) FROM reviews WHERE domain_type = 'ACTIVITY' AND target_id = activities.id);
UPDATE packages SET thumbnail_url = NULL WHERE thumbnail_url LIKE '%unsplash%';
UPDATE packages SET details_json = json_set(details_json, '$.gallery', json('[]')) WHERE details_json LIKE '%unsplash%';
