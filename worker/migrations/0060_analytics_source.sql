-- 0060: traffic-source attribution on analytics events (S10).
-- source: ai_answer|organic|social|paid|referral|direct, NULL for pre-S10 rows
-- (unknown, honestly distinct from measured direct). session_id: portal tab
-- session for session dedupe (SSR/API-only traffic has none).
ALTER TABLE analytics_events ADD COLUMN source TEXT;
ALTER TABLE analytics_events ADD COLUMN session_id TEXT;
