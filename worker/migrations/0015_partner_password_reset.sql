-- 0015: partner password-reset tokens share the users reset table.
-- partner_id set => partner/staff account; user_id set => customer account.
ALTER TABLE password_reset_tokens ADD COLUMN partner_id TEXT;
