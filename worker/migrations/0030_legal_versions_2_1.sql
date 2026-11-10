-- 0030: legal version bump for Phase 3 (A6/A7). Privacy gains the
-- processor/cross-border transfer table + CPO binding; terms splits the
-- sales-type disclosure (1P direct / 3P agency / affiliate).
UPDATE legal_documents SET version = '2.1', effective_from = '2026-11-10', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug IN ('terms', 'privacy');
