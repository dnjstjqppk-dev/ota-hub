-- 0047: commercial readiness (CR-01..CR-06, COMMERCIAL_READINESS_AUDIT.md §7).
-- Additive only: new columns default to "nothing changed" and new tables are empty.

-- CR-01 reviews: photo reviews, partner replies, operator moderation.
-- partner_id is denormalized from the backing booking so a partner's review
-- inbox is one indexed scan (reviews are only accepted with a booking_id).
ALTER TABLE reviews ADD COLUMN photos_json TEXT;
ALTER TABLE reviews ADD COLUMN partner_id TEXT;
ALTER TABLE reviews ADD COLUMN partner_reply TEXT;
ALTER TABLE reviews ADD COLUMN partner_replied_at TEXT;
ALTER TABLE reviews ADD COLUMN is_blinded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reviews ADD COLUMN blinded_reason TEXT;
UPDATE reviews SET partner_id = (SELECT b.partner_id FROM bookings b WHERE b.id = reviews.booking_id)
 WHERE booking_id IS NOT NULL AND partner_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_partner ON reviews (partner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews (created_at);

-- CR-02 support ticket threads. The legacy single admin_note is carried over as
-- the first operator message (deterministic id keeps the backfill idempotent).
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  author_type TEXT NOT NULL CHECK (author_type IN ('USER', 'ADMIN')),
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON support_ticket_messages (ticket_id, created_at);
INSERT OR IGNORE INTO support_ticket_messages (id, ticket_id, author_type, author_id, body, created_at)
  SELECT 'tmsg_legacy_' || id, id, 'ADMIN', 'legacy', admin_note, updated_at
  FROM support_tickets WHERE admin_note IS NOT NULL AND admin_note <> '';

-- CR-03 booking conversation between the customer and the selling partner.
-- Operators read every thread and may post as ADMIN.
CREATE TABLE IF NOT EXISTS booking_messages (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('USER', 'PARTNER', 'ADMIN')),
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_booking_messages_booking ON booking_messages (booking_id, created_at);
CREATE TABLE IF NOT EXISTS booking_message_reads (
  booking_id TEXT NOT NULL,
  reader_type TEXT NOT NULL CHECK (reader_type IN ('USER', 'PARTNER', 'ADMIN')),
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (booking_id, reader_type)
);

-- CR-05 marketing slots: hero banners, strip banners, popups, curated home picks.
-- A HOME_PICK references a live catalog product (domain_type + item_id); the
-- public read drops picks whose product is gone or inactive.
CREATE TABLE IF NOT EXISTS marketing_slots (
  id TEXT PRIMARY KEY,
  placement TEXT NOT NULL CHECK (placement IN ('HERO', 'STRIP', 'POPUP', 'HOME_PICK')),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  link_url TEXT,
  domain_type TEXT,
  item_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  starts_at TEXT,
  ends_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_marketing_slots_live ON marketing_slots (placement, is_active, sort_order);

-- CR-06 social login identities. One provider account maps to exactly one user.
CREATE TABLE IF NOT EXISTS user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL CHECK (provider IN ('KAKAO', 'GOOGLE', 'NAVER')),
  provider_user_id TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_identities_provider ON user_identities (provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id);
