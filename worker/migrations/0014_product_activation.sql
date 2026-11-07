-- 0014: partner-managed product activation flags.
-- Partners "stop selling" via is_active = 0 instead of hard delete so booking
-- history that references item_id stays intact. Public lists hide inactive rows.
ALTER TABLE hotels ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE cars ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE activities ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
