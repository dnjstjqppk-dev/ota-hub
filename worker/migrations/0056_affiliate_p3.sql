-- 0056: Phase 3 affiliate deeplinks — Travelpayouts registry + dashboard indexes.
-- The row ships INACTIVE: /out/travelpayouts 404s until the operator stores
-- the contracted marker/secret and flips is_active. Sub-ids ({sub_id}) are
-- HMAC-minted per click (see worker/src/affiliate/partner-links.ts), never seeded.
INSERT OR IGNORE INTO affiliate_partners_config (partner_id, name, deep_link_template, affiliate_id, secret_key, is_active) VALUES
('travelpayouts', 'Travelpayouts', 'https://search.hotellook.com/?marker={affiliate_id}&sub_id={sub_id}&destination={item_id}', 'SET_VIA_WRANGLER_D1_MARKER', 'SET_VIA_WRANGLER_D1_SECRET_TRAVELPAYOUTS', 0);
CREATE INDEX IF NOT EXISTS idx_aff_clicks_partner_day ON affiliate_clicks (partner_name, created_at);
CREATE INDEX IF NOT EXISTS idx_aff_clicks_sub ON affiliate_clicks (sub_id);
CREATE INDEX IF NOT EXISTS idx_aff_conv_status ON affiliate_conversions (status);
