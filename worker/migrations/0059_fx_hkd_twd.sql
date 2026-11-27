-- Display-only FX reference rates for HK and TW country subdomains.
INSERT OR IGNORE INTO fx_rates (currency, symbol, rate_to_krw) VALUES
('HKD', 'HK$', 175.0),
('TWD', 'NT$', 42.0);
