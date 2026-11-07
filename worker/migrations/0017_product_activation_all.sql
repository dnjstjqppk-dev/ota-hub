-- 0017: activation flags for the remaining product tables (0014 covered hotels/cars/activities).
-- Admin "stop selling" flips is_active = 0; public lists hide inactive rows.
ALTER TABLE flights ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE trains ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE transfers ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE packages ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
