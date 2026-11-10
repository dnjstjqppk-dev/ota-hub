-- 0036: affiliate outlink wiring for EXTERNAL_LINK_ONLY suppliers.
-- An AFFILIATE supplier sells nothing on GetForTrip; the catalog may emit an
-- /out/{partner}/{item} click-tracking link only when the operator maps the
-- supplier to a registered affiliate partner AND that partner is active with
-- an https deep-link template (checked at emit time and again at click time).
-- Unmapped suppliers keep the honest "not directly bookable" copy with no link.
ALTER TABLE suppliers ADD COLUMN outlink_partner_id TEXT NULL REFERENCES affiliate_partners_config(partner_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_outlink ON suppliers (outlink_partner_id);
