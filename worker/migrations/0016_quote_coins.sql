-- 0016: coin spend at checkout. Coins are a platform-funded discount: they reduce
-- the cash due on a quote/booking and are added to the discount leg so supplier
-- settlement (gross-based) and the ledger stay unchanged. 1 coin = 1 KRW.
ALTER TABLE quotes ADD COLUMN coins_minor INTEGER NOT NULL DEFAULT 0;
